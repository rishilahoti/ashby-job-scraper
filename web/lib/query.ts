import { unstable_cache } from "next/cache";
import { query } from "./db";
import rulesData from "../../src/config/rules.json";
import { type SqlParam, pushParam, buildSearchSql, tsquerySql } from "./search-terms";
import type {
  Job,
  JobWithScore,
  JobFilters,
  JobRow,
  PaginatedResult,
} from "./types";

// Freshness boost is time-decaying (published_at vs now), so it's computed inline in
// SQL from an indexed column instead of being baked into the persisted base_score.
// Counted from midnight, not NOW(): a rolling cutoff reshuffled the cached feed
// page (/) every hour, and each changed regeneration is a paid ISR write. New
// jobs keep the boost for 48-72h instead of exactly 48h.
const FRESHNESS_HOURS = Number(rulesData.freshnessBoostHours) || 0;
const FRESHNESS_BOOST = Number(rulesData.freshnessBoost) || 0;
const SCORE_EXPR =
  FRESHNESS_HOURS && FRESHNESS_BOOST
    ? `(base_score + CASE WHEN published_at >= date_trunc('day', NOW()) - INTERVAL '${FRESHNESS_HOURS} hours' THEN ${FRESHNESS_BOOST} ELSE 0 END)`
    : "base_score";

type ScoredJobRow = JobRow & { base_score: number; matched_keywords: string[]; computed_score: string | number };

const LIST_COLUMNS = `
  id, job_id, company, source, title, location, team, department,
  employment_type, remote, description, apply_url, job_url,
  published_at, scraped_at, compensation_summary,
  compensation_min, compensation_max, compensation_currency, compensation_interval, content_hash,
  is_active, created_at, updated_at
`;

// No description in bulk queries — halves row size (~440 bytes vs ~940).
const LIST_COLUMNS_BULK = LIST_COLUMNS.replace("description,", "''::text AS description,");

// --- Row mapping ---

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    jobId: row.job_id,
    company: row.company,
    source: row.source,
    title: row.title,
    location: row.location,
    team: row.team,
    department: row.department,
    employmentType: row.employment_type,
    remote: Boolean(row.remote),
    description: row.description ?? "",
    applyUrl: row.apply_url,
    jobUrl: row.job_url,
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : "",
    scrapedAt: row.scraped_at ? new Date(row.scraped_at).toISOString() : "",
    compensationSummary: row.compensation_summary,
    compensationMin: row.compensation_min != null ? Number(row.compensation_min) : null,
    compensationMax: row.compensation_max != null ? Number(row.compensation_max) : null,
    compensationCurrency: row.compensation_currency,
    compensationInterval: row.compensation_interval,
    contentHash: row.content_hash,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToJobWithScore(row: ScoredJobRow): JobWithScore {
  return {
    ...rowToJob(row),
    score: Number(row.computed_score),
    matchedKeywords: row.matched_keywords ?? [],
  };
}

function applyCanonicalNames(jobs: JobWithScore[], canonicalRecord: Record<string, string>): void {
  for (const j of jobs) {
    const key = j.company?.trim().toLowerCase();
    if (key && canonicalRecord[key]) j.company = canonicalRecord[key];
  }
}

// Serves the last successful result when the DB is unreachable (e.g. Neon
// suspended after hitting its data-transfer cap) instead of throwing and
// taking the whole page (or build — static generation has no prior result
// to fall back on) down. Uses `emptyFallback` until we get a first success.
function withStaleFallback<T>(fn: () => Promise<T>, emptyFallback: T): () => Promise<T> {
  let last: T = emptyFallback;
  return async () => {
    try {
      last = await fn();
      return last;
    } catch (err) {
      // The deploy build sets this: failing it beats prerendering an empty site.
      if (process.env.REQUIRE_DB) throw err;
      return last;
    }
  };
}

// --- Shared cache (unstable_cache = shared across all Vercel instances, unlike Map) ---

// Every unstable_cache below uses this. An ISR page takes the shortest
// revalidate of anything it reads, so this must stay >= the feed and home
// pages' own revalidate — 300 here kept both re-rendering every 5 minutes.
const CACHE_REVALIDATE = 3600;

