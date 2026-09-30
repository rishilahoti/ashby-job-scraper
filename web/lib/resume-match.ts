import { PDFParse } from "pdf-parse";
import { createRequire } from "node:module";
import { query } from "./db.ts";
import { getExperienceLabel } from "./experience.ts";
import { buildJobRoleSql, inferJobRolesFromText, JOB_ROLE_OPTIONS, type JobRole } from "./job-role.ts";
import type { ResumeInsights, ResumeJobMatch, ResumeRoleMatch, ResumeSummary } from "./resume-types";
import { pushParam, type SqlParam } from "./search-terms.ts";
import type { Job, JobRow } from "./types";

interface Rules {
  keywords: Record<string, number>;
  freshnessBoostHours: number;
  freshnessBoost: number;
}

interface ResumeMatchRow extends JobRow {
  score: string | number;
  match_score: string | number;
  matched_keywords: string[];
}

const require = createRequire(import.meta.url);
const rulesData = require("../../src/config/rules.json") as Rules;

const rules = rulesData as Rules;
const ROLE_LABELS = Object.fromEntries(JOB_ROLE_OPTIONS.map((option) => [option.value, option.label])) as Record<JobRole, string>;
const POSITIVE_KEYWORDS = Object.entries(rules.keywords)
  .filter(([, weight]) => weight > 0)
  .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  .map(([keyword, weight]) => ({ keyword: keyword.toLowerCase(), weight }));
const FRESHNESS_HOURS = Number(rules.freshnessBoostHours) || 0;
const FRESHNESS_BOOST = Number(rules.freshnessBoost) || 0;
const COMPUTED_SCORE_SQL =
  FRESHNESS_HOURS && FRESHNESS_BOOST
    ? `(base_score + CASE WHEN published_at >= NOW() - INTERVAL '${FRESHNESS_HOURS} hours' THEN ${FRESHNESS_BOOST} ELSE 0 END)`
    : "base_score";
const RESUME_LIST_COLUMNS = `
  id, job_id, company, source, title, location, team, department,
  employment_type, remote, description, NULL::text AS experience_label, apply_url, job_url,
  published_at, scraped_at, compensation_summary,
  compensation_min, compensation_max, compensation_currency, compensation_interval, content_hash,
  is_active, created_at, updated_at
`;

let ensuredResumeColumns: Promise<void> | null = null;
let pdfWorkerConfigured: Promise<void> | null = null;

export function requestWithinLimit(request: Request, maxBytes: number): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;
  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes > 0 && bytes <= maxBytes;
}

async function ensurePdfWorkerConfigured(): Promise<void> {
  if (!pdfWorkerConfigured) {
    pdfWorkerConfigured = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((workerModule) => {
      const workerGlobal = globalThis as typeof globalThis & {
        pdfjsWorker?: unknown;
      };
      workerGlobal.pdfjsWorker = workerModule;
    });
  }

  await pdfWorkerConfigured;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}([^a-z0-9]|$)`, "i").test(text);
}

function toIsoString(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

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
    publishedAt: toIsoString(row.published_at),
    scrapedAt: toIsoString(row.scraped_at),
    compensationSummary: row.compensation_summary,
    compensationMin: row.compensation_min != null ? Number(row.compensation_min) : null,
    compensationMax: row.compensation_max != null ? Number(row.compensation_max) : null,
    compensationCurrency: row.compensation_currency,
    compensationInterval: row.compensation_interval,
    contentHash: row.content_hash,
    isActive: Boolean(row.is_active),
    experienceLabel: getExperienceLabel(row.title, row.description),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function ensureUserResumeColumns(): Promise<void> {
  if (!ensuredResumeColumns) {
    ensuredResumeColumns = query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS resume_text TEXT,
        ADD COLUMN IF NOT EXISTS resume_filename TEXT,
        ADD COLUMN IF NOT EXISTS resume_uploaded_at TIMESTAMPTZ
    `)
      .then(() => undefined)
      .catch((error) => {
        ensuredResumeColumns = null;
        throw error;
      });
  }

  return ensuredResumeColumns;
}

export function isPdfBytes(data: Uint8Array): boolean {
  return data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d;
}

export function normalizeResumeText(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

export async function extractResumeTextFromPdf(data: Uint8Array): Promise<string> {
  await ensurePdfWorkerConfigured();
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return normalizeResumeText(result.text);
  } finally {
    await parser.destroy();
  }
}

export function summarizeResume(resumeText: string, profileRole?: string | null): ResumeSummary {
  const normalized = normalizeResumeText(`${profileRole || ""} ${resumeText}`).toLowerCase();
  const keywords = POSITIVE_KEYWORDS.filter(({ keyword }) => containsKeyword(normalized, keyword))
    .slice(0, 12)
    .map(({ keyword }) => keyword);
  const roles = inferJobRolesFromText(normalized, 4).map((entry) => ({
    role: entry.role,
    label: ROLE_LABELS[entry.role],
    score: entry.score,
  }));

  return { keywords, roles };
}

async function getResumeMatchedJobs(summary: ResumeSummary): Promise<ResumeJobMatch[]> {
  if (summary.keywords.length === 0 && summary.roles.length === 0) return [];

  const params: SqlParam[] = [];
  const matchClauses: string[] = [];
  const scoreClauses: string[] = [];

  if (summary.keywords.length > 0) {
    const keywordParam = pushParam(params, summary.keywords.map((keyword) => keyword.toLowerCase()));
    matchClauses.push(`matched_keywords && ${keywordParam}::text[]`);
    scoreClauses.push(`COALESCE((SELECT COUNT(*) FROM unnest(matched_keywords) AS kw WHERE kw = ANY(${keywordParam}::text[])), 0) * 8`);
  }

  for (const roleMatch of summary.roles.slice(0, 3)) {
    const roleSql = buildJobRoleSql(params, roleMatch.role);
    matchClauses.push(roleSql);
    scoreClauses.push(`CASE WHEN ${roleSql} THEN ${Math.max(roleMatch.score * 12, 12)} ELSE 0 END`);
  }

  const matchScoreSql = scoreClauses.length > 0 ? scoreClauses.join(" + ") : "0";
  const { rows } = await query<ResumeMatchRow>(
    `
      SELECT
        ${RESUME_LIST_COLUMNS},
        ${COMPUTED_SCORE_SQL} AS score,
        matched_keywords,
        (${matchScoreSql}) AS match_score
      FROM jobs
      WHERE is_active = TRUE
        AND (${matchClauses.join(" OR ")})
      ORDER BY match_score DESC, ${COMPUTED_SCORE_SQL} DESC, published_at DESC NULLS LAST, id DESC
      LIMIT 12
    `,
    params
  );

  return rows.map((row) => ({
    ...rowToJob(row),
    matchedKeywords: row.matched_keywords ?? [],
    score: Number(row.score),
    matchScore: Number(row.match_score),
  }));
}

export async function getResumeInsights(resumeText: string, profileRole?: string | null): Promise<ResumeInsights> {
  const summary = summarizeResume(resumeText, profileRole);
  const jobs = await getResumeMatchedJobs(summary);

  return {
    ...summary,
    jobs,
  };
}