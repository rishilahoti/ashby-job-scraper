import type { JobWithScore } from "./types";
import type { JobRole } from "./job-role";

export interface ResumeRoleMatch {
  role: JobRole;
  label: string;
  score: number;
}

export interface ResumeJobMatch extends JobWithScore {
  matchScore: number;
}

export interface ResumeSummary {
  keywords: string[];
  roles: ResumeRoleMatch[];
}

export interface ResumeInsights extends ResumeSummary {
  jobs: ResumeJobMatch[];
}