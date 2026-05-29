import type { MetadataRoute } from "next";
import { query } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { rows } = await query<{ job_id: string; updated_at: string }>(
    `SELECT job_id, updated_at
     FROM jobs
     WHERE is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 5000`
  );

  const jobUrls: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${siteUrl}/jobs/${row.job_id}`,
    lastModified: new Date(row.updated_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    ...jobUrls,
  ];
}
