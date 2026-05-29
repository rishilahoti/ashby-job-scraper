"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import Link from "next/link";

type Phase = "idle" | "validating" | "scraping" | "success" | "error";

interface Result {
  company: string;
  slug: string;
  alreadyExisted: boolean;
  jobs: { total: number; inserted: number; updated: number; unchanged: number };
}

export default function AddCompanyForm() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const extractPreview = useCallback((raw: string): string | null => {
    const trimmed = raw.trim();
    const urlMatch = trimmed.match(
      /(?:https?:\/\/)?jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/
    );
    if (urlMatch) return urlMatch[1];
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
    return null;
  }, []);

  const slug = extractPreview(input);
  const isValid = slug !== null && slug.length > 0;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!isValid || phase === "validating" || phase === "scraping") return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError("");
      setResult(null);
      setPhase("validating");

      try {
        setPhase("scraping");

        const apiHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const apiSecret = process.env.NEXT_PUBLIC_API_SECRET;
        if (apiSecret) apiHeaders["Authorization"] = `Bearer ${apiSecret}`;

        const res = await fetch("/api/companies", {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ slug }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || `Request failed (${res.status})`);
          setPhase("error");
          return;
        }

        setResult(data);
        setPhase("success");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Network error");
        setPhase("error");
      }
    },
    [isValid, phase, slug]
  );

  const reset = useCallback(() => {
    setInput("");
    setPhase("idle");
    setResult(null);
    setError("");
  }, []);

  const busy = phase === "validating" || phase === "scraping";

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-xl font-bold tracking-tight mb-1">
          Add Company
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Paste an Ashby job board URL or company slug to start tracking their
          listings. The system will validate the board exists, then scrape and
          index all open positions.
        </p>
      </div>

      {phase === "success" && result ? (
        <div className="rounded-lg border border-positive/30 bg-positive-soft p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-positive text-white text-xs font-bold">
              ✓
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm text-ink">
                {result.alreadyExisted ? "Updated" : "Added"}{" "}
                <span className="text-positive">{result.company}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-secondary">
                <span>
                  {result.jobs.total} job{result.jobs.total !== 1 ? "s" : ""}{" "}
                  found
                </span>
                {result.jobs.inserted > 0 && (
                  <span className="text-positive">
                    +{result.jobs.inserted} new
                  </span>
                )}
                {result.jobs.updated > 0 && (
                  <span className="text-signal">
                    {result.jobs.updated} updated
                  </span>
                )}
                {result.jobs.unchanged > 0 && (
                  <span>{result.jobs.unchanged} unchanged</span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={`/?company=${encodeURIComponent(result.company)}`}
                  className="h-8 px-4 inline-flex items-center justify-center rounded-md text-xs font-medium
                             bg-ink text-paper hover:bg-ink/90 transition-colors"
                >
                  View jobs
                </Link>
                <button
                  onClick={reset}
                  className="h-8 px-4 inline-flex items-center justify-center rounded-md text-xs font-medium
                             border border-edge text-ink-secondary hover:border-edge-strong hover:text-ink
                             transition-colors cursor-pointer"
                >
                  Add another
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="ashby-url"
              className="block text-xs font-medium text-ink-secondary mb-1.5 font-mono uppercase tracking-wider"
            >
              Ashby URL or Slug
            </label>
            <div className="relative">
              <input
                id="ashby-url"
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (phase === "error") {
                    setPhase("idle");
                    setError("");
                  }
                }}
                placeholder="https://jobs.ashbyhq.com/company  or  company-slug"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                className="w-full h-10 px-3 text-sm bg-surface border border-edge rounded-md
                           placeholder:text-ink-muted focus:outline-none focus:border-edge-strong
                           focus:ring-1 focus:ring-edge-strong font-mono
                           disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              />
              {input.length > 0 && (
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono ${
                    isValid ? "text-positive" : "text-signal"
                  }`}
                >
                  {isValid ? slug : "invalid"}
                </span>
              )}
            </div>
            {input.length > 0 && isValid && (
              <p className="mt-1.5 text-xs text-ink-muted">
                Will check{" "}
                <span className="font-mono text-ink-secondary">
                  jobs.ashbyhq.com/{slug}
                </span>
              </p>
            )}
          </div>

          {phase === "error" && error && (
            <div className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3">
              <p className="text-sm text-signal font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || busy}
            className="h-9 px-5 rounded-md text-sm font-medium transition-colors cursor-pointer
                       bg-ink text-paper hover:bg-ink/90
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center gap-2"
          >
            {busy && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-paper/30 border-t-paper rounded-full animate-spin" />
            )}
            {phase === "scraping"
              ? "Scraping jobs..."
              : phase === "validating"
                ? "Validating..."
                : "Add & Scrape"}
          </button>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-edge">
        <h2 className="font-display text-sm font-semibold mb-2">How it works</h2>
        <ol className="space-y-1.5 text-xs text-ink-secondary leading-relaxed list-decimal list-inside">
          <li>
            Paste a URL like{" "}
            <code className="font-mono text-ink bg-surface px-1 py-0.5 rounded">
              jobs.ashbyhq.com/stripe
            </code>{" "}
            or just the slug{" "}
            <code className="font-mono text-ink bg-surface px-1 py-0.5 rounded">
              stripe
            </code>
          </li>
          <li>
            The system validates the board exists via Ashby&apos;s public API
          </li>
          <li>
            All open positions are scraped, normalized, and scored in real time
          </li>
          <li>
            The company appears in your feed immediately &mdash; future scrapes
            pick it up automatically
          </li>
        </ol>
      </div>
    </div>
  );
}
