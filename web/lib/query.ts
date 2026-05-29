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
  id, job_id, company, title, location, team, department,
  employment_type, remote, description, apply_url, job_url,
  published_at, scraped_at, compensation_summary, content_hash,
  is_active, created_at, updated_at
`;

// Bulk queries truncate description to 500 chars — enough for keyword scoring,
// 95%+ less Neon egress vs full text. Full description only on detail page.
const LIST_COLUMNS_BULK = `
  id, job_id, company, title, location, team, department,
  employment_type, remote, LEFT(description, 500) AS description, apply_url, job_url,
  published_at, scraped_at, compensation_summary, content_hash,
  is_active, created_at, updated_at
`;

// --- In-memory cache ---

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);

  return fn().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

// --- Row mapping ---

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    jobId: row.job_id,
    company: row.company,
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
    contentHash: row.content_hash,
    isActive: Boolean(row.is_active),
    status: (row.status as Job["status"]) ?? "new",
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

async function getCanonicalCompanyNameMap(): Promise<Map<string, string>> {
  return cached("canonical_company_names", 120_000, async () => {
    const { rows } = await query<{ name: string }>("SELECT name FROM companies");
    const map = new Map<string, string>();
    for (const r of rows) {
      const n = r.name?.trim();
      if (n) map.set(n.toLowerCase(), n);
    }
    return map;
  });
}

function applyCanonicalCompanyNames(
  jobs: JobWithScore[],
  map: Map<string, string>
): void {
  for (const j of jobs) {
    const key = j.company?.trim().toLowerCase();
    if (key && map.has(key)) {
      j.company = map.get(key)!;
    }
  }
}

// --- All scored jobs (cached) ---

async function getAllScoredJobs(): Promise<JobWithScore[]> {
  return cached("all_scored_jobs", 60_000, async () => {
    const { rows } = await query<JobRow>(
      `SELECT ${LIST_COLUMNS_BULK} FROM jobs WHERE is_active = TRUE ORDER BY published_at DESC`
    );
    return rows.map((r) => scoreJob(rowToJob(r)));
  });
}

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
    const { rows: rawRows } = await query<JobRow>(
      `SELECT ${LIST_COLUMNS_BULK} FROM jobs ${where} ${orderBy}`,
      params
    );
    const canonicalMap = await getCanonicalCompanyNameMap();
    const displayName =
      filters.company
        ? canonicalMap.get(filters.company.trim().toLowerCase()) ?? filters.company.trim()
        : "";
    const rows =
      filters.company
        ? dedupeRowsByJobId(rawRows, displayName)
        : rawRows;
    scored = rows.map((r) => scoreJob(rowToJob(r)));
  } else {
    scored = await getAllScoredJobs();
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
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      break;
    case "oldest":
      scored.sort(
        (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      );
      break;
    default:
      scored.sort((a, b) => b.score - a.score);
  }

  const canonicalMapForDisplay = await getCanonicalCompanyNameMap();
  applyCanonicalCompanyNames(scored, canonicalMapForDisplay);

  const total = scored.length;
  const offset = (page - 1) * limit;
  const paginated = scored.slice(offset, offset + limit).map(stripForList);

  return { data: paginated, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getJobById(jobId: string): Promise<JobWithScore | null> {
  const { rows } = await query<JobRow>(
    `SELECT ${LIST_COLUMNS} FROM jobs WHERE job_id = $1`,
    [jobId]
  );
  if (rows.length === 0) return null;
  return scoreJob(rowToJob(rows[0]));
}

export async function getJobsByIds(jobIds: string[]): Promise<JobWithScore[]> {
  if (jobIds.length === 0) return [];
  const placeholders = jobIds.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await query<JobRow>(
    `SELECT ${LIST_COLUMNS_BULK} FROM jobs WHERE job_id IN (${placeholders}) AND is_active = TRUE`,
    jobIds
  );
  return rows.map((r) => scoreJob(rowToJob(r))).map(stripForList);
}

export async function getCompanies(): Promise<string[]> {
  return cached("companies_list", 120_000, async () => {
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
      const fromDb = companiesRows.find((c: { name: string }) => c.name.trim().toLowerCase() === k);
      const canonical = fromDb ? fromDb.name.trim() : raw;
      if (!canonicalByLower.has(k)) canonicalByLower.set(k, canonical);
    }
    return Array.from(canonicalByLower.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  });
}

export async function getStats(): Promise<{ total: number; companies: number }> {
  return cached("stats", 120_000, async () => {
    const { rows } = await query(
      `SELECT COUNT(*)::int as total,
              COUNT(DISTINCT LOWER(TRIM(company)))::int as companies
       FROM jobs WHERE is_active = TRUE`
    );
    return rows[0] as { total: number; companies: number };
  });
}

export async function getDepartments(): Promise<string[]> {
  return cached("departments_list", 120_000, async () => {
    const { rows } = await query<{ department: string }>(
      `SELECT DISTINCT department FROM jobs
       WHERE is_active = TRUE AND department IS NOT NULL AND department != ''
       ORDER BY department`
    );
    return rows.map((r) => r.department);
  });
}

export async function getLocations(): Promise<string[]> {
  return cached("locations_list", 120_000, async () => {
    const { rows } = await query<{ location: string }>(
      `SELECT DISTINCT location FROM jobs
       WHERE is_active = TRUE AND location IS NOT NULL AND TRIM(location) != ''
       ORDER BY location`
    );
    return rows.map((r) => r.location);
  });
}
