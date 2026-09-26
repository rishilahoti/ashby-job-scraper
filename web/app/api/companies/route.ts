import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
// Reuses the scraper's own adapters (single source of truth for normalize logic —
// see src/normalize/adapters/*.js) instead of a second, hand-kept-in-sync copy here.
import { ADAPTERS } from "../../../../src/normalize";
// Same shared scoring core src/store/jobs.js's upsertJob uses — without this,
// jobs added here got base_score 0 and no matched_keywords until their content
// next changed and the scraper's own upsertJob happened to recompute them.
import { computeStoredScore } from "../../../../src/intelligence/rules-engine";
import rules from "../../../../src/config/rules.json";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

type Source = keyof typeof ADAPTERS;
const SOURCES = Object.keys(ADAPTERS) as Source[];

interface NormalizedJob {
  jobId: string;
  company: string;
  source: Source;
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
  scrapedAt: string;
  compensationSummary: string | null;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationInterval: string | null;
  contentHash: string;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

const URL_PATTERNS: Record<Source, RegExp> = {
  ashby: /(?:https?:\/\/)?jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
  lever: /(?:https?:\/\/)?jobs\.lever\.co\/([a-zA-Z0-9_-]+)/,
  greenhouse: /(?:https?:\/\/)?(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/,
  workable: /(?:https?:\/\/)?apply\.workable\.com\/([a-zA-Z0-9_-]+)/,
  recruitee: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.recruitee\.com/,
  teamtailor: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.teamtailor\.com/,
  pinpoint: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.pinpointhq\.com/,
  smartrecruiters: /(?:https?:\/\/)?jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/,
  // Only ATS spread across per-tenant subdomains AND a numbered host (wd1-wd12)
  // AND an arbitrary site path — the 3 capture groups get joined into one
  // "tenant/wdHost/site" slug below, unlike every other source's single group.
  workday: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-zA-Z]{2}-[a-zA-Z]{2}\/)?([a-zA-Z0-9_-]+)/,
};

// SmartRecruiters/Workday identifiers are case-sensitive (e.g. "BMWDealerCareers",
// "NVIDIAExternalCareerSite") — every other source's slug is lowercase-insensitive,
// so this stays a small exception rather than changing the default behavior everywhere.
const CASE_SENSITIVE_SLUG_SOURCES: Source[] = ["smartrecruiters", "workday"];

function extractSlugAndSource(
  input: string,
  explicitSource?: string
): { slug: string; source: Source } | null {
  const trimmed = input.trim();

  for (const source of SOURCES) {
    const match = trimmed.match(URL_PATTERNS[source]);
    if (match) {
      const joined = match.slice(1).filter(Boolean).join("/");
      const slug = CASE_SENSITIVE_SLUG_SOURCES.includes(source) ? joined : joined.toLowerCase();
      return { slug, source };
    }
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    const source = SOURCES.includes(explicitSource as Source)
      ? (explicitSource as Source)
      : "ashby";
    const slug = CASE_SENSITIVE_SLUG_SOURCES.includes(source) ? trimmed : trimmed.toLowerCase();
    return { slug, source };
  }

  return null;
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
  // Unlisted/draft jobs are filtered centrally by ADAPTERS.ashby.filterRaw below.
  return { ok: true, jobs: data.jobs, companyName: data.jobBoard?.title || null };
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

async function fetchWorkable(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.jobs)) return { ok: false, status: 502 };
  return { ok: true, jobs: data.jobs, companyName: data.name || null };
}

async function fetchRecruitee(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://${slug}.recruitee.com/api/offers/`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.offers)) return { ok: false, status: 502 };
  return { ok: true, jobs: data.offers, companyName: data.offers[0]?.company_name || null };
}

async function fetchTeamtailor(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://${slug}.teamtailor.com/jobs.json`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) return { ok: false, status: 502 };
  return { ok: true, jobs: data.items, companyName: data.title || null };
}

async function fetchPinpoint(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://${slug}.pinpointhq.com/postings.json`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.data)) return { ok: false, status: 502 };
  return { ok: true, jobs: data.data, companyName: null };
}

