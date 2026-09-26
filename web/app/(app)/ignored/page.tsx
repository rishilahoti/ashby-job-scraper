"use client";

import { useMemo } from "react";
import { useStatuses } from "@/components/StatusProvider";
import { useJobsByIds } from "@/lib/useJobsByIds";
import JobList from "@/components/JobList";

export default function IgnoredPage() {
  const { statuses } = useStatuses();

  const ignoredIds = useMemo(
    () =>
      Object.entries(statuses)
        .filter(([, s]) => s === "ignored")
        .map(([id]) => id),
    [statuses]
  );

  const { jobs, loading } = useJobsByIds(ignoredIds);

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4">
        <h1 className="font-display text-xl font-bold tracking-tight">Ignored</h1>
        <span className="font-mono text-sm text-ink-muted">{jobs.length}</span>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <p className="text-sm text-ink-muted animate-pulse">Loading...</p>
        </div>
      ) : (
        <JobList jobs={jobs} emptyMessage="No jobs ignored yet." />
      )}
    </div>
  );
}
