"use client";

import Link from "next/link";
import type { JobWithScore } from "@/lib/types";
import ScoreBadge from "./ScoreBadge";
import StatusButton from "./StatusButton";
import SourceTag from "./SourceTag";

export default function JobRow({ job, index }: { job: JobWithScore; index: number }) {
  return (
    <div
      className="animate-row group grid grid-cols-[auto_1fr_auto] gap-x-4 items-start
                 py-3.5 px-4 -mx-4 rounded-lg hover:bg-surface transition-colors"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Score */}
      <div className="pt-0.5">
        <ScoreBadge score={job.score} />
      </div>

      {/* Content */}
      <div className="min-w-0">
        <Link
          href={`/jobs/${job.jobId}`}
          className="text-sm font-medium text-ink hover:text-signal transition-colors leading-snug"
        >
          {job.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          <span className="text-xs font-medium text-ink-secondary">{job.company}</span>
          <Separator />
          <span className="text-xs text-ink-muted">{job.location}</span>
          <Separator />
          <SourceTag source={job.source} />
          {job.remote && (
            <>
              <Separator />
              <span className="text-xs text-ink-muted font-mono">REMOTE</span>
            </>
          )}
          {job.compensationSummary && (
            <>
              <Separator />
              <span className="text-xs text-positive font-mono">{job.compensationSummary}</span>
            </>
          )}
        </div>
        {job.matchedKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {job.matchedKeywords.slice(0, 6).map((kw) => (
              <span
                key={kw}
                className="text-[10px] font-mono px-1.5 py-px rounded bg-signal-soft text-signal"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <StatusButton
          jobId={job.jobId}
          targetStatus="applied"
          label="Applied"
          compact
        />
        <StatusButton
          jobId={job.jobId}
          targetStatus="ignored"
          label="Ignore"
          compact
        />
      </div>
    </div>
  );
}

function Separator() {
  return <span className="text-edge-strong select-none">&middot;</span>;
}
