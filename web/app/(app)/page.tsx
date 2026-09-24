import { Suspense } from "react";
import type { Metadata } from "next";
import { getJobs, getCompanies, getStats, getDepartments, getLocations } from "@/lib/query";
import { POSITIVE_TAG_OPTIONS } from "@/lib/scoring";
import { PROVIDER_NAMES } from "@/lib/providers";
import JobList from "@/components/JobList";
import Filters from "@/components/Filters";
import FeedResults from "@/components/FeedResults";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";
const providerList = PROVIDER_NAMES.join(", ");

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  const title = `Browse ${stats.total.toLocaleString()} Tech Startup Jobs on Ashby, Greenhouse, Lever & More`;
  const description = `Discover ${stats.total.toLocaleString()} active job listings from ${stats.companies}+ top tech startups across ${providerList} — OpenAI, Figma, Anthropic, Linear, Cursor, Vercel, and more. Filter by remote, department, and company. Updated daily.`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: siteUrl,
      images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "Ashby Jobs — Every AshbyHQ Job in One Feed" }],
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

// No searchParams here on purpose: reading them makes the page render on the
// server for every request. The page is static; FeedResults handles filters.
export default async function FeedPage() {
  const [result, companies, stats, departments, locations] = await Promise.all([
    getJobs(),
    getCompanies(),
    getStats(),
    getDepartments(),
    getLocations(),
  ]);

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Ashby Jobs",
    url: siteUrl,
    description: `Browse ${stats.total.toLocaleString()} active job listings from ${stats.companies}+ top tech startups across ${providerList}.`,
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
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-1">
        <h1 className="font-display text-xl font-bold tracking-tight whitespace-nowrap">Ashby Jobs</h1>
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

      {/* Fallback is the static HTML crawlers and first paint get. */}
      <Suspense
        fallback={
          <div className="mt-2">
            <JobList jobs={result.data} />
          </div>
        }
      >
        <FeedResults initial={result} />
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
