// Single source of truth for the ATS providers this app scrapes — used by the
// filter dropdown, source badges, the +Add form, and SEO/AEO copy, so adding a
// new provider means updating one list instead of hunting through every page.
export const PROVIDERS = [
  { value: "ashby", label: "Ashby" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "workable", label: "Workable" },
  { value: "recruitee", label: "Recruitee" },
  { value: "teamtailor", label: "Teamtailor" },
  { value: "pinpoint", label: "Pinpoint" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "workday", label: "Workday" },
  { value: "keka", label: "Keka" },
  { value: "rippling", label: "Rippling" },
  { value: "personio", label: "Personio" },
  { value: "breezy", label: "Breezy" },
] as const;

export const PROVIDER_NAMES = PROVIDERS.map((p) => p.label);

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.value, p.label])
);

export type Source = (typeof PROVIDERS)[number]["value"];

// Board URL to slug, tried in this order. The +Add form previews with it and the companies route
// parses with it, so the two can't drift apart.
export const URL_PATTERNS: Record<Source, RegExp> = {
  ashby: /(?:https?:\/\/)?jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
  lever: /(?:https?:\/\/)?jobs\.lever\.co\/([a-zA-Z0-9_-]+)/,
  greenhouse: /(?:https?:\/\/)?(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/,
  workable: /(?:https?:\/\/)?apply\.workable\.com\/([a-zA-Z0-9_-]+)/,
  recruitee: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.recruitee\.com/,
  // North American boards live on acme.na.teamtailor.com; keep ".na" in the slug.
  teamtailor: /(?:https?:\/\/)?([a-zA-Z0-9_-]+(?:\.na)?)\.teamtailor\.com/,
  pinpoint: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.pinpointhq\.com/,
  smartrecruiters: /(?:https?:\/\/)?jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/,
  // Only ATS spread across per-tenant subdomains AND a numbered host (wd1-wd12)
  // AND an arbitrary site path — readers join the 3 capture groups into one
  // "tenant/wdHost/site" slug, unlike every other source's single group.
  workday: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-zA-Z]{2}-[a-zA-Z]{2}\/)?([a-zA-Z0-9_-]+)/,
  keka: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.keka\.com/,
  rippling: /(?:https?:\/\/)?ats\.rippling\.com\/(?:[a-zA-Z]{2}-[a-zA-Z]{2}\/)?([a-zA-Z0-9_-]+)/,
  personio: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.jobs\.personio\.(?:de|com)/,
  breezy: /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.breezy\.hr/,
};

export function matchBoardUrl(input: string): { source: Source; slug: string } | null {
  for (const source of Object.keys(URL_PATTERNS) as Source[]) {
    const match = input.trim().match(URL_PATTERNS[source]);
    if (match) return { source, slug: match.slice(1).filter(Boolean).join("/") };
  }
  return null;
}

