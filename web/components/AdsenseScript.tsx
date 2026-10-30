"use client";

import Script from "next/script";
import { useEffect } from "react";

let hardNavigation = false;

// Once Google's ad library runs in a page it stays for the life of that page:
// after a client-side hop to the feed or an empty job page, Auto ads (anchor ads
// especially) would keep showing there, which AdSense policy forbids. So from
// the first ad page on, same-site links and Back/Forward do full page loads, and
// every page without this component starts without the library. The cost is SPA
// speed, only after someone has opened a job page with ads.
export default function AdsenseScript() {
  useEffect(() => {
    if (hardNavigation) return; // listeners live for the page; never removed
    hardNavigation = true;
    window.addEventListener(
      "click",
      (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!link || link.origin !== location.origin || link.hasAttribute("download")) return;
        if (link.target && link.target !== "_self") return;
        // In-page anchors (#section) don't leave the page.
        if (link.pathname === location.pathname && link.search === location.search && link.hash) return;
        // Capture phase on window runs before React's root listener, so Next's
        // <Link> never sees the click and can't do a client-side navigation.
        e.preventDefault();
        e.stopPropagation();
        location.assign(link.href);
      },
      { capture: true }
    );
    // Back/Forward: the URL has already changed, reload it as a real page.
    window.addEventListener("popstate", () => location.reload());
  }, []);

  return (
    <Script
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8450633668347138"
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
