// The feed URL of this browser's last resume match, behind the header's "For you"
// link. /match sets it; emptying the resume box there removes it.
const KEY = "match-feed";

// Only a feed URL: anything else in storage isn't ours to link to.
export function forYouHref(): string | null {
  try {
    const href = localStorage.getItem(KEY);
    return href?.startsWith("/?") ? href : null;
  } catch {
    return null;
  }
}

export function setForYou(href: string | null) {
  try {
    if (href) localStorage.setItem(KEY, href);
    else localStorage.removeItem(KEY);
  } catch {
    // storage disabled: no "For you" link
  }
  // The browser fires "storage" in other tabs only; this tells this tab's header too.
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
}

export function subscribeForYou(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