async function fetchSmartRecruiters(slug: string): Promise<FetchResult> {
  const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  if (!data || !Array.isArray(data.content)) return { ok: false, status: 502 };
  return { ok: true, jobs: data.content, companyName: data.content[0]?.company?.name || null };
}

const WORKDAY_PAGE_SIZE = 20; // API-enforced max per page (HTTP 400 above it)
// ponytail: caps every Workday board at 200 jobs (10 requests) per add/re-scrape so
// one mega-employer can't blow up a single request — same ceiling as src/fetch/client.js.
const WORKDAY_MAX_PAGES = 10;

async function fetchWorkday(slug: string): Promise<FetchResult> {
  const [tenant, wdHost, site] = slug.split("/");
  if (!tenant || !wdHost || !site) return { ok: false, status: 400 };

  const boardUrl = `https://${tenant}.${wdHost}.myworkdayjobs.com/${site}`;
  const apiUrl = `https://${tenant}.${wdHost}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;

  const jobs: Record<string, unknown>[] = [];
  for (let page = 0; page < WORKDAY_MAX_PAGES; page++) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset: page * WORKDAY_PAGE_SIZE, searchText: "" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    if (!data || !Array.isArray(data.jobPostings)) return { ok: false, status: 502 };
    // Each posting only carries a relative externalPath — bake in the board's
    // base URL here so the adapter can build an absolute apply/job URL.
    for (const job of data.jobPostings) jobs.push({ ...job, _boardUrl: boardUrl });
    // `total` is unreliable across stateless requests (observed dropping to 0 on
    // the 2nd+ page) — a short page is the only trustworthy "no more pages" signal.
    if (data.jobPostings.length < WORKDAY_PAGE_SIZE) break;
  }

  // The CXS jobs endpoint has no company display-name field — fall back to the
  // tenant subdomain (e.g. "nvidia" -> "Nvidia") rather than the full compound
  // slug, which is what the generic slug-based fallback below would otherwise show.
  const companyName = tenant.charAt(0).toUpperCase() + tenant.slice(1);
  return { ok: true, jobs, companyName };
}

const SOURCE_CONFIG: Record<
  Source,
  {
    fetch: (slug: string) => Promise<FetchResult>;
    boardUrl: (slug: string) => string;
  }
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
  workable: {
    fetch: fetchWorkable,
    boardUrl: (slug) => `https://apply.workable.com/${slug}`,
  },
  recruitee: {
    fetch: fetchRecruitee,
    boardUrl: (slug) => `https://${slug}.recruitee.com`,
  },
  teamtailor: {
    fetch: fetchTeamtailor,
    boardUrl: (slug) => `https://${slug}.teamtailor.com`,
  },
  pinpoint: {
    fetch: fetchPinpoint,
    boardUrl: (slug) => `https://${slug}.pinpointhq.com`,
  },
  smartrecruiters: {
    fetch: fetchSmartRecruiters,
    boardUrl: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
  },
  workday: {
    fetch: fetchWorkday,
    boardUrl: (slug) => {
      const [tenant, wdHost, site] = slug.split("/");
      return `https://${tenant}.${wdHost}.myworkdayjobs.com/${site}`;
    },
  },
};

