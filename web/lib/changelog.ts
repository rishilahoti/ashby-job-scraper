// Single source of truth for the "What's new" page and the announcement toast
// (components/ChangelogToast.tsx) — newest first.
export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "workday",
    date: "2026-09-22",
    title: "Workday support added",
    description: "Jobs posted on Workday now show up in the feed alongside every other supported ATS.",
  },
  {
    id: "more-providers",
    date: "2026-09-21",
    title: "5 new job boards added",
    description: "Workable, Recruitee, Teamtailor, Pinpoint, and SmartRecruiters jobs now show up in the feed.",
  },
  {
    id: "auth",
    date: "2026-09-21",
    title: "Sign in with Google, GitHub, or email",
    description: "Create an account to track applied and ignored jobs across every device.",
  },
];

// The entry the "what's new" toast currently announces — update this when a
// new feature should replace it as the highlighted announcement.
export const ANNOUNCED_ENTRY_ID = "auth";

export const ANNOUNCED_ENTRY = CHANGELOG.find((e) => e.id === ANNOUNCED_ENTRY_ID)!;

// A viewer hasn't seen the current announcement if their stored id is missing
// or stale (e.g. from a previous announced feature).
export function shouldShowAnnouncement(lastSeenId: string | null): boolean {
  return lastSeenId !== ANNOUNCED_ENTRY_ID;
}
