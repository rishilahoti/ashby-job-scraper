import type { Job, JobWithScore } from "./types";
import { computeScore, jobTags } from "../../src/intelligence/rules-engine";
import rulesData from "../../src/config/rules.json";

interface Rules {
  keywords: Record<string, number>;
  niches: Record<string, string[]>;
  tags: string[];
  locations: string[];
  departments: string[];
  remoteBoost: number;
  locationBoost: number;
  departmentBoost: number;
  freshnessBoostHours: number;
  freshnessBoost: number;
}

interface ScoreResult {
  score: number;
  keywords: { matched: { keyword: string; weight: number }[] };
}

const rules = rulesData as Rules;

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

export function scoreJob(job: Job): JobWithScore {
  const result = computeScore(job, rules) as ScoreResult;
  // Same tags the scraper stores in matched_keywords, so a job page shows
  // what the feed filters on.
  const matchedKeywords: string[] = jobTags(job, rules, result.keywords.matched);
  return { ...job, score: result.score, matchedKeywords };
}
