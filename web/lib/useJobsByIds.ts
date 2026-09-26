"use client";

import { useEffect, useState } from "react";
import type { JobWithScore } from "./types";

// Mirrors /api/jobs/batch's own MAX_IDS — send more than this in one request
// and the route 400s instead of returning data.
const BATCH_SIZE = 200;

// Session-wide and shared by Applied/Ignored: every mark/unmark changes the id
// list, which used to re-download every job on it. null = no such job.
// ponytail: never invalidated, so a job closing mid-session shows as open
// until reload; add a TTL if that ever matters.
const cache = new Map<string, JobWithScore | null>();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Loaded = { jobs: JobWithScore[]; incomplete: boolean };

/**
 * Jobs for `ids`, in order, fetching only ids not seen yet this session.
 * `incomplete`: some batch failed, so the list is short (retried next load).
 */
export async function loadJobsByIds(ids: string[]): Promise<Loaded> {
  const missing = ids.filter((id) => !cache.has(id));
  await Promise.all(
    chunk(missing, BATCH_SIZE).map((batch) => {
      const params = new URLSearchParams();
      batch.forEach((id) => params.append("ids", id));
      return fetch(`/api/jobs/batch?${params.toString()}`)
        .then((r) => {
          if (!r.ok) throw new Error(`batch ${r.status}`);
          return r.json();
        })
        .then(({ data }: { data: JobWithScore[] }) => {
          for (const id of batch) cache.set(id, null);
          for (const job of data) cache.set(job.jobId, job);
        })
        .catch(() => {}); // left uncached, so the next load retries it
    })
  );
  return {
    jobs: ids.map((id) => cache.get(id)).filter((job): job is JobWithScore => !!job),
    incomplete: ids.some((id) => !cache.has(id)),
  };
}

/** Applied/Ignored pages: jobs for a (possibly 200+) list of ids. */
export function useJobsByIds(ids: string[]): Loaded & { loading: boolean } {
  const [loaded, setLoaded] = useState<Loaded>({ jobs: [], incomplete: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadJobsByIds(ids).then((result) => {
      if (cancelled) return;
      setLoaded(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return { ...loaded, loading };
}