// Unauthenticated and, per job board, does up to WORKDAY_MAX_PAGES fetches
// plus one upsert query per job against a 3-connection pool — an IP looping
// this endpoint against big boards can tie up the pool for everyone else.
const IP_MAX_REQUESTS = 5;
const IP_WINDOW_MINUTES = 10;

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimited("add-company-ip", getClientIp(request), IP_MAX_REQUESTS, IP_WINDOW_MINUTES)) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const body = await request.json();
    const rawInput: string = body.url || body.slug || "";

    const parsed = extractSlugAndSource(rawInput, body.source);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid input. Provide a job board URL (Ashby, Lever, Greenhouse, Workable, Recruitee, Teamtailor, Pinpoint, SmartRecruiters, or Workday) or a slug.",
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

    // Keyed by jobId: a multi-row upsert can't touch the same row twice.
    const byId = new Map<string, NormalizedJob>();
    const adapter = ADAPTERS[source];
    for (const raw of adapter.filterRaw(result.jobs)) {
      const job = adapter.normalizeJob(raw, companyNameForJobs) as NormalizedJob | null;
      if (job) byId.set(job.jobId, job);
    }
    const seenJobIds = [...byId.keys()];
    const total = seenJobIds.length;

    // Classified against the pre-write hashes, same as the scraper's
    // detectChanges — RETURNING would only see the just-written hash.
    const { rows: existing } = await query<{ job_id: string; content_hash: string | null }>(
      `SELECT job_id, content_hash FROM jobs WHERE company = $1`,
      [companyNameForJobs]
    );
    const oldHash = new Map(existing.map((r) => [r.job_id, r.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const job of byId.values()) {
      if (!oldHash.has(job.jobId)) inserted++;
      else if (oldHash.get(job.jobId) === job.contentHash) unchanged++;
      else updated++;
    }

    // One multi-row upsert instead of a sequential query per job, which held
    // one of the pool's 3 connections for hundreds of round trips on big boards.
    // ponytail: whole board in one statement; chunk it if a board ever gets
    // big enough for the payload or the trigger's tsvector work to matter.
    if (byId.size > 0) {
      const payload = [...byId.values()].map((job) => ({ ...job, ...computeStoredScore(job, rules) }));
      await query(
        `INSERT INTO jobs (
           job_id, company, source, title, location, team, department,
           employment_type, remote, description,
           apply_url, job_url, published_at, scraped_at,
           compensation_summary, compensation_min, compensation_max,
           compensation_currency, compensation_interval, content_hash, is_active,
           base_score, matched_keywords
         )
         SELECT "jobId", $2, $3, title, location, team, department,
                "employmentType", remote, description,
                "applyUrl", "jobUrl", "publishedAt", NOW(),
                "compensationSummary", "compensationMin", "compensationMax",
                "compensationCurrency", "compensationInterval", "contentHash", TRUE,
                "baseScore", "matchedKeywords"
         FROM jsonb_to_recordset($1::jsonb) AS r(
           "jobId" text, title text, location text, team text, department text,
           "employmentType" text, remote boolean, description text,
           "applyUrl" text, "jobUrl" text, "publishedAt" timestamptz,
           "compensationSummary" text, "compensationMin" numeric, "compensationMax" numeric,
           "compensationCurrency" text, "compensationInterval" text, "contentHash" text,
           "baseScore" int, "matchedKeywords" text[]
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
           compensation_summary  = EXCLUDED.compensation_summary,
           compensation_min      = EXCLUDED.compensation_min,
           compensation_max      = EXCLUDED.compensation_max,
           compensation_currency = EXCLUDED.compensation_currency,
           compensation_interval = EXCLUDED.compensation_interval,
           content_hash      = EXCLUDED.content_hash,
           is_active         = TRUE,
           base_score        = EXCLUDED.base_score,
           matched_keywords  = EXCLUDED.matched_keywords,
           updated_at        = NOW()`,
        [JSON.stringify(payload), companyNameForJobs, source]
      );
    }

    // Mirrors src/store/jobs.js markRemovedJobs — without this, a job pulled from a
    // company here and never revisited manually stays is_active=TRUE until the
    // scheduler happens to re-scrape it (last_scraped_at was just bumped above, so
    // that can be delayed indefinitely by repeat manual adds).
    let removed = 0;
    if (seenJobIds.length > 0) {
      const { rowCount } = await query(
        `UPDATE jobs SET is_active = FALSE, updated_at = NOW()
         WHERE company = $1 AND source = $2 AND is_active = TRUE
           AND job_id != ALL($3::text[])`,
        [companyNameForJobs, source, seenJobIds]
      );
      removed = rowCount ?? 0;
    }

    return NextResponse.json({
      success: true,
      company: companyNameForJobs,
      slug,
      source,
      alreadyExisted: alreadyExists,
      jobs: { total, inserted, updated, unchanged, removed },
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
       LEFT JOIN jobs j ON j.company = c.name AND j.source = c.source AND j.is_active = TRUE
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
