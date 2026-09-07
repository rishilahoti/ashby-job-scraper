"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStatuses } from "./StatusProvider";
import { useTheme } from "./ThemeProvider";

const GITHUB_REPO = "https://github.com/rishilahoti/ashbyhq-scraper";
const GITHUB_API_REPO = "https://api.github.com/repos/rishilahoti/ashbyhq-scraper";

const MOBILE_LINKS: { href: string; label: string; icon: string; accent?: boolean }[] = [
  { href: "/", label: "Feed", icon: "feed" },
  { href: "/applied", label: "Applied", icon: "applied" },
  { href: "/ignored", label: "Ignored", icon: "ignored" },
  { href: "/add", label: "+ Add", icon: "add", accent: true },
];

export default function Header() {
  const { appliedCount, ignoredCount } = useStatuses();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  const counts: Record<string, number | undefined> = {
    "/applied": appliedCount,
    "/ignored": ignoredCount,
  };

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <header className="border-b border-edge bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container-main flex items-center justify-between h-14">
        <div className="flex items-center gap-2">
          <Link href="/home" className="flex items-center group" aria-label="Ashby Jobs">
            <img
              src="/icon"
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
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <NavLink href="/" label="Feed" />
          <NavLink href="/applied" label="Applied" count={appliedCount} />
          <NavLink href="/ignored" label="Ignored" count={ignoredCount} />
          <NavLink href="/add" label="+ Add" accent />
          <ThemeSwitcher theme={theme} setTheme={setTheme} />
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
                {MOBILE_LINKS.map(({ href, label, icon, accent }) => (
                  <MobileNavLink
                    key={href}
                    href={href}
                    label={label}
                    icon={icon}
                    count={counts[href]}
                    accent={accent}
                    active={pathname === href}
                    onNavigate={() => setMenuOpen(false)}
                  />
                ))}
              </div>
              <div className="border-t border-edge p-1.5">
                <MobileThemeRow theme={theme} setTheme={setTheme} />
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

const MOBILE_LINK_ICON_PATHS: Record<string, string> = {
  feed: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  applied: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  ignored: "M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243",
  add: "M12 4.5v15m7.5-7.5h-15",
};

function MobileLinkIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={MOBILE_LINK_ICON_PATHS[name]} />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
    </svg>
  );
}

function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(GITHUB_API_REPO, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => typeof data.stargazers_count === "number" && setStars(data.stargazers_count))
      .catch(() => { });
    return () => controller.abort();
  }, []);

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

const THEME_ORDER = ["light", "dark", "system"] as const;
const THEME_ICON = { light: "☀", dark: "☾", system: "◐" } as const;
const THEME_LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

function ThemeSwitcher({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
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

function MobileThemeRow({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
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
  icon,
  count,
  accent,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  count?: number;
  accent?: boolean;
  active?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
        ${accent
          ? "text-signal hover:bg-signal-soft"
          : active
            ? "bg-surface text-ink"
            : "text-ink-secondary hover:text-ink hover:bg-surface"
        }`}
    >
      <MobileLinkIcon name={icon} className={`w-4.5 h-4.5 shrink-0 ${accent ? "" : "text-ink-muted"}`} />
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="font-mono text-xs text-ink-muted">{count}</span>
      )}
    </Link>
  );
}
