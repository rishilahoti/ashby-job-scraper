import rules from "../../src/config/rules.json";

/** Experience filter (?exp=): jobs asking at most `value` years (jobs.min_years), or not saying */
export const EXPERIENCE_OPTIONS = [
  { value: "2", label: "0–2 years" },
  { value: "5", label: "3–5 years" },
];

/** Tag options for the filter UI: every tag jobTags can give a job, sorted */
export const POSITIVE_TAG_OPTIONS: string[] = [
  ...new Set([
    ...Object.entries(rules.keywords)
      .filter(([, w]) => w > 0)
      .map(([k]) => k),
    ...Object.keys(rules.niches),
    ...rules.tags,
  ]),
].sort();
