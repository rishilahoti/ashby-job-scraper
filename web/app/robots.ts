import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/applied", "/ignored", "/add"],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/llms.txt`],
    host: siteUrl,
  };
}
