import { pushParam, type SqlParam } from "./search-terms.ts";

export const JOB_ROLE_OPTIONS = [
  { value: "fullstack", label: "Full Stack" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "platform", label: "Platform / Infra" },
  { value: "data", label: "Data" },
  { value: "ml", label: "ML / AI" },
  { value: "devops", label: "DevOps" },
  { value: "sre", label: "SRE" },
  { value: "security", label: "Security" },
  { value: "mobile", label: "Mobile" },
  { value: "product", label: "Product" },
  { value: "design", label: "Design" },
  { value: "qa", label: "QA / Test" },
] as const;

export type JobRole = (typeof JOB_ROLE_OPTIONS)[number]["value"];

export interface JobRoleInference {
  role: JobRole;
  score: number;
}

type RoleDefinition = {
  value: JobRole;
  titlePatterns: string[];
  descriptionPatterns: string[];
};

export const ROLE_SEARCH_QUERIES: Record<JobRole, string> = {
  fullstack: '"full stack" OR fullstack',
  frontend: 'frontend OR "front end" OR "front-end" OR react OR vue OR angular OR svelte',
  backend: 'backend OR "back end" OR "back-end" OR "api engineer" OR "server engineer" OR server OR services',
  platform: 'platform OR infra OR infrastructure OR systems OR "developer platform"',
  data: '"data engineer" OR "analytics engineer" OR "data platform" OR "data scientist" OR "data analyst" OR etl OR bi',
  ml: '"machine learning" OR "ml engineer" OR "applied ai" OR "research engineer" OR ai OR llm',
  devops: '(devops OR kubernetes OR terraform OR "release engineer" OR "release engineering") -sre -"site reliability"',
  sre: 'sre OR "site reliability" OR "site reliability engineer" OR "site reliability engineering"',
  security: 'security OR trust OR identity OR appsec OR iam OR privacy',
  mobile: 'mobile OR ios OR android OR swift OR kotlin OR "react native" OR flutter',
  product: '"product manager" OR "technical product manager" OR "product owner" OR pm',
  design: 'designer OR "product design" OR ux OR "visual design" OR "brand design"',
  qa: 'qa OR "quality assurance" OR "test engineer" OR "automation testing" OR testing',
};

const ROLE_EXCLUDE_PATTERNS: Partial<Record<JobRole, string[]>> = {
  devops: ["sre", "site reliability", "site reliability engineer", "site reliability engineering"],
};

const ROLE_DEFINITIONS: RoleDefinition[] = [
  { value: "fullstack", titlePatterns: ["full[ -]?stack", "fullstack"], descriptionPatterns: [] },
  { value: "frontend", titlePatterns: ["front[ -]?end", "frontend", "ui engineer", "web engineer", "client engineer"], descriptionPatterns: ["react", "vue", "angular", "svelte", "frontend"] },
  { value: "backend", titlePatterns: ["back[ -]?end", "backend", "api engineer", "server engineer"], descriptionPatterns: ["backend", "apis?", "services?", "server"] },
  { value: "platform", titlePatterns: ["platform", "infra", "infrastructure", "systems", "developer platform"], descriptionPatterns: ["platform", "infra", "infrastructure", "systems"] },
  { value: "data", titlePatterns: ["data engineer", "analytics engineer", "data platform", "data scientist", "data analyst"], descriptionPatterns: ["data engineer", "analytics engineer", "data platform", "data warehouse", "etl", "bi"] },
  { value: "ml", titlePatterns: ["machine learning", "ml engineer", "applied ai", "research engineer"], descriptionPatterns: ["machine learning", "ml engineer", "llm", "research engineer", "applied ai", "ai"] },
  { value: "sre", titlePatterns: ["sre", "site reliability", "site reliability engineer"], descriptionPatterns: ["sre", "site reliability", "site reliability engineer", "site reliability engineering"] },
  { value: "devops", titlePatterns: ["devops", "release engineer"], descriptionPatterns: ["devops", "kubernetes", "terraform", "release engineering"] },
  { value: "security", titlePatterns: ["security", "trust", "identity", "appsec"], descriptionPatterns: ["security", "trust", "identity", "iam", "privacy", "appsec"] },
  { value: "mobile", titlePatterns: ["mobile", "ios", "android", "swift", "kotlin", "react native", "flutter"], descriptionPatterns: ["mobile", "ios", "android", "swift", "kotlin", "react native", "flutter"] },
  { value: "product", titlePatterns: ["product manager", "technical product manager", "product owner", "pm"], descriptionPatterns: ["product manager", "technical product manager", "product owner"] },
  { value: "design", titlePatterns: ["designer", "product design", "ux", "visual design", "brand design"], descriptionPatterns: ["designer", "product design", "ux", "visual design", "brand design"] },
  { value: "qa", titlePatterns: ["qa", "quality assurance", "test engineer", "automation testing"], descriptionPatterns: ["qa", "quality assurance", "test engineer", "automation testing", "testing"] },
];

