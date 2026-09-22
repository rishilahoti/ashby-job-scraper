"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ANNOUNCED_ENTRY, ANNOUNCED_ENTRY_ID, shouldShowAnnouncement } from "@/lib/changelog";

const STORAGE_KEY = "changelog-seen";

export default function ChangelogToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (shouldShowAnnouncement(localStorage.getItem(STORAGE_KEY))) setVisible(true);
    });
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, ANNOUNCED_ENTRY_ID);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-edge bg-paper shadow-xl p-4 animate-menu-in">
      <p className="text-[10px] font-mono uppercase tracking-wider text-signal mb-1">New — live now</p>
      <p className="text-sm font-semibold text-ink mb-1">{ANNOUNCED_ENTRY.title}</p>
      <p className="text-xs text-ink-secondary mb-3">{ANNOUNCED_ENTRY.description}</p>
      <div className="flex items-center gap-3">
        <Link
          href="/changelog"
          onClick={dismiss}
          className="text-xs font-medium text-signal hover:text-signal/80 transition-colors"
        >
          See what&apos;s new
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
