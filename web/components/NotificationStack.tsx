"use client";

import Link from "next/link";
import { visibleNotifications } from "@/lib/changelog";
import { dismissNotifications, useDismissed } from "@/lib/notification-store";

const ACTION = "text-xs font-medium text-signal hover:text-signal/80 transition-colors";
const BUTTON = "text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer";

// Bottom-right stack: the top card is live and up to two more peek out above
// it. Dismissing the top card brings the next one forward. The sponsor card,
// once dismissed, reappears as the header's Sponsor button.
export default function NotificationStack() {
  const dismissed = useDismissed();
  if (!dismissed) return null;
  const items = visibleNotifications(dismissed);
  if (items.length === 0) return null;

  const [top, ...rest] = items;
  const dismissTop = () => dismissNotifications([top.id]);
  const dismissAll = () => dismissNotifications(items.map((n) => n.id));

  return (
    <section aria-label="Notifications" className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <div className="relative isolate">
        {rest.slice(0, 2).map((n, i) => (
          <div
            key={n.id}
            aria-hidden
            className="absolute inset-0 -z-10 origin-top rounded-lg border border-edge bg-paper shadow-md transition-transform duration-300"
            style={{ transform: `translateY(${-(i + 1) * 8}px) scale(${1 - (i + 1) * 0.05})` }}
          />
        ))}
        <div key={top.id} className="rounded-lg border border-edge bg-paper shadow-xl p-4 animate-menu-in">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-signal">{top.kicker}</p>
            {items.length > 1 && <p className="text-[10px] font-mono text-ink-muted">1 of {items.length}</p>}
          </div>
          <p className="text-sm font-semibold text-ink mb-1">{top.title}</p>
          <p className="text-xs text-ink-secondary mb-3">{top.description}</p>
          <div className="flex items-center gap-3">
            {top.action.external ? (
              <a href={top.action.href} target="_blank" rel="noopener noreferrer" onClick={dismissTop} className={ACTION}>
                {top.action.label}
              </a>
            ) : (
              <Link href={top.action.href} onClick={dismissTop} className={ACTION}>
                {top.action.label}
              </Link>
            )}
            <button type="button" onClick={dismissTop} className={BUTTON}>
              Dismiss
            </button>
            {items.length > 1 && (
              <button type="button" onClick={dismissAll} className={`${BUTTON} ml-auto`}>
                Dismiss all
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
