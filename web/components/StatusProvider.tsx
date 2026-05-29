"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  loadStatuses,
  setStatus as writeStatus,
  getStatus,
  countByStatus,
  type JobStatus,
  type StatusMap,
} from "@/lib/status-store";

interface StatusContextValue {
  statuses: StatusMap;
  getJobStatus: (jobId: string) => JobStatus;
  toggleStatus: (jobId: string, target: JobStatus) => void;
  appliedCount: number;
  ignoredCount: number;
}

const StatusContext = createContext<StatusContextValue>({
  statuses: {},
  getJobStatus: () => "new",
  toggleStatus: () => {},
  appliedCount: 0,
  ignoredCount: 0,
});

export function useStatuses() {
  return useContext(StatusContext);
}

function syncStatusToDb(jobId: string, status: JobStatus) {
  fetch(`/api/jobs/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }).catch(() => {}); // fire-and-forget; localStorage is the primary store
}

export default function StatusProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setStatuses(loadStatuses());
    setMounted(true);
  }, []);

  const getJobStatus = useCallback(
    (jobId: string) => getStatus(statuses, jobId),
    [statuses]
  );

  const toggleStatus = useCallback(
    (jobId: string, target: JobStatus) => {
      const next = getStatus(statuses, jobId) === target ? "new" : target;
      setStatuses(writeStatus(statuses, jobId, next));
      syncStatusToDb(jobId, next);
    },
    [statuses]
  );

  const appliedCount = countByStatus(statuses, "applied");
  const ignoredCount = countByStatus(statuses, "ignored");

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <StatusContext.Provider
      value={{ statuses, getJobStatus, toggleStatus, appliedCount, ignoredCount }}
    >
      {children}
    </StatusContext.Provider>
  );
}
