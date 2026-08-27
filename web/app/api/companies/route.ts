import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import crypto from "crypto";

type Source = "ashby" | "lever" | "greenhouse";
const SOURCES: Source[] = ["ashby", "lever", "greenhouse"];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return true; // auth disabled when env var is not set
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

const URL_PATTERNS: Record<Source, RegExp> = {
  ashby: /(?:https?:\/\/)?jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
  lever: /(?:https?:\/\/)?jobs\.lever\.co\/([a-zA-Z0-9_-]+)/,
  greenhouse: /(?:https?:\/\/)?(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/,
};

function extractSlugAndSource(
  input: string,
  explicitSource?: string
): { slug: string; source: Source } | null {
  const trimmed = input.trim();

  for (const source of SOURCES) {
    const match = trimmed.match(URL_PATTERNS[source]);
    if (match) return { slug: match[1].toLowerCase(), source };
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    const source = SOURCES.includes(explicitSource as Source)
      ? (explicitSource as Source)
      : "ashby";
    return { slug: trimmed.toLowerCase(), source };
  }

  return null;
}

function contentHash(...fields: (string | null | undefined)[]): string {
  const payload = fields.map((f) => f ?? "").join("|");
  return crypto.createHash("md5").update(payload).digest("hex");
}

// Handles both plain HTML (Ashby) and HTML-entity-double-encoded content (Greenhouse's
// `content` field comes back as literal "&lt;div&gt;" text) by decoding twice around
// the tag strip — a no-op for sources that were never encoded in the first place.
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const stripped = decode(html).replace(/<[^>]*>/g, " ");
  return decode(stripped).replace(/\s+/g, " ").trim();
}

function extractAshbyJobId(jobUrl: string | null): string | null {
  if (!jobUrl) return null;
  try {
    const url = new URL(jobUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return jobUrl;
  }
}

function safeDate(raw: string | number | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function formatSalaryRange(
  salaryRange: { currency?: string; min?: number; max?: number } | null | undefined
): string | null {
  if (!salaryRange || (salaryRange.min == null && salaryRange.max == null)) return null;
  const currency = salaryRange.currency || "";
  const min = salaryRange.min != null ? salaryRange.min.toLocaleString() : null;
  const max = salaryRange.max != null ? salaryRange.max.toLocaleString() : null;
  return min && max ? `${currency} ${min}–${max}`.trim() : `${currency} ${min || max}`.trim();
}

interface NormalizedJob {
  jobId: string;
  title: string;
  location: string;
  team: string | null;
  department: string | null;
  employmentType: string | null;
  remote: boolean;
  description: string;
  applyUrl: string;
  jobUrl: string;
  publishedAt: string;
  compensationSummary: string | null;
}

interface AshbyJob {
  title?: string;
  location?: string;
  team?: string;
  department?: string;
  employmentType?: string;
  isRemote?: boolean;
  isListed?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  applyUrl?: string;
  jobUrl?: string;
  publishedAt?: string;
  compensation?: {
    compensationTierSummary?: string;
    scrapeableCompensationSalarySummary?: string;
  };
}

interface LeverJob {
  id?: string;
  text?: string;
  country?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  salaryRange?: { currency?: string; min?: number; max?: number };
  categories?: { location?: string; team?: string; department?: string; commitment?: string };
}

interface GreenhouseJob {
  id?: number;
  title?: string;
  location?: { name?: string };
  content?: string;
  absolute_url?: string;
  first_published?: string;
  updated_at?: string;
  company_name?: string;
}

function normalizeAshbyJob(raw: AshbyJob): NormalizedJob | null {
  const jobId = extractAshbyJobId(raw.jobUrl ?? null);
  if (!jobId) return null;
  const description = raw.descriptionPlain || htmlToPlainText(raw.descriptionHtml);
  return {
    jobId,
    title: raw.title || "Untitled",
    location: raw.location || "Unknown",
    team: raw.team || null,
    department: raw.department || null,
    employmentType: raw.employmentType || null,
    remote: Boolean(raw.isRemote),
    description,
    applyUrl: raw.applyUrl || "",
    jobUrl: raw.jobUrl || "",
    publishedAt: safeDate(raw.publishedAt),
    compensationSummary:
      raw.compensation?.compensationTierSummary ||
      raw.compensation?.scrapeableCompensationSalarySummary ||
      null,
  };
}

function normalizeLeverJob(raw: LeverJob): NormalizedJob | null {
  if (!raw.id) return null;
  const categories = raw.categories || {};
  return {
    jobId: raw.id,
    title: raw.text || "Untitled",
    location: categories.location || raw.country || "Unknown",
    team: categories.team || null,
    department: categories.department || null,
    employmentType: categories.commitment || null,
    remote: raw.workplaceType === "remote",
    description: raw.descriptionPlain || "",
    applyUrl: raw.applyUrl || raw.hostedUrl || "",
    jobUrl: raw.hostedUrl || raw.applyUrl || "",
    publishedAt: safeDate(raw.createdAt),
    compensationSummary: formatSalaryRange(raw.salaryRange),
  };
}

function normalizeGreenhouseJob(raw: GreenhouseJob): NormalizedJob | null {
  if (raw.id == null) return null;
  const location = raw.location?.name || "Unknown";
  return {
    jobId: String(raw.id),
    title: raw.title || "Untitled",
    location,
    team: null,
    department: null,
    employmentType: null,
    remote: /remote/i.test(location),
    description: htmlToPlainText(raw.content),
    applyUrl: raw.absolute_url || "",
    jobUrl: raw.absolute_url || "",
    publishedAt: safeDate(raw.first_published || raw.updated_at),
    compensationSummary: null,
  };
}

type FetchResult =
  | { ok: true; jobs: unknown[]; companyName: string | null }
  | { ok: false; status: number };

async function fetchAshby(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.jobs)) return { ok: false, status: 502 };
  const jobs = (data.jobs as AshbyJob[]).filter((j) => j.isListed !== false);
  return { ok: true, jobs, companyName: data.jobBoard?.title || null };
}

