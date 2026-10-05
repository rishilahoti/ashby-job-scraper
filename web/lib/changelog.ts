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
    id: "role-and-tech-tags",
    date: "2026-10-05",
    title: "Filter by role and tech stack",
    description:
      "New tags for AI/ML, DevOps/SRE, mobile, data, security, QA, embedded and web3 roles, plus tech like Go, Rust, Java, AWS, Kubernetes, PyTorch and GraphQL.",
  },
  {
    id: "community-bug-fixes",
    date: "2026-09-27",
    title: "10 community-reported bugs fixed",
    description:
      "Thanks to @regalleo: every page of results is reachable again, searches for C++, C# and Node.js work, Workday links open, and Applied/Ignored lists keep closed jobs instead of dropping them.",
  },
  {
    id: "fast-search",
    date: "2026-09-25",
    title: "Search got much faster",
    description: "Searches for common words like \"AI\" used to take 7 to 15 seconds. They now return in under a second.",
  },
  {
    id: "full-text-search",
    date: "2026-09-24",
    title: "Smarter search",
    description:
      "Words now match in any order across titles, companies, locations and descriptions. Use \"quotes\" for an exact phrase and -word to exclude one.",
  },
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
export const ANNOUNCED_ENTRY_ID = "role-and-tech-tags";

export const ANNOUNCED_ENTRY = CHANGELOG.find((e) => e.id === ANNOUNCED_ENTRY_ID)!;

// A viewer hasn't seen the current announcement if their stored id is missing
// or stale (e.g. from a previous announced feature).
export function shouldShowAnnouncement(lastSeenId: string | null): boolean {
  return lastSeenId !== ANNOUNCED_ENTRY_ID;
}
