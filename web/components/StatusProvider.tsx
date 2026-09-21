"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
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
  toggleStatus: () => { },
  appliedCount: 0,
  ignoredCount: 0,
});

export function useStatuses() {
  return useContext(StatusContext);
}

async function fetchServerStatuses(): Promise<StatusMap> {
  const res = await fetch("/api/status");
  if (!res.ok) return {};
  const data = await res.json();
  return (data.statuses || {}) as StatusMap;
}

export default function StatusProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthed = sessionStatus === "authenticated" && !!session?.user;

  const [statuses, setStatuses] = useState<StatusMap>({});
  const [mounted, setMounted] = useState(false);
  const mergedForUser = useRef<string | null>(null);

  // Anonymous: load from localStorage, same as before auth existed.
  useEffect(() => {
    if (isAuthed) return;
    Promise.resolve().then(() => {
      setStatuses(loadStatuses());
      setMounted(true);
    });
  }, [isAuthed]);

  // Signed in: pull server state, and — once per session — merge in any
  // localStorage statuses from prior anonymous use so switching to an
  // account never loses applied/ignored jobs someone already tracked.
  useEffect(() => {
    if (!isAuthed || !session?.user?.id) return;
    if (mergedForUser.current === session.user.id) return;
    mergedForUser.current = session.user.id;

    (async () => {
      const [server, local] = [await fetchServerStatuses(), loadStatuses()];
      const localOnlyIds = Object.keys(local).filter((id) => !(id in server));

      if (localOnlyIds.length > 0) {
        await Promise.all(
          localOnlyIds.map((jobId) =>
            fetch("/api/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, status: local[jobId] }),
            })
          )
        );
        for (const id of localOnlyIds) server[id] = local[id];
      }

      setStatuses(server);
      setMounted(true);
    })();
  }, [isAuthed, session?.user?.id]);

  const getJobStatus = useCallback(
    (jobId: string) => getStatus(statuses, jobId),
    [statuses]
  );

  const toggleStatus = useCallback(
    (jobId: string, target: JobStatus) => {
      const next = getStatus(statuses, jobId) === target ? "new" : target;

      if (isAuthed) {
        setStatuses((prev) => {
          const copy = { ...prev };
          if (next === "new") delete copy[jobId];
          else copy[jobId] = next;
          return copy;
        });
        fetch("/api/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, status: next }),
        }).catch(() => {});
      } else {
        setStatuses(writeStatus(statuses, jobId, next));
      }
    },
    [statuses, isAuthed]
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