function makePattern(term: string): string {
  return `(^|[^a-z0-9])(${term})([^a-z0-9]|$)`;
}

function normalizeText(title: string, description?: string | null): string {
  return `${title} ${description || ""}`.toLowerCase();
}

function countPatternMatches(text: string, patterns: string[]): number {
  return patterns.reduce(
    (count, pattern) => count + (new RegExp(makePattern(pattern), "i").test(text) ? 1 : 0),
    0
  );
}

function matchesRole(text: string, definition: RoleDefinition): boolean {
  const titleMatch = definition.titlePatterns.some((pattern) => new RegExp(makePattern(pattern), "i").test(text));
  const descriptionMatch = definition.descriptionPatterns.some((pattern) => new RegExp(makePattern(pattern), "i").test(text));
  return titleMatch || descriptionMatch;
}

export function classifyJobRole(title: string, description?: string | null): JobRole | null {
  const text = normalizeText(title, description);
  const matched = ROLE_DEFINITIONS.find((definition) => matchesRole(text, definition));
  return matched?.value ?? null;
}

export function inferJobRolesFromText(text: string, limit = 3): JobRoleInference[] {
  const normalized = text.toLowerCase();

  return ROLE_DEFINITIONS.map((definition) => {
    const titleHits = countPatternMatches(normalized, definition.titlePatterns);
    const descriptionHits = countPatternMatches(normalized, definition.descriptionPatterns);
    const excludeHits = countPatternMatches(normalized, ROLE_EXCLUDE_PATTERNS[definition.value] ?? []);
    const score = titleHits * 3 + descriptionHits - excludeHits * 2;

    return { role: definition.value, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildPatternSql(expr: string, patterns: string[], params: SqlParam[]): string {
  return `(${patterns.map((pattern) => `${expr} ~* ${pushParam(params, makePattern(pattern))}`).join(" OR ")})`;
}

export function buildJobRoleSql(params: SqlParam[], role: JobRole): string {
  const definition = ROLE_DEFINITIONS.find((entry) => entry.value === role);
  if (!definition) return "FALSE";

  const titleExpr = "LOWER(COALESCE(title, ''))";
  const descriptionExpr = "LOWER(COALESCE(description, ''))";
  const includeSql = [
    buildPatternSql(titleExpr, definition.titlePatterns, params),
    buildPatternSql(descriptionExpr, definition.descriptionPatterns, params),
  ].join(" OR ");
  const excludePatterns = ROLE_EXCLUDE_PATTERNS[role] ?? [];
  if (excludePatterns.length === 0) return includeSql;

  const excludeSql = [
    buildPatternSql(titleExpr, excludePatterns, params),
    buildPatternSql(descriptionExpr, excludePatterns, params),
  ].join(" OR ");
  return `(${includeSql} AND NOT ${excludeSql})`;
}
