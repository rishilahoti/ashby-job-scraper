import type { Job } from "./types";

// Below this a job page is a title and an Apply link: no index, no ads, not in
// the sitemap. Workday and SmartRecruiters jobs have no description at all.
export const MIN_DESCRIPTION_CHARS = 500;

export const hasContent = (job: Pick<Job, "isActive" | "description">) =>
  job.isActive && (job.description?.trim().length ?? 0) >= MIN_DESCRIPTION_CHARS;
