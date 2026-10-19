import type { Metadata } from "next";

// Cloudflare caches this page and deploys don't purge it, same as the changelog.
export const revalidate = 3600;

const NPM_URL = "https://www.npmjs.com/package/ats-jobs";
const REPO_URL = "https://github.com/rishilahoti/ats-jobs";

export const metadata: Metadata = {
  title: "ats-jobs: open-source library",
  description:
    "ats-jobs is the free Node.js library behind this site. It fetches public job listings from Ashby, Lever, Greenhouse, Workable, Recruitee, Teamtailor, Pinpoint, SmartRecruiters, Workday and Keka in one JSON shape.",
  alternates: { canonical: "/open-source" },
};

const PROVIDERS = [
  "Ashby", "Lever", "Greenhouse", "Workable", "Recruitee",
  "Teamtailor", "Pinpoint", "SmartRecruiters", "Workday", "Keka",
];

const EXAMPLE = `const { getJobs } = require("ats-jobs");

const jobs = await getJobs("lever", "ro");
console.log(jobs[0].title, jobs[0].location, jobs[0].applyUrl);`;

export default function OpenSourcePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-bold tracking-tight mb-2">ats-jobs</h1>
      <p className="text-sm text-ink-secondary mb-6">
        The scraping code behind this site, packaged for anyone to use. It fetches public job
        listings from ten applicant-tracking systems and returns them in one consistent shape: no
        API keys, no setup. MIT licensed.
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <a
          href={NPM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 px-3 inline-flex items-center rounded-md border border-edge text-sm font-medium text-ink hover:bg-surface transition-colors"
        >
          View on npm
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 px-3 inline-flex items-center rounded-md border border-edge text-sm font-medium text-ink-secondary hover:text-ink hover:bg-surface transition-colors"
        >
          Source on GitHub
        </a>
      </div>

      <section className="pb-6 mb-6 border-b border-edge">
        <h2 className="text-sm font-semibold text-ink mb-2">Install</h2>
        <pre className="rounded-lg border border-edge bg-surface p-4 text-xs font-mono overflow-x-auto">npm install ats-jobs</pre>
      </section>

      <section className="pb-6 mb-6 border-b border-edge">
        <h2 className="text-sm font-semibold text-ink mb-2">Use it</h2>
        <pre className="rounded-lg border border-edge bg-surface p-4 text-xs font-mono overflow-x-auto">{EXAMPLE}</pre>
        <p className="text-sm text-ink-secondary mt-3">
          Needs Node.js 20 or newer. Already have the raw data? <code className="font-mono text-xs">normalize()</code>{" "}
          converts it without fetching anything.
        </p>
      </section>

      <section className="pb-6 mb-6 border-b border-edge">
        <h2 className="text-sm font-semibold text-ink mb-2">Supported job boards</h2>
        <ul className="flex flex-wrap gap-2">
          {PROVIDERS.map((name) => (
            <li key={name} className="px-2 py-1 rounded-md border border-edge text-xs text-ink-secondary">
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Why it exists</h2>
        <p className="text-sm text-ink-secondary">
          Every job board vendor has its own URL shape, response format and quirks. This library is
          what Ashby Jobs uses every day to read them all, with the quirks sorted out once.
          Issues and pull requests are welcome on GitHub.
        </p>
      </section>
    </div>
  );
}
