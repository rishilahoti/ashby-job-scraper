import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { normalizeResponse } from "../../../../src/normalize";

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

// Shape normalizeResponse() (src/normalize) returns — same normalizer the
// scraper pipeline uses, so a job added here matches one the scraper would
// have produced for the same board.
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
  contentHash: string;
}

type FetchResult =
  | { ok: true; apiResponse: Record<string, unknown>; companyName: string | null }
  | { ok: false; status: number };

async function fetchAshby(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.jobs)) return { ok: false, status: 502 };
  return { ok: true, apiResponse: data, companyName: data.jobBoard?.title || null };
}

async function fetchLever(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!Array.isArray(data)) return { ok: false, status: 502 };
  return { ok: true, apiResponse: { jobs: data }, companyName: null };
}

async function fetchGreenhouse(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.jobs)) return { ok: false, status: 502 };
  return { ok: true, apiResponse: data, companyName: data.jobs[0]?.company_name || null };
}

const SOURCE_CONFIG: Record<
  Source,
  { fetch: (slug: string) => Promise<FetchResult>; boardUrl: (slug: string) => string }
> = {
  ashby: {
    fetch: fetchAshby,
    boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  },
  lever: {
    fetch: fetchLever,
    boardUrl: (slug) => `https://jobs.lever.co/${slug}`,
  },
  greenhouse: {
    fetch: fetchGreenhouse,
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

    const normalizedJobs = normalizeResponse(
      result.apiResponse,
      companyNameForJobs,
      source
    ) as NormalizedJob[];

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const job of normalizedJobs) {
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
          job.contentHash,
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
      jobs: { total: normalizedJobs.length, inserted, updated, unchanged },
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
