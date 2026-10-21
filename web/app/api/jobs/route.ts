import { NextRequest, NextResponse } from 'next/server';
import { getJobs, getCompanies, getLocations } from '@/lib/query';
import { POSITIVE_TAG_OPTIONS, EXPERIENCE_OPTIONS } from '@/lib/scoring';
import { DEPARTMENT_GROUPS } from '../../../../src/normalize/departments';
import { PROVIDERS } from '@/lib/providers';
import type { JobFilters } from '@/lib/types';
import { parseLocationValues } from '@/lib/location-filter';

const SOURCES = new Set<string>(PROVIDERS.map((p) => p.value));
const EMPLOYMENT_TYPES = new Set([
	'FullTime',
	'Intern',
	'Contract',
	'PartTime',
]);
const SORT_OPTIONS = new Set(['score', 'newest', 'oldest']);
const MAX_SEARCH_LEN = 200;
// Sanity ceiling only (bounds unstable_cache entries from bogus ?page=), far
// above any real page count — 1000 used to strand pages past it (~1168 today).
const MAX_PAGE = 20000;
const MAX_LIMIT = 100;

const TAG_SET = new Set(POSITIVE_TAG_OPTIONS.map((t) => t.toLowerCase()));

// Comma list of known tags; unknown ones are dropped. The allowlist also caps
// the list's length, so a long ?match= can't bloat the query or the cache key.
function parseTags(value: string | null): string[] {
	if (!value) return [];
	return [
		...new Set(
			value
				.split(',')
				.map((t) => t.trim().toLowerCase())
				.filter((t) => TAG_SET.has(t))
		),
	];
}

function safeInt(value: string | null, def: number, max: number): number {
	if (value == null || value === '') return def;
	const n = parseInt(value, 10);
	if (!Number.isFinite(n) || n < 1) return def;
	return Math.min(n, max);
}

export async function GET(request: NextRequest) {
	try {
		const sp = request.nextUrl.searchParams;
		const filters: JobFilters = {};

		const searchRaw = sp.get('search');
		if (searchRaw != null) {
			const search = searchRaw.slice(0, MAX_SEARCH_LEN).trim();
			if (search) filters.search = search;
		}

		const companyRaw = sp.get('company');
		if (companyRaw) {
			const company = companyRaw.trim();
			const companies = await getCompanies();
			const canonicalCompany = companies.find(
				(c) => c.toLowerCase() === company.toLowerCase()
			);
			if (!canonicalCompany) {
				return NextResponse.json(
					{ error: 'Invalid company filter' },
					{ status: 400 }
				);
			}
			filters.company = canonicalCompany;
		}

		const sourceParam = sp.get('source');
		if (sourceParam) {
			const sources = [
				...new Set(
					sourceParam
						.split(',')
						.map((s) => s.trim().toLowerCase())
						.filter((s) => SOURCES.has(s))
				),
			];
			if (sources.length > 0) filters.source = sources;
		}

		if (sp.get('remote') === 'true') filters.remote = true;

		filters.minScore = safeInt(sp.get('minScore'), 0, 1000);
		if (filters.minScore === 0) delete filters.minScore;

		const employmentType = sp.get('employmentType');
		if (employmentType && EMPLOYMENT_TYPES.has(employmentType)) {
			filters.employmentType = employmentType;
		}

		// Comma list of department groups, like location. Unknown names (old
		// links to a raw department) are dropped instead of failing the request.
		const departmentRaw = sp.get('department');
		if (departmentRaw) {
			const departments = parseLocationValues(departmentRaw)
				.map((d) => DEPARTMENT_GROUPS.find((g) => g.toLowerCase() === d.toLowerCase()))
				.filter((g): g is string => Boolean(g));
			if (departments.length > 0) filters.departments = departments;
		}

		const team = sp.get('team')?.trim();
		if (team) filters.team = team.slice(0, 100);

		const locationRaw = sp.get('location');
		if (locationRaw) {
			const requestedLocations = parseLocationValues(locationRaw);
			const locations = await getLocations();
			const canonicalLocations = requestedLocations.map((location) =>
				locations.find((candidate) => candidate.toLowerCase() === location.toLowerCase())
			);
			if (canonicalLocations.some((location) => !location)) {
				return NextResponse.json(
					{ error: 'Invalid location filter' },
					{ status: 400 }
				);
			}
			filters.locations = canonicalLocations.filter(
				(location): location is string => Boolean(location)
			);
		}

		const tags = parseTags(sp.get('tags'));
		if (tags.length > 0) filters.tags = tags;

		const match = parseTags(sp.get('match'));
		if (match.length > 0) filters.match = match;

		const exp = sp.get('exp');
		if (EXPERIENCE_OPTIONS.some((o) => o.value === exp)) filters.maxYears = Number(exp);

		const sort = sp.get('sort');
		if (sort && SORT_OPTIONS.has(sort)) {
			filters.sort = sort as JobFilters['sort'];
		}

		filters.page = safeInt(sp.get('page'), 1, MAX_PAGE);
		const limit = safeInt(sp.get('limit'), 40, MAX_LIMIT);
		filters.limit = limit;

		const result = await getJobs(filters);
		// An hour at the edge, like the feed page: getJobs' data cache refreshes hourly anyway, and
		// each deploy purges Cloudflare (deploy-web.yml).
		return NextResponse.json(result, {
			headers: {
				'Cache-Control':
					'public, s-maxage=3600, stale-while-revalidate=300',
			},
		});
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
	}
}