async function fetchLever(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!Array.isArray(data)) return { ok: false, status: 502 };
  return { ok: true, jobs: data, companyName: null };
}

async function fetchGreenhouse(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.jobs)) return { ok: false, status: 502 };
  const jobs = data.jobs as GreenhouseJob[];
  return { ok: true, jobs, companyName: jobs[0]?.company_name || null };
}

const SOURCE_CONFIG: Record<
  Source,
  { fetch: (slug: string) => Promise<FetchResult>; normalize: (raw: unknown) => NormalizedJob | null; boardUrl: (slug: string) => string }
> = {
  ashby: {
    fetch: fetchAshby,
    normalize: (raw) => normalizeAshbyJob(raw as AshbyJob),
    boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  },
  lever: {
    fetch: fetchLever,
    normalize: (raw) => normalizeLeverJob(raw as LeverJob),
    boardUrl: (slug) => `https://jobs.lever.co/${slug}`,
  },
  greenhouse: {
    fetch: fetchGreenhouse,
    normalize: (raw) => normalizeGreenhouseJob(raw as GreenhouseJob),
    boardUrl: (slug) => `https://job-boards.greenhouse.io/${slug}`,
  },
};

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawInput: string = body.url || body.slug || "";

    const parsed = extractSlugAndSource(rawInput, body.source);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid input. Provide a job board URL (Ashby, Lever, or Greenhouse) or a slug.",
        },
        { status: 400 }
      );
    }
    const { slug, source } = parsed;
    const sourceConfig = SOURCE_CONFIG[source];

    const existingBySlug = await query(
      `SELECT id, name, slug
       FROM companies
       WHERE LOWER(slug) = LOWER($1) AND source = $2
       ORDER BY last_scraped_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [slug, source]
    );
    const existingRow = existingBySlug.rows[0];
    const alreadyExists = !!existingRow;

    const result = await sourceConfig.fetch(slug);
    if (!result.ok) {
      if (result.status === 404) {
        return NextResponse.json(
          {
            error: `No ${source} job board found for "${slug}". Double-check the URL at ${sourceConfig.boardUrl(slug)}`,
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `${source} API returned ${result.status}` },
        { status: 502 }
      );
    }

    const companyName = result.companyName || slug.charAt(0).toUpperCase() + slug.slice(1);
    const canonicalName = existingRow?.name ?? companyName;

    if (existingRow) {
      await query("UPDATE companies SET last_scraped_at = NOW() WHERE id = $1", [existingRow.id]);
    } else {
      await query(
        `INSERT INTO companies (name, slug, source, last_scraped_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (slug, source) DO UPDATE SET last_scraped_at = NOW()`,
        [canonicalName, slug, source]
      );
    }

    const companyNameForJobs = existingRow?.name ?? canonicalName;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let total = 0;

    for (const raw of result.jobs) {
      const job = sourceConfig.normalize(raw);
      if (!job) continue;
      total++;

      const hash = contentHash(
        job.title,
        job.location,
        job.description,
        job.employmentType,
        String(job.remote),
        job.team,
        job.department
      );

      const { rows } = await query(
        `INSERT INTO jobs (
           job_id, company, source, title, location, team, department,
           employment_type, remote, description,
           apply_url, job_url, published_at, scraped_at,
           compensation_summary, content_hash, is_active
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10,
           $11, $12, $13, NOW(),
           $14, $15, TRUE
         )
         ON CONFLICT (company, job_id) DO UPDATE SET
           source            = EXCLUDED.source,
           title             = EXCLUDED.title,
           location          = EXCLUDED.location,
           team              = EXCLUDED.team,
           department        = EXCLUDED.department,
           employment_type   = EXCLUDED.employment_type,
           remote            = EXCLUDED.remote,
           description       = EXCLUDED.description,
           apply_url         = EXCLUDED.apply_url,
           job_url           = EXCLUDED.job_url,
           published_at      = EXCLUDED.published_at,
           scraped_at        = NOW(),
           compensation_summary = EXCLUDED.compensation_summary,
           content_hash      = CASE
                                 WHEN jobs.content_hash = EXCLUDED.content_hash THEN jobs.content_hash
                                 ELSE EXCLUDED.content_hash
                               END,
           is_active         = TRUE,
           updated_at        = NOW()
         RETURNING
           (xmax = 0)                          AS was_inserted,
           (xmax <> 0 AND content_hash = $15)  AS was_unchanged`,
        [
          job.jobId,
          companyNameForJobs,
          source,
          job.title,
          job.location,
          job.team,
          job.department,
          job.employmentType,
          job.remote,
          job.description,
          job.applyUrl,
          job.jobUrl,
          job.publishedAt,
          job.compensationSummary,
          hash,
        ]
      );

      const { was_inserted, was_unchanged } = rows[0];
      if (was_inserted) inserted++;
      else if (was_unchanged) unchanged++;
      else updated++;
    }

    return NextResponse.json({
      success: true,
      company: companyNameForJobs,
      slug,
      source,
      alreadyExisted: alreadyExists,
      jobs: { total, inserted, updated, unchanged },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { rows } = await query(
      `SELECT c.name, c.slug, c.source, c.last_scraped_at,
              COUNT(j.id)::int as job_count
       FROM companies c
       LEFT JOIN jobs j ON j.company = c.name AND j.is_active = TRUE
       GROUP BY c.id, c.name, c.slug, c.source, c.last_scraped_at
       ORDER BY c.name`
    );
    const byKey = new Map<string, (typeof rows)[0]>();
    for (const r of rows) {
      const key = `${r.source}:${r.slug?.toLowerCase() ?? ""}`;
      if (!byKey.has(key)) byKey.set(key, r);
      else {
        const existing = byKey.get(key)!;
        if (Number(r.job_count) > Number(existing.job_count)) byKey.set(key, r);
      }
    }
    return NextResponse.json({ companies: Array.from(byKey.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
