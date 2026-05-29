"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStatuses } from "./StatusProvider";
import { useTheme } from "./ThemeProvider";

const GITHUB_REPO = "https://github.com/rishilahoti/ashbyhq-scraper";
const GITHUB_API_REPO = "https://api.github.com/repos/rishilahoti/ashbyhq-scraper";

export default function Header() {
  const { appliedCount, ignoredCount } = useStatuses();
  const { theme, setTheme } = useTheme();

  return (
    <header className="border-b border-edge bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container-main flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <Link href="/home" className="flex items-center gap-2.5 group">
            <span className="inline-block w-2 h-2 rounded-full bg-signal group-hover:scale-125 transition-transform" />
            <span className="font-display font-semibold text-sm tracking-tight text-ink">
              ASHBY TRACKER
            </span>
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

        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Feed" />
          <NavLink href="/applied" label="Applied" count={appliedCount} />
          <NavLink href="/ignored" label="Ignored" count={ignoredCount} />
          <NavLink href="/add" label="+ Add" accent />
          <ThemeSwitcher theme={theme} setTheme={setTheme} />
        </nav>
      </div>
    </header>
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
      .catch(() => {});
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
      <span className="font-mono text-xs tabular-nums">{stars !== null ? stars : "—"}</span>
    </a>
  );
}

function ThemeSwitcher({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 border-l border-edge"
      style={{ marginLeft: 0, paddingLeft: 6, paddingRight: 6 }}
    >
      {(["light", "dark", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          aria-label={t === "light" ? "Light theme" : t === "dark" ? "Dark theme" : "System theme"}
          aria-pressed={theme === t}
          className={`py-1 text-xs font-medium rounded transition-colors cursor-pointer ${theme === t ? "bg-edge-strong text-ink" : "text-ink-muted hover:text-ink hover:bg-surface"}`}
          style={{ display: "flex", justifyContent: "center", alignItems: "center", paddingLeft: 6, paddingRight: 6 }}
          title={t === "system" ? "Use system preference" : t}
        >
          <span style={{ textAlign: "center", padding: "0px"}} aria-hidden="true">
            {t === "light" ? "☀" : t === "dark" ? "☾" : "◐"}
          </span>
        </button>
      ))}
    </div>
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
