import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getJobById } from "@/lib/query";
import ScoreBadge from "@/components/ScoreBadge";
import StatusButton from "@/components/StatusButton";

export const revalidate = 600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getJobById(jobId);
  if (!job) return {};

  const title = `${job.title} at ${job.company}`;
  const rawDesc = job.description?.replace(/\s+/g, " ").trim() ?? "";
  const description = rawDesc.length > 155
    ? rawDesc.slice(0, 152) + "…"
    : rawDesc || `${job.title} opening at ${job.company}. Apply via AshbyHQ.`;
  const url = `${siteUrl}/jobs/${job.jobId}`;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url,
      publishedTime: job.publishedAt || undefined,
    },
    twitter: { card: "summary", title, description },
    alternates: { canonical: url },
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await getJobById(jobId);

  if (!job) notFound();

  const employmentTypeMap: Record<string, string> = {
    FullTime: "FULL_TIME",
    PartTime: "PART_TIME",
    Contract: "CONTRACTOR",
    Intern: "INTERN",
    Temporary: "TEMPORARY",
  };

  const jobSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || `${job.title} at ${job.company}`,
    hiringOrganization: { "@type": "Organization", name: job.company },
    datePosted: job.publishedAt ? new Date(job.publishedAt).toISOString().slice(0, 10) : undefined,
    directApply: true,
    url: `${siteUrl}/jobs/${job.jobId}`,
    ...(job.employmentType && {
      employmentType: employmentTypeMap[job.employmentType] ?? "FULL_TIME",
    }),
    ...(job.remote
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: { "@type": "Country", name: "Anywhere" },
        }
      : job.location && {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: job.location },
          },
        }),
    ...(job.compensationSummary && {
      baseSalary: { "@type": "MonetaryAmount", description: job.compensationSummary },
    }),
  };

  return (
    <div className="max-w-3xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobSchema) }}
      />
      {/* Breadcrumb */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors mb-6"
      >
        <span>&larr;</span>
        <span>Back to feed</span>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight leading-tight mb-1">
            {job.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink-secondary">{job.company}</span>
            <span className="text-edge-strong">&middot;</span>
            <span className="text-sm text-ink-muted">{job.location}</span>
            {job.remote && (
              <>
                <span className="text-edge-strong">&middot;</span>
                <span className="text-xs font-mono text-ink-muted">REMOTE</span>
              </>
            )}
          </div>
        </div>
        <ScoreBadge score={job.score} />
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-surface rounded-lg mb-6">
        <MetaCell label="Department" value={job.department} />
        <MetaCell label="Team" value={job.team} />
        <MetaCell label="Type" value={formatEmploymentType(job.employmentType)} />
        <MetaCell label="Posted" value={formatDate(job.publishedAt)} />
        {job.compensationSummary && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-0.5">
              Compensation
            </p>
            <p className="text-sm font-mono text-positive font-medium">{job.compensationSummary}</p>
          </div>
        )}
      </div>

      {/* Matched keywords */}
      {job.matchedKeywords.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-2">
            Matched Signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {job.matchedKeywords.map((kw) => (
              <span
                key={kw}
                className="text-xs font-mono px-2 py-0.5 rounded bg-signal-soft text-signal"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-start gap-2.5 mb-8 pb-6 border-b border-edge">
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-5 bg-signal text-white text-sm font-medium rounded-md hover:bg-signal-muted transition-colors"
        >
          Apply &rarr;
        </a>
        <StatusButton jobId={job.jobId} targetStatus="applied" label="Mark Applied" />
        <StatusButton jobId={job.jobId} targetStatus="ignored" label="Ignore" />
      </div>

      {/* Description */}
      <div className="prose-custom">
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-3">
          Description
        </p>
        <div
          className="text-sm leading-relaxed text-ink-secondary whitespace-pre-wrap"
          style={{ maxHeight: "60vh", overflowY: "auto" }}
        >
          {job.description}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-0.5">
        {label}
      </p>
      <p className="text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

function formatEmploymentType(t: string | null): string {
  if (!t) return "—";
  return t.replace(/([A-Z])/g, " $1").trim();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
