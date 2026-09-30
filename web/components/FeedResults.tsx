"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import JobList from "./JobList";
import Pagination from "./Pagination";
import type { JobWithScore, PaginatedResult } from "@/lib/types";

type Result = PaginatedResult<JobWithScore>;

const EMPTY: Result = { data: [], total: 0, page: 1, totalPages: 0 };

// The feed page is static (one cached render for everyone). Filtered/paged
// views are fetched here from /api/jobs, which the CDN caches per query
// string — instead of a full server render of the page per filter combo.
export default function FeedResults({
  initial,
  overrideResult,
  overrideQueryKey,
  overrideLabel,
  onClearOverride,
}: {
  initial: Result;
  overrideResult?: Result | null;
  overrideQueryKey?: string | null;
  overrideLabel?: string | null;
  onClearOverride?: () => void;
}) {
  const qs = useSearchParams().toString();
  const [fetched, setFetched] = useState<Result | null>(null);
  const showingOverride = Boolean(overrideResult && qs === (overrideQueryKey || ""));

  useEffect(() => {
    if (!qs) return;
    let cancelled = false;
    fetch(`/api/jobs?${qs}`)
      .then((r) => (r.ok ? r.json() : EMPTY))
      .catch(() => EMPTY)
      .then((result: Result) => {
        if (!cancelled) setFetched(result);
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

  // While a new filter loads, the previous result stays on screen.
  const result = showingOverride ? overrideResult : (qs ? fetched : initial);
  if (!result) {
    return <p className="py-20 text-center text-sm text-ink-muted">Loading jobs…</p>;
  }

  return (
    <>
      {showingOverride && overrideLabel && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink-secondary">
          <span>{overrideLabel}</span>
          {onClearOverride && (
            <button
              type="button"
              onClick={onClearOverride}
              className="text-xs font-medium text-ink hover:text-signal transition-colors"
            >
              Back to normal feed
            </button>
          )}
        </div>
      )}
      <div className="mt-2">
        <JobList jobs={result.data} />
      </div>
      {!showingOverride && <Pagination page={result.page} totalPages={result.totalPages} total={result.total} />}
    </>
  );
}
