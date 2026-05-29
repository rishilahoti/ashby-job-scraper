import { Suspense } from "react";
import type { Metadata } from "next";
import { getJobs, getCompanies, getStats, getDepartments, getLocations } from "@/lib/query";
import { POSITIVE_TAG_OPTIONS } from "@/lib/scoring";
import type { JobFilters } from "@/lib/types";
import JobList from "@/components/JobList";
import Filters from "@/components/Filters";
import Pagination from "@/components/Pagination";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  const title = `Browse ${stats.total.toLocaleString()} Tech Startup Jobs on AshbyHQ`;
  const description = `Discover ${stats.total.toLocaleString()} active job listings from ${stats.companies}+ top tech startups on AshbyHQ — OpenAI, Figma, Anthropic, Linear, Cursor, Vercel, and more. Filter by remote, department, and company. Updated twice daily.`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: siteUrl,
      images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "Ashby Tracker — Every AshbyHQ Job in One Feed" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/opengraph-image`],
    },
    alternates: { canonical: siteUrl },
  };
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const filters: JobFilters = {};
  if (sp.search) filters.search = sp.search;
  if (sp.company) filters.company = sp.company;
  if (sp.remote === "true") filters.remote = true;
  if (sp.minScore) filters.minScore = parseInt(sp.minScore, 10);
  if (sp.employmentType) filters.employmentType = sp.employmentType;
  if (sp.department) filters.department = sp.department;
  if (sp.team) filters.team = sp.team;
  if (sp.location) filters.location = sp.location;
  if (sp.tags) {
    const allowed = new Set(POSITIVE_TAG_OPTIONS.map((t) => t.toLowerCase()));
    filters.tags = sp.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t && allowed.has(t));
      if (filters.tags.length === 0) delete filters.tags;
  }
  if (sp.sort) filters.sort = sp.sort as JobFilters["sort"];
  if (sp.page) filters.page = parseInt(sp.page, 10);

  const [result, companies, stats, departments, locations] = await Promise.all([
    getJobs(filters),
    getCompanies(),
    getStats(),
    getDepartments(),
    getLocations(),
  ]);

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Ashby Tracker",
    url: siteUrl,
    description: `Browse ${stats.total.toLocaleString()} active job listings from ${stats.companies}+ top tech startups on AshbyHQ.`,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/?search={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <div className="flex items-baseline gap-6 mb-1">
        <h1 className="font-display text-xl font-bold tracking-tight">Ashby Tracker</h1>
        <div className="flex gap-4">
          <Stat label="Jobs" value={stats.total} />
          <Stat label="Companies" value={stats.companies} />
        </div>
      </div>

      <Suspense fallback={null}>
        <Filters
          companies={companies}
          departments={departments}
          locations={locations}
          tagOptions={POSITIVE_TAG_OPTIONS}
        />
      </Suspense>

      <div className="mt-2">
        <JobList jobs={result.data} />
      </div>

      <Suspense fallback={null}>
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-sm font-medium tabular-nums text-ink">
        {value}
      </span>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}
