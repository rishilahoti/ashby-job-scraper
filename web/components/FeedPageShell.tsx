"use client";

import { useState } from "react";
import Filters from "@/components/Filters";
import FeedResults from "@/components/FeedResults";
import ResumeMatcher from "@/components/ResumeMatcher";
import type { JobWithScore, PaginatedResult } from "@/lib/types";
import type { ResumeInsights } from "@/lib/resume-types";

type Result = PaginatedResult<JobWithScore>;

export default function FeedPageShell({
  initial,
  companies,
  departments,
  locations,
  tagOptions,
}: {
  initial: Result;
  companies: string[];
  departments: string[];
  locations: string[];
  tagOptions: string[];
}) {
  const [resumeInsights, setResumeInsights] = useState<ResumeInsights | null>(null);
  const [resumeQueryKey, setResumeQueryKey] = useState<string>("");

  const overrideResult = resumeInsights
    ? {
        data: resumeInsights.jobs,
        total: resumeInsights.jobs.length,
        page: 1,
        totalPages: 1,
      }
    : null;

  return (
    <>
      <ResumeMatcher
        insights={resumeInsights}
        onMatched={(insights, queryKey) => {
          setResumeInsights(insights);
          setResumeQueryKey(queryKey);
        }}
        onClear={() => setResumeInsights(null)}
      />

      <Filters
        companies={companies}
        departments={departments}
        locations={locations}
        tagOptions={tagOptions}
      />

      <FeedResults
        initial={initial}
        overrideResult={overrideResult}
        overrideQueryKey={resumeQueryKey}
        overrideLabel={resumeInsights ? `Showing ${resumeInsights.jobs.length} resume-matched jobs in the main feed.` : null}
        onClearOverride={() => setResumeInsights(null)}
      />
    </>
  );
}