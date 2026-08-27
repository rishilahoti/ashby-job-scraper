import { unstable_cache } from "next/cache";
import { query } from "./db";
import { scoreJob } from "./scoring";
import type {
  Job,
  JobWithScore,
  JobFilters,
  JobRow,
  PaginatedResult,
} from "./types";

const LIST_COLUMNS = `
  id, job_id, company, source, title, location, team, department,
  employment_type, remote, description, apply_url, job_url,
  published_at, scraped_at, compensation_summary,
  compensation_min, compensation_max, compensation_currency, compensation_interval, content_hash,
  is_active, created_at, updated_at
`;

// No description in bulk queries — halves row size (~440 bytes vs ~940).
// Description is stripped from list output by stripForList anyway.
// Scoring still uses title/company/employment_type for keyword tags.
const LIST_COLUMNS_BULK = `
  id, job_id, company, source, title, location, team, department,
  employment_type, remote, ''::text AS description, apply_url, job_url,
  published_at, scraped_at, compensation_summary,
  compensation_min, compensation_max, compensation_currency, compensation_interval, content_hash,
  is_active, created_at, updated_at
`;

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

function stripForList(job: JobWithScore): JobWithScore {
  return { ...job, description: "" };
}

function dedupeRowsByJobId(rows: JobRow[], preferredCompany: string): JobRow[] {
  const preferred = preferredCompany.trim().toLowerCase();
  const byId = new Map<string, JobRow>();
  for (const r of rows) {
    const id = r.job_id;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, r);
    } else {
      const rMatch = r.company?.trim().toLowerCase() === preferred;
      const exMatch = existing.company?.trim().toLowerCase() === preferred;
      if (rMatch && !exMatch) byId.set(id, r);
    }
  }
  const canonical = preferredCompany.trim();
  return Array.from(byId.values()).map((r) =>
    r.company?.trim().toLowerCase() === preferred ? r : { ...r, company: canonical }
  );
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
    } catch {
      return last;
    }
  };
}

// --- Shared cache (unstable_cache = shared across all Vercel instances, unlike Map) ---

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
  { revalidate: 300 }
), {});

// All scored jobs — ONE DB hit per 30 min shared across every instance.
// Without description: ~2.2MB per fetch vs ~4.7MB before.
const getCachedAllScoredJobs = withStaleFallback(unstable_cache(
  async (): Promise<JobWithScore[]> => {
    const { rows } = await query<JobRow>(
      `SELECT ${LIST_COLUMNS_BULK} FROM jobs WHERE is_active = TRUE ORDER BY published_at DESC`
    );
    return rows.map((r) => scoreJob(rowToJob(r)));
  },
  ["all-scored-jobs"],
  { revalidate: 1800 } // 30 minutes
), []);

// --- Public API ---