// Returns plain Record, not Map — unstable_cache requires JSON-serializable return values.
const getCanonicalCompanyNamesRecord = withStaleFallback(unstable_cache(
  async (): Promise<Record<string, string>> => {
    const { rows } = await query<{ name: string }>("SELECT name FROM companies");
    const record: Record<string, string> = {};
    for (const r of rows) {
      const n = r.name?.trim();
      if (n) record[n.toLowerCase()] = n;
    }
    return record;
  },
  ["canonical-company-names"],
  { revalidate: CACHE_REVALIDATE }
), {});

// --- Public API ---

// How well a job's title/company match the search box text; higher is
// better, 0 when only other fields matched (those then follow by score).
// title_tsv, not search_tsv: it's small and stored in the row, while ranking
// on search_tsv read every match's ~2.6KB tsvector from TOAST (7s for "AI").
// Ranked against the query's terms OR'd, not AND'd: ts_rank on the AND form
// scores a title with only some of the words (or any -excluded one) the same
// 1e-20 as a title with none, so partial title hits never ranked first.
function searchRankSql(params: SqlParam[], search: string): string {
  return `ts_rank(title_tsv, replace(${tsquerySql(params, search)}::text, ' & ', ' | ')::tsquery)`;
}

// One definition per filter for the SQL WHERE builder (getCachedJobsPage).
interface FilterSpec {
  active(f: JobFilters): boolean;
  sql(f: JobFilters, params: SqlParam[]): string;
}

const FILTER_SPECS: FilterSpec[] = [
  {
    active: (f) => !!f.company,
    sql: (f, params) => `LOWER(TRIM(company)) = LOWER(TRIM(${pushParam(params, f.company!)}))`,
  },
  {
    active: (f) => !!f.source && f.source.length > 0,
    sql: (f, params) => `source = ANY(${pushParam(params, f.source!)}::text[])`,
  },
  {
    active: (f) => f.remote !== undefined,
    sql: (f, params) => `remote = ${pushParam(params, f.remote!)}`,
  },
  {
    active: (f) => !!f.employmentType,
    sql: (f, params) => `employment_type = ${pushParam(params, f.employmentType!)}`,
  },
  {
    active: (f) => !!f.departments && f.departments.length > 0,
    sql: (f, params) => `department_group = ANY(${pushParam(params, f.departments!)}::text[])`,
  },
  {
    active: (f) => !!f.team,
    sql: (f, params) => `team ILIKE ${pushParam(params, `%${f.team}%`)}`,
  },
  {
    active: (f) => !!f.locations && f.locations.length > 0,
    sql: (f, params) => {
      const locations = f.locations!.map((l) => l.trim().toLowerCase());
      return `LOWER(TRIM(location)) = ANY(${pushParam(params, locations)}::text[])`;
    },
  },
  {
    active: (f) => !!f.search,
    // Full-text over title/company/department/location/description: whole
    // words, any order, plus websearch syntax — "exact phrase", -exclude, or.
    // Always through job_search_ids (src/store/db.js), never search_tsv @@
    // directly: that's what keeps every search on the GIN index. Terms FTS
    // itself mangles (symbols, short acronym-like terms) fall back to a
    // literal title match instead — see buildSearchSql.
    sql: (f, params) => buildSearchSql(params, f.search!),
  },
  {
    active: (f) => !!f.tags && f.tags.length > 0,
    sql: (f, params) => `matched_keywords @> ${pushParam(params, f.tags!.map((t) => t.toLowerCase()))}::text[]`,
  },
  {
    // Any shared tag (&&, on the same GIN index), unlike tags' all-of (@>).
    active: (f) => !!f.match && f.match.length > 0,
    sql: (f, params) => `matched_keywords && ${pushParam(params, f.match!)}::text[]`,
  },
  {
    // min_years is NULL when the job doesn't say: those stay in.
    active: (f) => f.maxYears !== undefined,
    sql: (f, params) => `COALESCE(min_years, 0) <= ${pushParam(params, f.maxYears!)}`,
  },
  {
    active: (f) => f.minScore !== undefined,
    sql: (f, params) => `${SCORE_EXPR} >= ${pushParam(params, f.minScore!)}`,
  },
];

