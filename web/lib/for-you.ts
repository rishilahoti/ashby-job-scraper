// The feed URL of this browser's last resume match, behind the header's "For you"
// link. /match sets it; emptying the resume box there removes it.
export const FOR_YOU_KEY = "match-feed";

// Only a feed URL: anything else in storage isn't ours to link to.
export function forYouHref(): string | null {
  try {
    const href = localStorage.getItem(FOR_YOU_KEY);
    return href?.startsWith("/?") ? href : null;
  } catch {
    return null;
  }
}
