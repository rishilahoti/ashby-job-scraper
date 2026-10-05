import { useMemo, useSyncExternalStore } from "react";
import { parseDismissed } from "./changelog.ts";

// Which notifications this browser dismissed. Shared by the notification
// stack and the header's Sponsor button, so dismissing the sponsor card
// shows the button at once.
const KEY = "notifications-dismissed";
const LEGACY_KEY = "changelog-seen";
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage disabled: nothing is dismissed
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // dismissals in other tabs
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Dismissals storage refused to keep: they last until the page reloads.
let unsaved: string[] = [];

// A string, so an unchanged store gives an identical snapshot.
const getSnapshot = () => `${read(KEY) ?? ""}\n${read(LEGACY_KEY) ?? ""}\n${unsaved.join(" ")}`;

// null on the server and during hydration: localStorage isn't known yet, so
// nothing that depends on it renders until it is.
export function useDismissed(): Set<string> | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return useMemo(() => {
    if (snapshot === null) return null;
    const [stored, legacy, extra] = snapshot.split("\n");
    const dismissed = parseDismissed(stored || null, legacy || null);
    for (const id of extra.split(" ")) if (id) dismissed.add(id);
    return dismissed;
  }, [snapshot]);
}

export function dismissNotifications(ids: string[]) {
  const dismissed = parseDismissed(read(KEY), read(LEGACY_KEY));
  for (const id of ids) dismissed.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...dismissed]));
  } catch {
    unsaved = [...unsaved, ...ids];
  }
  listeners.forEach((notify) => notify());
}