// Paginated/filtered result sets are small (<=100 stripped rows, well under
// the 2MB data-cache limit) — shared across all Vercel instances like
// the other lookups in this file, cutting DB round trips for repeat filter
// combos against the fixed-capacity self-hosted Postgres box.
const getCachedJobsPage = unstable_cache(
  async (
    filters: JobFilters,
    page: number,
    limit: number
  ): Promise<PaginatedResult<JobWithScore>> => {
  const offset = (page - 1) * limit;

  const wheres: string[] = ["is_active = TRUE"];
  const params: SqlParam[] = [];
  for (const spec of FILTER_SPECS) {
    if (spec.active(filters)) wheres.push(spec.sql(filters, params));
  }

  let from = `jobs WHERE ${wheres.join(" AND ")}`;
  if (filters.company) {
    // A job_id can exist under several company-name variants: list it once,
    // preferring the row stored under the exact name.
    from = `(SELECT DISTINCT ON (job_id) * FROM ${from}
      ORDER BY job_id, CASE WHEN TRIM(company) = TRIM(${pushParam(params, filters.company)}) THEN 0 ELSE 1 END, published_at DESC NULLS LAST) j`;
  }
  const selectCols = `${LIST_COLUMNS_BULK}, base_score, matched_keywords, ${SCORE_EXPR} AS computed_score`;

    // Own copy of params: the relevance rank adds one only the data query
    // uses, and an unused param would break the COUNT query.
    const dataParams: SqlParam[] = [...params];
    let orderBy: string;
    if (filters.sort === "newest") {
      orderBy = "ORDER BY published_at DESC NULLS LAST, id DESC";
    } else if (filters.sort === "oldest") {
      orderBy = "ORDER BY published_at ASC NULLS LAST, id DESC";
    } else {
      // When searching, best text match first, then the usual score. A resume
      // match puts the jobs sharing the most of its tags first. With an
      // experience filter, jobs that say they fit come before ones that don't say.
      let rank = filters.search ? `${searchRankSql(dataParams, filters.search)} DESC, ` : "";
      if (filters.match?.length) {
        rank = `cardinality(ARRAY(SELECT unnest(matched_keywords) INTERSECT SELECT unnest(${pushParam(dataParams, filters.match)}::text[]))) DESC, ${rank}`;
      }
      if (filters.maxYears !== undefined) rank = `(min_years IS NULL), ${rank}`;
      orderBy = `ORDER BY ${rank}${SCORE_EXPR} DESC, published_at DESC, id DESC`;
    }

    const [dataResult, countResult] = await Promise.all([
      query<ScoredJobRow>(
        `SELECT ${selectCols} FROM ${from} ${orderBy} LIMIT ${pushParam(dataParams, limit)} OFFSET ${pushParam(dataParams, offset)}`,
        dataParams
      ),
      query<{ count: string }>(`SELECT COUNT(*) FROM ${from}`, params),
    ]);

    const total = Number(countResult.rows[0]?.count ?? 0);
    const scored = dataResult.rows.map(rowToJobWithScore);
    const canonicalRecord = await getCanonicalCompanyNamesRecord();
    applyCanonicalNames(scored, canonicalRecord);

    return { data: scored, total, page, totalPages: Math.ceil(total / limit) };
  },
  // v6: a company's jobs are deduped and sorted in SQL like every other
  // view, so ties order differently — don't serve v5's result sets.
  ["jobs-page-v6"],
  { revalidate: CACHE_REVALIDATE }
);

export async function getJobs(
  filters: JobFilters = {}
): Promise<PaginatedResult<JobWithScore>> {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 40, 100);
  try {
    return await getCachedJobsPage(filters, page, limit);
  } catch (err) {
    // The deploy build sets this: failing it beats prerendering an empty feed.
    if (process.env.REQUIRE_DB) throw err;
    // DB unreachable — degrade to empty like the other lookups here. No
    // full-table in-memory fallback: loading + scoring every job cost seconds
    // of CPU per hit, and unstable_cache already serves stale entries.
    return { data: [], total: 0, page, totalPages: 0 };
  }
}

// Throws when the DB is unreachable: the ISR job page then keeps serving its
// last good render instead of caching a 404 for a job that exists.
export async function getJobById(jobId: string): Promise<JobWithScore | null> {
  const { rows } = await query<ScoredJobRow>(
    `SELECT ${LIST_COLUMNS}, base_score, matched_keywords, ${SCORE_EXPR} AS computed_score FROM jobs WHERE job_id = $1`,
    [jobId]
  );
  if (rows.length === 0) return null;
  return rowToJobWithScore(rows[0]);
}

