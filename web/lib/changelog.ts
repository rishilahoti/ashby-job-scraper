// Single source of truth for the "What's new" page and the notification stack
// (components/NotificationStack.tsx) — newest first.
export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "sponsors",
    date: "2026-10-06",
    title: "Ashby Jobs is on GitHub Sponsors",
    description:
      "The site is free, open source and ad-free. If it helped your job search, you can now support it on GitHub Sponsors.",
  },
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

export const SPONSOR_URL = "https://github.com/sponsors/rishilahoti";
export const SPONSOR_ID = "sponsor";

export interface AppNotification {
  id: string;
  kicker: string;
  title: string;
  description: string;
  action: { label: string; href: string; external?: boolean };
}

// Changelog entries that also get a notification, newest first. Not every
// entry deserves one: add an id here when a feature should be announced.
const ANNOUNCED_IDS = ["role-and-tech-tags", "auth"];

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The notification stack, top first. The sponsor card goes last and never
// fully disappears: once dismissed it lives on as the nav bar's Sponsor button.
export const NOTIFICATIONS: AppNotification[] = [
  ...ANNOUNCED_IDS.map((id) => {
    const entry = CHANGELOG.find((e) => e.id === id)!;
    return {
      id,
      kicker: `What's new · ${shortDate(entry.date)}`,
      title: entry.title,
      description: entry.description,
      action: { label: "See what's new", href: "/changelog" },
    };
  }),
  {
    id: SPONSOR_ID,
    kicker: "Free & open source",
    title: "Like Ashby Jobs? Sponsor it",
    description: "No ads, no paywall. Sponsors keep the daily scraper and the servers running.",
    action: { label: "Sponsor ♥", href: SPONSOR_URL, external: true },
  },
];

// Dismissed ids as stored in localStorage. legacySeenId is the old
// single-toast "changelog-seen" value: whatever it announced counts as seen.
export function parseDismissed(stored: string | null, legacySeenId: string | null): Set<string> {
  let ids: unknown = [];
  try {
    ids = JSON.parse(stored ?? "[]");
  } catch {
    // Corrupt value: treat it as nothing dismissed.
  }
  const dismissed = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  if (legacySeenId) dismissed.add(legacySeenId);
  return dismissed;
}

export function visibleNotifications(dismissed: Set<string>): AppNotification[] {
  return NOTIFICATIONS.filter((n) => !dismissed.has(n.id));
}
