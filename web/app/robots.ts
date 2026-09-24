import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // "/?" blocks feed filter/page combos: duplicates of the canonical "/"
        // that each cost a render per crawl. "/?" not "/*?" so hashed metadata
        // URLs like /icon?abc stay fetchable. Job pages stay crawlable (ISR-cached).
        disallow: ["/api/", "/?", "/applied", "/ignored", "/add", "/signin", "/profile"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