// No is_active filter — this backs the Applied/Ignored pages, which must
// still show a job someone marked before it closed (JobRow flags !isActive
// as "Closed" rather than silently dropping it from the list). DISTINCT ON:
// a job_id can exist under several company-name variants — show one,
// preferring a still-active copy.
export async function getJobsByIds(jobIds: string[]): Promise<JobWithScore[]> {
  if (jobIds.length === 0) return [];
  // The stored score and tags, like the feed: re-scoring here ran on the blanked description
  // and gave lower scores and fewer tags than the same job shows in the feed.
  const { rows } = await query<ScoredJobRow>(
    `SELECT DISTINCT ON (job_id) ${LIST_COLUMNS_BULK}, base_score, matched_keywords, ${SCORE_EXPR} AS computed_score
     FROM jobs
     WHERE job_id = ANY($1::text[])
     ORDER BY job_id, is_active DESC, updated_at DESC`,
    [jobIds]
  );
  return rows.map(rowToJobWithScore);
}

export const getCompanies = withStaleFallback(unstable_cache(
  async (): Promise<string[]> => {
    const [companiesRes, jobsRes] = await Promise.all([
      query<{ name: string }>("SELECT name FROM companies ORDER BY name"),
      query<{ company: string }>(
        "SELECT DISTINCT company FROM jobs WHERE is_active = TRUE ORDER BY company"
      ),
    ]);
    const companiesRows = companiesRes.rows;
    const jobsRows = jobsRes.rows;
    const canonicalByLower = new Map<string, string>();
    for (const r of jobsRows) {
      const raw = r.company.trim();
      const k = raw.toLowerCase();
      if (!k) continue;
      const fromDb = companiesRows.find(
        (c: { name: string }) => c.name.trim().toLowerCase() === k
      );
      const canonical = fromDb ? fromDb.name.trim() : raw;
      if (!canonicalByLower.has(k)) canonicalByLower.set(k, canonical);
    }
    return Array.from(canonicalByLower.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  },
  ["companies-list"],
  { revalidate: CACHE_REVALIDATE }
), []);

export const getStats = withStaleFallback(unstable_cache(
  async (): Promise<{ total: number; companies: number }> => {
    const { rows } = await query(
      `SELECT COUNT(*)::int as total,
              COUNT(DISTINCT LOWER(TRIM(company)))::int as companies
       FROM jobs WHERE is_active = TRUE`
    );
    return rows[0] as { total: number; companies: number };
  },
  ["stats"],
  { revalidate: CACHE_REVALIDATE }
), { total: 0, companies: 0 });

// Home page's Ashby-specific FAQ copy: getStats counts every platform (1061 vs
// ~590 Ashby companies). Lowercased names, companies with live Ashby jobs only;
// EXISTS probes idx_jobs_company_jobid per company instead of scanning jobs.
export const getAshbyCompanies = withStaleFallback(unstable_cache(
  async (): Promise<string[]> => {
    const { rows } = await query<{ name: string }>(
      `SELECT DISTINCT LOWER(TRIM(c.name)) AS name FROM companies c
       WHERE c.source = 'ashby' AND EXISTS (
         SELECT 1 FROM jobs j WHERE j.company = c.name AND j.source = 'ashby' AND j.is_active = TRUE
       )`
    );
    return rows.map((r) => r.name);
  },
  ["ashby-companies"],
  { revalidate: CACHE_REVALIDATE }
), []);

export const getUserCount = withStaleFallback(unstable_cache(
  async (): Promise<number> => {
    const { rows } = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users`);
    return rows[0]?.count ?? 0;
  },
  ["user-count"],
  { revalidate: CACHE_REVALIDATE }
), 0);

export const getLocations = withStaleFallback(unstable_cache(
  async (): Promise<string[]> => {
    // TRIM inside DISTINCT, not after: "Cincinnati" and "Cincinnati " (or a
    // tab, etc.) were different rows to SQL's untrimmed DISTINCT, so trimming
    // only in JS let both through as "duplicate" list entries — duplicate
    // React keys in the location dropdown. Postgres's TRIM() only strips
    // plain ASCII spaces though (JS's .trim() also strips e.g. NBSP), so the
    // Set below is the actual guarantee against duplicates; the SQL TRIM
    // just shrinks what DISTINCT has to compare.
    const { rows } = await query<{ location: string }>(
      `SELECT DISTINCT TRIM(location) AS location FROM jobs
       WHERE is_active = TRUE AND location IS NOT NULL AND TRIM(location) != ''
       ORDER BY TRIM(location)`
    );
    return [...new Set(rows.map((r) => r.location.trim()))];
  },
  ["locations-list-v3"],
  { revalidate: CACHE_REVALIDATE }
), []);
