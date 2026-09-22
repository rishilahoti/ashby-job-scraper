import type { Metadata } from "next";
import { CHANGELOG } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new on Ashby Jobs.",
};

export default function ChangelogPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-bold tracking-tight mb-6">Changelog</h1>
      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <div key={entry.id} className="pb-6 border-b border-edge last:border-0">
            <p className="text-xs font-mono text-ink-muted mb-1">{entry.date}</p>
            <h2 className="text-sm font-semibold text-ink mb-1">{entry.title}</h2>
            <p className="text-sm text-ink-secondary">{entry.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
