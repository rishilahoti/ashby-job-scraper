import type { Job, JobWithScore } from "./types";
import { computeScore } from "../../src/intelligence/rules-engine";
import rulesData from "../../src/config/rules.json";

interface Rules {
  keywords: Record<string, number>;
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

/** Tag options for filter UI: keywords with positive weight, sorted */
export const POSITIVE_TAG_OPTIONS: string[] = Object.entries(rules.keywords)
  .filter(([, w]) => w > 0)
  .map(([k]) => k)
  .sort();

export function scoreJob(job: Job): JobWithScore {
  const result = computeScore(job, rules) as ScoreResult;
  const matchedKeywords = result.keywords.matched
    .filter((m) => m.weight > 0)
    .map((m) => m.keyword);

  return { ...job, score: result.score, matchedKeywords };
}
