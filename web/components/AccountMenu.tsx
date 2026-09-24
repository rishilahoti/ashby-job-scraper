"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";

const THEME_ORDER = ["light", "dark", "system"] as const;
const THEME_ICON = { light: "☀", dark: "☾", system: "◐" } as const;

export default function AccountMenu() {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (status === "loading") return null;

  if (status !== "authenticated" || !session?.user) {
    return (
      <Link
        href="/signin"
        className="flex items-center px-3 py-1.5 rounded-md text-sm font-medium
                   text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 p-0 rounded-full overflow-hidden
                   border border-edge hover:border-edge-strong transition-colors cursor-pointer"
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs font-medium text-ink-secondary">
            {(session.user.name || session.user.email || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-52 rounded-lg border border-edge
                     bg-paper shadow-xl overflow-hidden animate-menu-in origin-top-right"
        >
          <div className="p-1.5 border-b border-edge">
            <p className="px-2 py-1 text-xs text-ink-muted truncate">{session.user.email}</p>
          </div>
          <div className="p-1.5">
            <MenuLink href="/profile" onNavigate={() => setOpen(false)}>Profile</MenuLink>
            <MenuLink href="/profile?tab=jobs" onNavigate={() => setOpen(false)}>Jobs</MenuLink>
            <MenuLink href="/profile?tab=integrations" onNavigate={() => setOpen(false)}>Integrations</MenuLink>
            <button
              type="button"
              onClick={() => setTheme(nextTheme)}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm
                         text-ink-secondary hover:text-ink hover:bg-surface transition-colors cursor-pointer"
            >
              <span className="w-4 text-center text-ink-muted" aria-hidden>{THEME_ICON[theme]}</span>
              <span className="flex-1 text-left">Theme</span>
              <span className="text-xs font-mono text-ink-muted capitalize">{theme}</span>
            </button>
          </div>
          <div className="p-1.5 border-t border-edge">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full text-left px-2 py-1.5 rounded-md text-sm text-signal
                         hover:bg-signal-soft transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onNavigate, children }: { href: string; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      // /profile is server-rendered per request; don't pay for it on menu open.
      prefetch={false}
      className="block px-2 py-1.5 rounded-md text-sm text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
    >
      {children}
    </Link>
  );
}
