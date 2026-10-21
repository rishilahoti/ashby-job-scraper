"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import rules from "../../src/config/rules.json";
import { resumeTerms } from "@/lib/resume-terms";

// The resume is matched here in the browser and never sent anywhere: only the
// tags it names go to the feed, as ?match=.
export default function ResumeMatch() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [noTerms, setNoTerms] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const terms = resumeTerms(text, rules);
    setNoTerms(terms.length === 0);
    if (terms.length > 0) router.push(`/?${new URLSearchParams({ match: terms.join(",") })}`);
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
          disabled={!text.trim()}
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
