"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import rules from "../../src/config/rules.json";
import { resumeTerms, resumeYears, MAX_RESUME_CHARS } from "@/lib/resume-terms";
import { EXPERIENCE_OPTIONS } from "@/lib/scoring";

// "auto" asks /api/resume-years. "5+ years" sets no filter: every job is open to them.
const LEVELS = [{ value: "auto", label: "Read it from my resume" }, ...EXPERIENCE_OPTIONS, { value: "", label: "5+ years" }];

// Years of work experience → the ?exp= value: the smallest bracket that covers them.
const expFor = (years: number) => EXPERIENCE_OPTIONS.find((o) => years < o.under)?.value ?? "";

// This browser only: { text, years? }. years is the AI's answer for that same
// text, so matching again doesn't ask again; any edit rewrites it without years.
const KEY = "match-resume";

function save(value: { text: string; years?: number }) {
  try {
    if (value.text) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // storage disabled or full: the resume just isn't kept
  }
}

function saved(): { text?: unknown; years?: unknown } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

// Read once per render, never subscribed: only this page writes it. "" on the server.
const keptText = () => {
  const { text } = saved();
  return typeof text === "string" ? text : "";
};
const noSubscribe = () => () => {};

// Skills are matched here in the browser; only the tags go to the feed, as ?match=.
// With "auto", years come from the Experience dates here too; the text goes to
// /api/resume-years once (not stored) only when there are none to read.
export default function ResumeMatch() {
  const router = useRouter();
  const kept = useSyncExternalStore(noSubscribe, keptText, () => "");
  const [typed, setText] = useState<string | null>(null);
  const text = typed ?? kept;
  const [exp, setExp] = useState<string | null>("auto");
  const [noTerms, setNoTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const terms = resumeTerms(text, rules);
    setNoTerms(terms.length === 0);
    if (terms.length === 0 || exp === null) return;
    let level = exp;
    // The resume's own Experience dates first; the model only when they can't be read.
    const local = level === "auto" ? resumeYears(text) : null;
    if (local !== null) level = expFor(local);
    else if (level === "auto") {
      const cached = saved();
      if (cached.text === text && typeof cached.years === "number") level = expFor(cached.years);
    }
    if (level === "auto") {
      setBusy(true);
      setError("");
      const res = await fetch("/api/resume-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, MAX_RESUME_CHARS) }),
      }).catch(() => null);
      const data = await res?.json().catch(() => null);
      setBusy(false);
      if (!res?.ok || typeof data?.years !== "number") {
        // No silent fallback to "any level": that's what showed senior roles to juniors.
        setError(data?.error ?? "Couldn't read your experience. Pick it instead.");
        setExp(null);
        return;
      }
      // Not if the box was edited or emptied while waiting: that would bring the old text back.
      if (saved().text === text) save({ text, years: data.years });
      level = expFor(data.years);
    }
    const params = new URLSearchParams({ match: terms.join(",") });
    if (level) params.set("exp", level);
    router.push(`/?${params}`);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-xl font-bold tracking-tight mb-1">Match your resume</h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Paste your resume and we&apos;ll show the jobs that share the most skills with it, at your
          level. Your years of experience are counted in your browser from the dates in your
          Experience section. Only if it has none we can read is the text sent once to an AI model:
          Groq, or Google&apos;s Gemini when Groq is busy, whose free tier lets Google use it to
          improve its products. We don&apos;t save it. Only the skills found in your resume go to the
          feed. Your resume stays in this browser for next time; empty the box to forget it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="block text-xs font-medium text-ink-secondary mb-1.5 font-mono uppercase tracking-wider">
            Your work experience
          </span>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.label}
                type="button"
                aria-pressed={exp === l.value}
                onClick={() => setExp(l.value)}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer
                            ${exp === l.value
                    ? "bg-ink text-paper"
                    : "border border-edge text-ink-secondary hover:border-edge-strong hover:text-ink"
                  }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            save({ text: e.target.value });
          }}
          placeholder="Open your resume, select all, copy, and paste it here."
          rows={14}
          aria-label="Resume text"
          className="w-full px-3 py-2 text-sm bg-surface border border-edge rounded-md
                     placeholder:text-ink-muted focus:outline-none focus:border-edge-strong
                     focus:ring-1 focus:ring-edge-strong font-body"
        />

        {error && (
          <div className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3">
            <p className="text-sm text-signal font-medium">{error}</p>
          </div>
        )}

        {noTerms && (
          <div className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3">
            <p className="text-sm text-signal font-medium">
              No skills we track were found. Try pasting the full resume, including the skills section.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!text.trim() || exp === null || busy}
          className="h-9 px-5 rounded-md text-sm font-medium transition-colors cursor-pointer
                     bg-ink text-paper hover:bg-ink/90
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Reading your experience..." : "Find matching jobs"}
        </button>
      </form>
    </div>
  );
}
