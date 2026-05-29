import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import crypto from "crypto";

const ASHBY_BASE = "https://api.ashbyhq.com/posting-api/job-board";
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

function extractSlug(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/
  );
  if (urlMatch) return urlMatch[1].toLowerCase();
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function contentHash(...fields: (string | null | undefined)[]): string {
  const payload = fields.map((f) => f ?? "").join("|");
  return crypto.createHash("md5").update(payload).digest("hex");
}

function sanitizePlain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJobId(jobUrl: string | null): string | null {
  if (!jobUrl) return null;
  try {
    const url = new URL(jobUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return jobUrl;
  }
}

function safeDate(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawInput: string = body.url || body.slug || "";

    const slug = extractSlug(rawInput);
    if (!slug) {
      return NextResponse.json(
        {
          error:
            "Invalid input. Provide an Ashby job board URL (e.g. https://jobs.ashbyhq.com/company) or a slug.",
        },
        { status: 400 }
      );
    }

    const pool = getPool();

    const existingBySlug = await pool.query(
      `SELECT id, name, ashby_slug
       FROM companies
       WHERE LOWER(ashby_slug) = LOWER($1)
       ORDER BY last_scraped_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [slug]
    );
    const existingRow = existingBySlug.rows[0];
    const alreadyExists = !!existingRow;

    const ashbyRes = await fetch(
      `${ASHBY_BASE}/${slug}?includeCompensation=true`,
      { headers: HEADERS, signal: AbortSignal.timeout(15000) }
    );

    if (!ashbyRes.ok) {
      if (ashbyRes.status === 404) {
        return NextResponse.json(
          {
            error: `No Ashby job board found for "${slug}". Double-check the URL at https://jobs.ashbyhq.com/${slug}`,
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Ashby API returned ${ashbyRes.status}` },
        { status: 502 }
      );
    }

    const data = await ashbyRes.json();
    if (!data || !Array.isArray(data.jobs)) {
      return NextResponse.json(
        { error: "Unexpected response format from Ashby API" },
        { status: 502 }
      );
    }

    const companyName =
      data.jobBoard?.title || slug.charAt(0).toUpperCase() + slug.slice(1);
    const canonicalName = existingRow?.name ?? companyName;

    if (existingRow) {
      await pool.query(
        "UPDATE companies SET last_scraped_at = NOW() WHERE id = $1",
        [existingRow.id]
      );
    } else {
      await pool.query(
        `INSERT INTO companies (name, ashby_slug, last_scraped_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (ashby_slug) DO UPDATE SET last_scraped_at = NOW()`,
        [canonicalName, slug]
      );
    }

    const companyNameForJobs = existingRow?.name ?? canonicalName;
    const listedJobs: AshbyJob[] = data.jobs.filter(
      (j: AshbyJob) => j.isListed !== false
    );

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    // Use single ON CONFLICT upsert (same as backend) — no N+1 SELECT per job.
    for (const raw of listedJobs) {
      const jobId = extractJobId(raw.jobUrl ?? null);
      if (!jobId) continue;

      const description =
        raw.descriptionPlain || sanitizePlain(raw.descriptionHtml ?? null);
      const hash = contentHash(
        raw.title,
        raw.location,
        description,
        raw.employmentType,
        String(raw.isRemote),
        raw.team,
        raw.department
      );
      const compensationSummary =
        raw.compensation?.compensationTierSummary ||
        raw.compensation?.scrapeableCompensationSalarySummary ||
        null;

      const { rows } = await pool.query(
        `INSERT INTO jobs (
           job_id, company, title, location, team, department,
           employment_type, remote, description,
           apply_url, job_url, published_at, scraped_at,
           compensation_summary, content_hash, is_active
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12, NOW(),
           $13, $14, TRUE
         )
         ON CONFLICT (company, job_id) DO UPDATE SET
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
           (xmax <> 0 AND content_hash = $14)  AS was_unchanged`,
        [
          jobId,
          companyNameForJobs,
          raw.title || "Untitled",
          raw.location || "Unknown",
          raw.team || null,
          raw.department || null,
          raw.employmentType || null,
          Boolean(raw.isRemote),
          description,
          raw.applyUrl || "",
          raw.jobUrl || "",
          safeDate(raw.publishedAt),
          compensationSummary,
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
      alreadyExisted: alreadyExists,
      jobs: {
        total: listedJobs.length,
        inserted,
        updated,
        unchanged,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT c.name, c.ashby_slug, c.last_scraped_at,
              COUNT(j.id)::int as job_count
       FROM companies c
       LEFT JOIN jobs j ON j.company = c.name AND j.is_active = TRUE
       GROUP BY c.id, c.name, c.ashby_slug, c.last_scraped_at
       ORDER BY c.name`
    );
    const bySlug = new Map<string, (typeof rows)[0]>();
    for (const r of rows) {
      const key = r.ashby_slug?.toLowerCase() ?? "";
      if (!key) continue;
      if (!bySlug.has(key)) bySlug.set(key, r);
      else {
        const existing = bySlug.get(key)!;
        if (Number(r.job_count) > Number(existing.job_count)) bySlug.set(key, r);
      }
    }
    return NextResponse.json({ companies: Array.from(bySlug.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
