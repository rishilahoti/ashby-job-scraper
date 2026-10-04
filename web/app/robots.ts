import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

// "/?" blocks feed filter/page combos: duplicates of the canonical "/" that
// each cost a render per crawl. "/?" not "/*?" so hashed metadata URLs like
// /icon?abc stay fetchable.
const disallow = ["/api/", "/?", "/applied", "/ignored", "/add", "/signin", "/profile"];

// Job pages are long-tail ISR and ~97% of their hits were bots: every cold or
// stale page a crawler fetches is a render plus a paid ISR write. Only search
// engines (SEO / Google Jobs) and link-preview bots may crawl them.
const jobPageBots = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "redditbot",
  "TelegramBot",
  "MicrosoftPreview",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: jobPageBots, allow: "/", disallow },
      // No allow: "/" here: Next prints Allow lines first, and first-match
      // parsers would stop at it and never reach "/jobs/".
      { userAgent: "*", disallow: [...disallow, "/jobs/"] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
