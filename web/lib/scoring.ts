import rules from "../../src/config/rules.json";

/**
 * Experience filter (?exp=): jobs asking at most `value` years (jobs.min_years), or not saying.
 * Labels are the viewer's experience; `under` is the years /match puts in each.
 */
export const EXPERIENCE_OPTIONS = [
  { value: "1", label: "Fresher / new grad", under: 1 },
  { value: "2", label: "1–2 years", under: 3 },
  { value: "5", label: "3–5 years", under: 6 },
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
