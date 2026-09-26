const STORAGE_KEY = "ashby-tracker-statuses";

export type JobStatus = "new" | "applied" | "ignored";

export type StatusMap = Record<string, JobStatus>;

export function loadStatuses(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStatuses(map: StatusMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// Called once local statuses have been merged into the signed-in user's
// server-side statuses — otherwise this stale copy survives every future
// unmark/reload and keeps re-merging itself back in.
export function clearStatuses() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getStatus(map: StatusMap, jobId: string): JobStatus {
  return map[jobId] || "new";
}

export function setStatus(
  map: StatusMap,
  jobId: string,
  status: JobStatus
): StatusMap {
  const next = { ...map };
  if (status === "new") {
    delete next[jobId];
  } else {
    next[jobId] = status;
  }
  saveStatuses(next);
  return next;
}

export function countByStatus(map: StatusMap, status: JobStatus): number {
  return Object.values(map).filter((s) => s === status).length;
}
