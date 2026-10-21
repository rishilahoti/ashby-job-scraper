"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import rules from "../../src/config/rules.json";
import { resumeTerms } from "@/lib/resume-terms";
import { EXPERIENCE_OPTIONS } from "@/lib/scoring";

// "5+ years" sets no filter: every job is open to them.
const LEVELS = [...EXPERIENCE_OPTIONS, { value: "", label: "5+ years" }];

// The resume is matched here in the browser and never sent anywhere: only the
// tags it names go to the feed, as ?match=, with the experience as ?exp=.
export default function ResumeMatch() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [exp, setExp] = useState<string | null>(null);
  const [noTerms, setNoTerms] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const terms = resumeTerms(text, rules);
    setNoTerms(terms.length === 0);
    if (terms.length === 0 || exp === null) return;
    const params = new URLSearchParams({ match: terms.join(",") });
    if (exp) params.set("exp", exp);
    router.push(`/?${params}`);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-xl font-bold tracking-tight mb-1">Match your resume</h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Paste your resume and we&apos;ll show the jobs that share the most skills with it. It stays in
          your browser: nothing is uploaded or saved.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="block text-xs font-medium text-ink-secondary mb-1.5 font-mono uppercase tracking-wider">
            Your work experience
          </span>
          <div className="flex gap-1.5">
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
          onChange={(e) => setText(e.target.value)}
          placeholder="Open your resume, select all, copy, and paste it here."
          rows={14}
          aria-label="Resume text"
          className="w-full px-3 py-2 text-sm bg-surface border border-edge rounded-md
                     placeholder:text-ink-muted focus:outline-none focus:border-edge-strong
                     focus:ring-1 focus:ring-edge-strong font-body"
        />

        {noTerms && (
          <div className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3">
            <p className="text-sm text-signal font-medium">
              No skills we track were found. Try pasting the full resume, including the skills section.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!text.trim() || exp === null}
          className="h-9 px-5 rounded-md text-sm font-medium transition-colors cursor-pointer
                     bg-ink text-paper hover:bg-ink/90
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Find matching jobs
        </button>
      </form>
    </div>
  );
}
