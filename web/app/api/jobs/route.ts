import { NextRequest, NextResponse } from 'next/server';
import {
	getJobs,
	getCompanies,
	getStats,
	getDepartments,
	getLocations,
} from '@/lib/query';
import { POSITIVE_TAG_OPTIONS } from '@/lib/scoring';
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

function safeInt(value: string | null, def: number, max: number): number {
	if (value == null || value === '') return def;
	const n = parseInt(value, 10);
	if (!Number.isFinite(n) || n < 1) return def;
	return Math.min(n, max);
}

export async function GET(request: NextRequest) {
	try {
		const sp = request.nextUrl.searchParams;

		if (sp.get('meta') === 'companies') {
			const companies = await getCompanies();
			return NextResponse.json(
				{ companies },
				{
					headers: {
						'Cache-Control':
							'public, s-maxage=300, stale-while-revalidate=600',
					},
				}
			);
		}

		if (sp.get('meta') === 'departments') {
			const departments = await getDepartments();
			return NextResponse.json(
				{ departments },
				{
					headers: {
						'Cache-Control':
							'public, s-maxage=300, stale-while-revalidate=600',
					},
				}
			);
		}

		if (sp.get('meta') === 'locations') {
			const locations = await getLocations();
			return NextResponse.json(
				{ locations },
				{
					headers: {
						'Cache-Control':
							'public, s-maxage=300, stale-while-revalidate=600',
					},
				}
			);
		}

		if (sp.get('meta') === 'stats') {
			const stats = await getStats();
			return NextResponse.json(stats, {
				headers: {
					'Cache-Control':
						'public, s-maxage=300, stale-while-revalidate=600',
				},
			});
		}

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

		const department = sp.get('department')?.trim();
		if (department) filters.department = department.slice(0, 100);

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

		const tagsParam = sp.get('tags');
		if (tagsParam) {
			const tagSet = new Set(
				POSITIVE_TAG_OPTIONS.map((t) => t.toLowerCase())
			);
			const tags = tagsParam
				.split(',')
				.map((t) => t.trim().toLowerCase())
				.filter((t) => t && tagSet.has(t));
			if (tags.length > 0) filters.tags = [...new Set(tags)];
		}

		const sort = sp.get('sort');
		if (sort && SORT_OPTIONS.has(sort)) {
			filters.sort = sort as JobFilters['sort'];
		}

		filters.page = safeInt(sp.get('page'), 1, MAX_PAGE);
		const limit = safeInt(sp.get('limit'), 40, MAX_LIMIT);
		filters.limit = limit;

		const result = await getJobs(filters);
		return NextResponse.json(result, {
			headers: {
				'Cache-Control':
					'public, s-maxage=120, stale-while-revalidate=300',
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
