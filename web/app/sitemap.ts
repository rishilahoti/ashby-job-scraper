import type { MetadataRoute } from "next";
import { query } from "@/lib/db";
import { MIN_DESCRIPTION_CHARS } from "@/lib/content";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export const revalidate = 86400;

const staticUrls: MetadataRoute.Sitemap = [
  { url: `${siteUrl}/home`, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
  { url: `${siteUrl}/open-source`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  { url: `${siteUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  { url: siteUrl, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // Only pages with a real description: Workday and SmartRecruiters list no
    // description at all, and AdSense rejected the site for empty pages.
    // created_at, not updated_at: the scraper bumps updated_at on every job
    // nightly (touchJob), so all 5000 entries claimed "modified today" every
    // day and invited crawlers to re-fetch (and re-render) them all.
    const { rows } = await query<{ job_id: string; created_at: string }>(
      `SELECT job_id, created_at
       FROM jobs
       WHERE is_active = TRUE AND length(description) >= $1
       ORDER BY created_at DESC
       LIMIT 5000`,
      [MIN_DESCRIPTION_CHARS]
    );

    const jobUrls: MetadataRoute.Sitemap = rows
      .filter((row) => row.job_id && row.created_at)
      .map((row) => ({
        url: `${siteUrl}/jobs/${row.job_id}`,
        lastModified: new Date(row.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    return [...staticUrls, ...jobUrls];
  } catch (err) {
    // The deploy build sets this: failing it beats shipping a sitemap with no jobs.
    if (process.env.REQUIRE_DB) throw err;
    return staticUrls;
  }
}
