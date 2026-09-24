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
export default function FeedResults({ initial }: { initial: Result }) {
  const qs = useSearchParams().toString();
  const [fetched, setFetched] = useState<Result | null>(null);

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
  const result = qs ? fetched : initial;
  if (!result) {
    return <p className="py-20 text-center text-sm text-ink-muted">Loading jobs…</p>;
  }

  return (
    <>
      <div className="mt-2">
        <JobList jobs={result.data} />
      </div>
      <Pagination page={result.page} totalPages={result.totalPages} total={result.total} />
    </>
  );
}
