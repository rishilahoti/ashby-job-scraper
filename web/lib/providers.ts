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
] as const;

export const PROVIDER_NAMES = PROVIDERS.map((p) => p.label);

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.value, p.label])
);