export async function getJobs(
  filters: JobFilters = {}
): Promise<PaginatedResult<JobWithScore>> {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 40, 100);

  let scored: JobWithScore[];

  const hasDbFilters =
    filters.company ||
    filters.remote !== undefined ||
    filters.employmentType ||
    filters.search ||
    filters.department ||
    filters.team ||
    filters.location;

  if (hasDbFilters) {
    const wheres: string[] = ["is_active = TRUE"];
    const params: (string | number | boolean)[] = [];
    let idx = 1;

    if (filters.company) {
      wheres.push(`LOWER(TRIM(company)) = LOWER(TRIM($${idx}))`);
      params.push(filters.company);
      idx++;
    }
    if (filters.remote !== undefined) {
      wheres.push(`remote = $${idx++}`);
      params.push(filters.remote);
    }
    if (filters.employmentType) {
      wheres.push(`employment_type = $${idx++}`);
      params.push(filters.employmentType);
    }
    if (filters.department) {
      wheres.push(`department ILIKE $${idx++}`);
      params.push(`%${filters.department}%`);
    }
    if (filters.team) {
      wheres.push(`team ILIKE $${idx++}`);
      params.push(`%${filters.team}%`);
    }
    if (filters.location) {
      wheres.push(`location = $${idx++}`);
      params.push(filters.location);
    }
    if (filters.search) {
      wheres.push(`(title ILIKE $${idx} OR company ILIKE $${idx + 1})`);
      const term = `%${filters.search}%`;
      params.push(term, term);
      idx += 2;
    }

    const where = `WHERE ${wheres.join(" AND ")}`;
    const companyParamIndex = filters.company ? 1 : 0;
    const orderBy =
      filters.company
        ? `ORDER BY job_id, CASE WHEN TRIM(company) = TRIM($${companyParamIndex}) THEN 0 ELSE 1 END, published_at DESC NULLS LAST`
        : "ORDER BY published_at DESC";
    try {
      const { rows: rawRows } = await query<JobRow>(
        `SELECT ${LIST_COLUMNS_BULK} FROM jobs ${where} ${orderBy}`,
        params
      );
      const canonicalRecord = await getCanonicalCompanyNamesRecord();
      const displayName =
        filters.company
          ? canonicalRecord[filters.company.trim().toLowerCase()] ?? filters.company.trim()
          : "";
      const rows =
        filters.company
          ? dedupeRowsByJobId(rawRows, displayName)
          : rawRows;
      scored = rows.map((r) => scoreJob(rowToJob(r)));
    } catch {
      // DB unreachable (e.g. Neon suspended) — fall back to the last cached
      // full listing rather than taking the page down. SQL-pushed filters
      // (company/remote/location/etc) are skipped; score/tag/sort filters below still apply.
      scored = await getCachedAllScoredJobs();
    }
  } else {
    scored = await getCachedAllScoredJobs();
  }

  if (filters.minScore !== undefined) {
    scored = scored.filter((j) => j.score >= filters.minScore!);
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagsLower = filters.tags.map((t) => t.toLowerCase());
    scored = scored.filter((j) =>
      tagsLower.every((tag) =>
        j.matchedKeywords.some((k) => k.toLowerCase() === tag)
      )
    );
  }

  const sortBy = filters.sort || "score";
  switch (sortBy) {
    case "newest":
      scored.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      break;
    case "oldest":
      scored.sort(
        (a, b) =>
          new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      );
      break;
    default:
      scored.sort((a, b) => b.score - a.score);
  }

  const canonicalRecord = await getCanonicalCompanyNamesRecord();
  for (const j of scored) {
    const key = j.company?.trim().toLowerCase();
    if (key && canonicalRecord[key]) {
      j.company = canonicalRecord[key];
    }
  }

  const total = scored.length;
  const offset = (page - 1) * limit;
  const paginated = scored.slice(offset, offset + limit).map(stripForList);

  return { data: paginated, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getJobById(jobId: string): Promise<JobWithScore | null> {
  try {
    const { rows } = await query<JobRow>(
      `SELECT ${LIST_COLUMNS} FROM jobs WHERE job_id = $1`,
      [jobId]
    );
    if (rows.length === 0) return null;
    return scoreJob(rowToJob(rows[0]));
  } catch {
    // DB unreachable — best effort from the cached listing (no full description in that cache).
    const cached = await getCachedAllScoredJobs();
    return cached.find((j) => j.jobId === jobId) ?? null;
  }
}

export async function getJobsByIds(jobIds: string[]): Promise<JobWithScore[]> {
  if (jobIds.length === 0) return [];
  const placeholders = jobIds.map((_, i) => `$${i + 1}`).join(", ");
  try {
    const { rows } = await query<JobRow>(
      `SELECT ${LIST_COLUMNS_BULK} FROM jobs WHERE job_id IN (${placeholders}) AND is_active = TRUE`,
      jobIds
    );
    return rows.map((r) => scoreJob(rowToJob(r))).map(stripForList);
  } catch {
    const cached = await getCachedAllScoredJobs();
    const idSet = new Set(jobIds);
    return cached.filter((j) => idSet.has(j.jobId));
  }
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
  { revalidate: 300 }
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
  { revalidate: 300 }
), { total: 0, companies: 0 });

export const getDepartments = withStaleFallback(unstable_cache(
  async (): Promise<string[]> => {
    const { rows } = await query<{ department: string }>(
      `SELECT DISTINCT department FROM jobs
       WHERE is_active = TRUE AND department IS NOT NULL AND department != ''
       ORDER BY department`
    );
    return rows.map((r) => r.department);
  },
  ["departments-list"],
  { revalidate: 300 }
), []);

export const getLocations = withStaleFallback(unstable_cache(
  async (): Promise<string[]> => {
    const { rows } = await query<{ location: string }>(
      `SELECT DISTINCT location FROM jobs
       WHERE is_active = TRUE AND location IS NOT NULL AND TRIM(location) != ''
       ORDER BY location`
    );
    return rows.map((r) => r.location);
  },
  ["locations-list"],
  { revalidate: 300 }
), []);
