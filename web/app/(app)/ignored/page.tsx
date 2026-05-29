"use client";

import { useEffect, useState, useMemo } from "react";
import { useStatuses } from "@/components/StatusProvider";
import JobList from "@/components/JobList";
import type { JobWithScore } from "@/lib/types";

export default function IgnoredPage() {
  const { statuses } = useStatuses();
  const [jobs, setJobs] = useState<JobWithScore[]>([]);
  const [loading, setLoading] = useState(true);

  const ignoredIds = useMemo(
    () =>
      Object.entries(statuses)
        .filter(([, s]) => s === "ignored")
        .map(([id]) => id),
    [statuses]
  );

  useEffect(() => {
    if (ignoredIds.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    ignoredIds.forEach((id) => params.append("ids", id));

    fetch(`/api/jobs/batch?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => setJobs(res.data ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [ignoredIds]);

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
