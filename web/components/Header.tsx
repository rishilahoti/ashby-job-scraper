"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { useSession, signOut } from "next-auth/react";
import { useStatuses } from "./StatusProvider";
import { THEME_ICON, nextTheme, useTheme } from "./ThemeProvider";
import AccountMenu from "./AccountMenu";
import { GITHUB_REPO, GitHubIcon, useGitHubStars } from "./GitHubBadge";
import { SPONSOR_ID, SPONSOR_URL } from "@/lib/changelog";
import { useDismissed } from "@/lib/notification-store";
import { useCloseOnOutside } from "@/lib/useCloseOnOutside";
import { forYouHref, subscribeForYou } from "@/lib/for-you";

const FOR_YOU_ICON = "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z";

// d = the icon's svg path.
const MOBILE_LINKS: { href: string; label: string; d: string; accent?: boolean }[] = [
  { href: "/open-source", label: "Open source", d: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" },
  { href: "/changelog", label: "Changelog", d: "M9 4.5v15m6-15v15M4.5 9h15m-15 6h15" },
  { href: "/", label: "Feed", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { href: "/match", label: "Match resume", d: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" },
  { href: "/applied", label: "Applied", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/ignored", label: "Ignored", d: "M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243" },
  { href: "/add", label: "+ Add", d: "M12 4.5v15m7.5-7.5h-15", accent: true },
];

export default function Header() {
  const { appliedCount, ignoredCount } = useStatuses();
  const { theme, setTheme } = useTheme();
  const { status: sessionStatus } = useSession();
  const isAuthed = sessionStatus === "authenticated";
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const forYou = useSyncExternalStore(subscribeForYou, forYouHref, () => null);
  const menuRef = useRef<HTMLDivElement>(null);

  const counts: Record<string, number | undefined> = {
    "/applied": appliedCount,
    "/ignored": ignoredCount,
  };

  useCloseOnOutside(menuRef, menuOpen, setMenuOpen);

  return (
    <header className="border-b border-edge bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container-main flex items-center justify-between h-14">
        <div className="flex items-center gap-2">
          <Link href="/home" className="flex items-center group" aria-label="Ashby Jobs">
            <img
              src="/icon.png"
              alt="Ashby Jobs"
              width={28}
              height={28}
              className="rounded-md group-hover:scale-110 transition-transform"
            />
          </Link>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center rounded-md text-sm font-medium text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
          >
            <GitHubIcon className="w-6 h-6" />
          </a>
          <GitHubStars />
          <SponsorButton />
          <OpenSourceLink />
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <NavLink href="/changelog" label="Changelog" />
          <NavLink href="/" label="Feed" />
          {forYou && <NavLink href={forYou} label="For you" />}
          <NavLink href="/match" label="Match resume" />
          <NavLink href="/applied" label="Applied" count={appliedCount} />
          <NavLink href="/ignored" label="Ignored" count={ignoredCount} />
          <NavLink href="/add" label="+ Add" accent />
          {/* Theme lives in the account dropdown once signed in, per AccountMenu. */}
          {!isAuthed && <ThemeSwitcher theme={theme} setTheme={setTheme} />}
          <AccountMenu />
        </nav>

        {/* Mobile menu toggle + floating dropdown */}
        <div ref={menuRef} className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex items-center justify-center w-9 h-9 -mr-1.5 rounded-md text-ink-secondary hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <MenuIcon open={menuOpen} />
          </button>

          {menuOpen && (
            <nav
              className="absolute right-0 top-full mt-2 z-50 w-56 rounded-lg border border-edge
                         bg-paper shadow-xl overflow-hidden animate-menu-in origin-top-right"
            >
              <div className="p-1.5">
                {forYou && (
                  <MobileNavLink
                    href={forYou}
                    label="For you"
                    d={FOR_YOU_ICON}
                    onNavigate={() => setMenuOpen(false)}
                  />
                )}
                {MOBILE_LINKS.map(({ href, label, d, accent }) => (
                  <MobileNavLink
                    key={href}
                    href={href}
                    label={label}
                    d={d}
                    count={counts[href]}
                    accent={accent}
                    active={pathname === href}
                    onNavigate={() => setMenuOpen(false)}
                  />
                ))}
              </div>
              <div className="border-t border-edge p-1.5">
                {isAuthed ? (
                  <>
                    <MobileTextLink href="/profile" onNavigate={() => setMenuOpen(false)}>Profile</MobileTextLink>
                    <MobileTextLink href="/profile?tab=jobs" onNavigate={() => setMenuOpen(false)}>Jobs</MobileTextLink>
                    <MobileTextLink href="/profile?tab=integrations" onNavigate={() => setMenuOpen(false)}>Integrations</MobileTextLink>
                  </>
                ) : (
                  <MobileTextLink href="/signin" onNavigate={() => setMenuOpen(false)}>Sign in</MobileTextLink>
                )}
              </div>
              <div className="border-t border-edge p-1.5">
                <MobileThemeRow theme={theme} setTheme={setTheme} />
                {isAuthed && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                    className="w-full flex items-center px-3 py-2.5 rounded-md text-sm font-medium
                               text-signal hover:bg-signal-soft transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
      )}
    </svg>
  );
}

function GitHubStars() {
  const stars = useGitHubStars();

  return (
    <a
      href={GITHUB_REPO}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open GitHub repository"
      className="flex items-center rounded-md text-sm font-medium text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
      title="Star on GitHub"
    >
      <span className="text-amber-500 text-md" aria-hidden>★</span>
      <span className="font-mono text-xs tabular-nums inline-block min-w-[1.5em]">{stars !== null ? stars : "—"}</span>
    </a>
  );
}

// Where the sponsor notification lives once it's dismissed.
function SponsorButton() {
  const dismissed = useDismissed();
  if (!dismissed?.has(SPONSOR_ID)) return null;
  return (
    <a
      href={SPONSOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Sponsor Ashby Jobs on GitHub"
      title="Sponsor on GitHub"
      className="flex items-center gap-1 h-7 px-2 rounded-md border border-edge text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface transition-colors animate-menu-in"
    >
      <span className="text-pink-500" aria-hidden>♥</span>
      <span className="hidden sm:inline">Sponsor</span>
    </a>
  );
}

function OpenSourceLink() {
  return (
    <Link
      href="/open-source"
      title="ats-jobs: the open-source library behind this site"
      className="hidden sm:flex items-center gap-1 h-7 px-2 rounded-md border border-edge text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
    >
      <span className="font-mono text-ink-muted" aria-hidden>{"</>"}</span>
      <span>Open source</span>
    </Link>
  );
}

const THEME_LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

function ThemeSwitcher({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  const next = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${THEME_LABEL[theme]}, click for ${THEME_LABEL[next]}`}
      className="flex items-center justify-center w-7 h-7 ml-1 text-xs font-medium rounded text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer border-l border-edge"
      title={`Theme: ${theme} (click for ${next})`}
    >
      <span aria-hidden="true">{THEME_ICON[theme]}</span>
    </button>
  );
}

function MobileTextLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // Mostly /profile links — server-rendered per request, so no prefetch.
      prefetch={false}
      onClick={onNavigate}
      className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium
                 text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
    >
      {children}
    </Link>
  );
}

function MobileThemeRow({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  const next = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${THEME_LABEL[theme]}, click for ${THEME_LABEL[next]}`}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
                 text-ink-secondary hover:text-ink hover:bg-surface transition-colors cursor-pointer"
    >
      <span className="w-4.5 h-4.5 shrink-0 flex items-center justify-center text-ink-muted" aria-hidden>
        {THEME_ICON[theme]}
      </span>
      <span className="flex-1 text-left">Theme</span>
      <span className="text-xs font-mono text-ink-muted capitalize">{theme}</span>
    </button>
  );
}

function NavLink({
  href,
  label,
  count,
  accent,
}: {
  href: string;
  label: string;
  count?: number;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      // Viewport prefetch fetched all five header pages on every page view.
      prefetch={false}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
        ${accent
          ? "text-signal hover:text-signal/80 hover:bg-signal-soft"
          : "text-ink-secondary hover:text-ink hover:bg-surface"
        }`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="font-mono text-xs text-ink-muted">{count}</span>
      )}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  d,
  count,
  accent,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  d: string;
  count?: number;
  accent?: boolean;
  active?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
        ${accent
          ? "text-signal hover:bg-signal-soft"
          : active
            ? "bg-surface text-ink"
            : "text-ink-secondary hover:text-ink hover:bg-surface"
        }`}
    >
      <svg className={`w-4.5 h-4.5 shrink-0 ${accent ? "" : "text-ink-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="font-mono text-xs text-ink-muted">{count}</span>
      )}
    </Link>
  );
}
