import type { Metadata } from "next";

// Cloudflare caches this page and deploys don't purge it, same as the changelog.
export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";
const NPM_URL = "https://www.npmjs.com/package/ats-jobs";
const REPO_URL = "https://github.com/rishilahoti/ats-jobs";

const TITLE = "ats-jobs: Node.js library for Greenhouse, Lever, Ashby & Workday job listings";
const DESCRIPTION =
  "ats-jobs is a free, MIT-licensed Node.js library that fetches public job listings from Ashby, Lever, Greenhouse, Workable, Recruitee, Teamtailor, Pinpoint, SmartRecruiters, Workday and Keka and returns them in one JSON shape. No API keys.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "ats-jobs", "greenhouse api node", "lever api node", "ashby api", "workday jobs scraper",
    "job board api", "applicant tracking system api", "job listings npm", "job scraper node.js",
  ],
  alternates: { canonical: "/open-source" },
  openGraph: {
    type: "website",
    siteName: "Ashby Jobs",
    title: TITLE,
    description: DESCRIPTION,
    url: "/open-source",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ats-jobs, an open-source job listings library" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
};

const PROVIDERS = [
  { name: "Ashby", slug: "openai" },
  { name: "Lever", slug: "ro" },
  { name: "Greenhouse", slug: "gitlab" },
  { name: "Workable", slug: "huggingface" },
  { name: "Recruitee", slug: "bunq" },
  { name: "Teamtailor", slug: "bankgirotab" },
  { name: "Pinpoint", slug: "avaaz" },
  { name: "SmartRecruiters", slug: "linkedin3" },
  { name: "Workday", slug: "nvidia/wd5/NVIDIAExternalCareerSite" },
  { name: "Keka", slug: "disprz" },
];

const EXAMPLE = `const { getJobs } = require("ats-jobs");

const jobs = await getJobs("lever", "ro");
console.log(jobs[0].title, jobs[0].location, jobs[0].applyUrl);`;

const FIELDS =
  "jobId, company, source, title, location, team, department, employmentType, remote, description, applyUrl, jobUrl, publishedAt, compensationSummary, compensationMin, compensationMax, compensationCurrency, compensationInterval";

// Visible on the page too: FAQ markup must match what readers can see.
const FAQ = [
  {
    q: "How do I get job listings from a Greenhouse, Lever or Ashby board in Node.js?",
    a: "Install ats-jobs with npm install ats-jobs, then call getJobs(\"greenhouse\", \"gitlab\"). The first argument is the job board vendor and the second is the company's id on that vendor.",
  },
  {
    q: "Does ats-jobs need an API key?",
    a: "No. It reads the public job-board endpoints that Ashby, Lever, Greenhouse and the other supported vendors already expose for company career pages.",
  },
  {
    q: "Which applicant tracking systems does ats-jobs support?",
    a: "Ashby, Lever, Greenhouse, Workable, Recruitee, Teamtailor, Pinpoint, SmartRecruiters, Workday and Keka.",
  },
  {
    q: "Can I normalize job data I already fetched?",
    a: "Yes. normalize(provider, rawJobs, company) converts raw vendor JSON into the common shape without making any network request.",
  },
  {
    q: "What license and Node.js version does ats-jobs use?",
    a: "It is MIT licensed and needs Node.js 20 or newer.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareSourceCode",
      name: "ats-jobs",
      description: DESCRIPTION,
      url: `${siteUrl}/open-source`,
      codeRepository: REPO_URL,
      programmingLanguage: "JavaScript",
      runtimePlatform: "Node.js 20+",
      license: "https://opensource.org/license/mit",
      author: { "@type": "Person", name: "Rishi Lahoti", url: "https://github.com/rishilahoti" },
      sameAs: [NPM_URL, REPO_URL],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ashby Jobs", item: `${siteUrl}/home` },
        { "@type": "ListItem", position: 2, name: "ats-jobs", item: `${siteUrl}/open-source` },
      ],
    },
  ],
};

export default function OpenSourcePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
      />
      <h1 className="font-display text-xl font-bold tracking-tight mb-2">
        ats-jobs: fetch job listings from Greenhouse, Lever, Ashby, Workday and more
      </h1>
      <p className="text-sm text-ink-secondary mb-6">
        ats-jobs is a free Node.js library that fetches public job listings from ten applicant
        tracking systems and returns them in one consistent JSON shape, with no API keys and no
        setup. It is the scraping code behind this site, MIT licensed.
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
        <h2 className="text-sm font-semibold text-ink mb-2">Usage</h2>
        <pre className="rounded-lg border border-edge bg-surface p-4 text-xs font-mono overflow-x-auto">{EXAMPLE}</pre>
        <p className="text-sm text-ink-secondary mt-3">
          Each job has these fields: <span className="font-mono text-xs">{FIELDS}</span>.
        </p>
      </section>

      <section className="pb-6 mb-6 border-b border-edge">
        <h2 className="text-sm font-semibold text-ink mb-2">Supported job boards</h2>
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Example slug</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map(({ name, slug }) => (
                <tr key={name} className="border-t border-edge">
                  <td className="px-3 py-2 text-ink">{name}</td>
                  <td className="px-3 py-2 font-mono text-ink-secondary">{slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pb-6 mb-6 border-b border-edge">
        <h2 className="text-sm font-semibold text-ink mb-3">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <h3 className="text-sm font-medium text-ink mb-1">{q}</h3>
              <p className="text-sm text-ink-secondary">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Why it exists</h2>
        <p className="text-sm text-ink-secondary">
          Every job board vendor has its own URL shape, response format and quirks. ats-jobs is what
          Ashby Jobs uses every day to read all of them, with the quirks sorted out once. Issues and
          pull requests are welcome on GitHub.
        </p>
      </section>
    </div>
  );
}
