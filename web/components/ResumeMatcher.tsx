"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResumeInsights } from "@/lib/resume-types";

export default function ResumeMatcher({
  insights,
  onMatched,
  onClear,
}: {
  insights: ResumeInsights | null;
  onMatched: (insights: ResumeInsights, queryKey: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadResume(file: File | null) {
    if (!file) return;

    const formData = new FormData();
    formData.set("resume", file);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/resume/match", {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let payload: { error?: string } | ResumeInsights = {};
      try {
        payload = raw ? JSON.parse(raw) as { error?: string } | ResumeInsights : {};
      } catch {
        payload = { error: raw || `Request failed with status ${response.status}` };
      }
      if (!response.ok) {
        setError((payload as { error?: string })?.error || "Failed to match resume");
        return;
      }
      onMatched(payload as ResumeInsights, window.location.search.replace(/^\?/, ""));
    } catch {
      setError("Failed to match resume");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-edge bg-paper/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Resume match</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload a PDF resume here on the jobs page to see matching roles and jobs without signing in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {insights && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center justify-center rounded-md border border-edge px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-edge-strong"
            >
              Clear recommendations
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-edge bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-edge-strong">
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => {
                void uploadResume(event.target.files?.[0] || null);
                event.currentTarget.value = "";
              }}
            />
            {busy ? "Parsing PDF..." : "Upload resume PDF"}
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {insights && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-ink-secondary">Matching roles</p>
              <div className="flex flex-wrap gap-2">
                {insights.roles.length === 0 && <span className="text-sm text-ink-muted">No strong role signal found.</span>}
                {insights.roles.map((match) => (
                  <Link
                    key={match.role}
                    href={`/?role=${match.role}`}
                    className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-sm text-ink hover:border-edge-strong"
                  >
                    <span>{match.label}</span>
                    <span className="text-xs text-ink-muted">{match.score}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-ink-secondary">Detected keywords</p>
              <div className="flex flex-wrap gap-2">
                {insights.keywords.length === 0 && <span className="text-sm text-ink-muted">No keyword matches found.</span>}
                {insights.keywords.map((keyword) => (
                  <Link
                    key={keyword}
                    href={`/?search=${encodeURIComponent(keyword)}`}
                    className="rounded-full border border-edge bg-surface px-3 py-1 text-xs text-ink-secondary hover:border-edge-strong"
                  >
                    {keyword}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}