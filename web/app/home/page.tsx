import Link from "next/link";
import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { getStats, getCompanies } from "@/lib/query";
import { GitHubStarBadge } from "@/components/GitHubBadge";
import styles from "./home.module.css";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  const title = "Ashby Jobs — Every Job from Ashby, Lever & Greenhouse Companies";
  const description = `Find ${stats.total.toLocaleString()} active jobs from ${stats.companies}+ tech startups on AshbyHQ, Lever, and Greenhouse. OpenAI, Figma, Anthropic, Linear, Cursor, Vercel and 130+ more — all in one place. Updated daily.`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/home`,
      images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "Ashby Jobs — Every AshbyHQ Job in One Feed" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/opengraph-image`],
    },
    alternates: { canonical: `${siteUrl}/home` },
  };
}

const FEATURED_COMPANIES = [
  "OpenAI", "Figma", "Anthropic", "Linear", "Cursor", "Vercel",
  "Perplexity", "Notion", "Ramp", "Brex", "Scale AI", "Reddit",
  "Shopify", "Plaid", "Airtable", "Retool", "Supabase", "PostHog",
  "Replit", "Mercury", "Cohere", "Zapier", "Harvey", "Render",
  "Docker", "Benchling", "WorkOS", "Confluent", "Airwallex", "Crusoe",
];

const FAQS = [
  {
    q: "What is AshbyHQ?",
    a: "AshbyHQ (Ashby) is a modern applicant tracking system used by leading tech startups. Companies like OpenAI, Figma, Anthropic, and 130+ others use Ashby to manage hiring and post public job listings via its job board API.",
  },
  {
    q: "What is Lever (lever.co)?",
    a: "Lever is another widely used applicant tracking system that many tech companies use to post public job listings via lever.co job boards. This tracker aggregates jobs from Lever alongside AshbyHQ and Greenhouse so you can search all three in one feed.",
  },
  {
    q: "What is Greenhouse?",
    a: "Greenhouse is a popular applicant tracking system used by companies like GitLab, Coinbase, Affirm, and Robinhood to publish public job boards via boards.greenhouse.io. This tracker indexes Greenhouse postings alongside AshbyHQ and Lever.",
  },
  {
    q: "Does this track jobs from Ashby, Lever, and Greenhouse?",
    a: "Yes. This tracker pulls public job postings from AshbyHQ, Lever, and Greenhouse job boards and merges them into a single searchable feed, so you don't need to check each ATS separately.",
  },
  {
    q: "Which companies use Ashby for hiring?",
    a: "135+ top tech companies post jobs on AshbyHQ including OpenAI, Figma, Anthropic, Linear, Cursor, Vercel, Perplexity, Notion, Ramp, Brex, Scale AI, Reddit, Shopify, Plaid, Airtable, Retool, Supabase, PostHog, Replit, Mercury, and many more.",
  },
  {
    q: "How do I find all jobs posted on AshbyHQ, Lever, and Greenhouse?",
    a: "This tracker aggregates every public job from companies on AshbyHQ, Lever, and Greenhouse, scraped daily from each platform's public posting API. Browse the full feed, filter by remote, department, company, or keyword.",
  },
  {
    q: "Is this an official AshbyHQ, Lever, or Greenhouse product?",
    a: "No. This is an independent open-source tracker that indexes publicly available job listings from AshbyHQ, Lever, and Greenhouse's public APIs. It is not affiliated with or endorsed by Ashby, Lever, or Greenhouse.",
  },
  {
    q: "How often is the job data updated?",
    a: "Jobs are scraped daily via an automated cron job. New listings, closed roles, and description changes are all tracked automatically across AshbyHQ, Lever, and Greenhouse.",
  },
];

export default async function HomePage() {
  const [stats, companies] = await Promise.all([getStats(), getCompanies()]);

  const marqueeCompanies = [...FEATURED_COMPANIES, ...FEATURED_COMPANIES];

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Ashby Jobs",
    url: siteUrl,
    description: `${stats.total.toLocaleString()} jobs from ${stats.companies}+ tech startups on AshbyHQ, Lever, and Greenhouse.`,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/?search={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className={dmSans.className}>

        {/* ── Nav ── */}
        <nav className="bg-[#080E1A] border-b border-[#1E2D45]">
          <div className="max-w-[1200px] mx-auto px-3! sm:px-6! h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`${spaceGrotesk.className} font-bold text-[17px] text-[#F1F5F9] tracking-[-0.02em]`}>
                Ashby<span className="text-[#6B5FE8]">Tracker</span>
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <GitHubStarBadge className="flex items-center gap-1.5 text-[#64748B] hover:text-[#F1F5F9] transition-colors shrink-0" />
              <span className="hidden sm:inline-block whitespace-nowrap text-[13px] text-[#64748B]">
                {stats.total.toLocaleString()} jobs · {stats.companies}+ companies
              </span>
              <Link
                href="/"
                className="bg-[#6B5FE8] text-white text-[12.5px] sm:text-[13px] font-semibold py-1.75! px-2.5! sm:px-4! rounded-md no-underline tracking-[-0.01em] whitespace-nowrap shrink-0"
              >
                Browse Jobs →
              </Link>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="bg-[#080E1A] px-6! pt-6! pb-6!">
          <div className="max-w-215 mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-[rgba(71,59,206,0.1)] border border-[rgba(71,59,206,0.25)] rounded-full py-1.25! px-3.5! mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6B5FE8] inline-block" />
              <span className="text-xs text-[#6B5FE8] font-medium tracking-[0.04em] uppercase">
                Updated daily
              </span>
            </div>

            <h1 className={`${spaceGrotesk.className} sm:text-6xl text-5xl font-bold text-[#F1F5F9] leading-[1.08] tracking-[-0.03em] mb-2`}>
              Every job on{" "}
              <span className="text-[#6B5FE8]">AshbyHQ</span>
              <br />in one feed
            </h1>

            <p className="text-[clamp(16px,2.2vw,20px)] text-[#64748B] leading-[1.65] max-w-[580px] mx-auto mb-12">
              We scrape the public job board APIs from Ashby, Lever, and Greenhouse for {stats.companies}+ top tech startups — so you don&apos;t have to check each one manually.
            </p>

            {/* Live counter */}
            <div className="inline-flex flex-col items-center bg-[#0D1526] border border-[#1E2D45] rounded-xl py-5! px-10! mb-10">
              <span className={`${spaceGrotesk.className} text-[clamp(48px,8vw,80px)] font-bold text-[#F1F5F9] tracking-[-0.04em] leading-none`}>
                {stats.total.toLocaleString()}
                <span className={`${styles.cursor} inline-block w-0.5 h-[1em] bg-[#6B5FE8] ml-0.75 align-middle`} />
              </span>
              <span className="text-[13px] text-[#64748B] mt-2 tracking-[0.06em] uppercase">
                active job listings
              </span>
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
              <Link
                href="/"
                className="bg-[#6B5FE8] text-white text-[15px] font-semibold py-3.5! px-8! rounded-lg no-underline tracking-[-0.01em] inline-flex items-center gap-1.5"
              >
                Browse all jobs →
              </Link>
              <a
                href="#how-it-works"
                className="bg-transparent text-[#64748B] border border-[#1E2D45] text-[15px] font-medium py-3.5! px-8! rounded-lg no-underline tracking-[-0.01em]"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        <div className="h-px bg-[linear-gradient(90deg,transparent,#6B5FE8,transparent)]" />

        {/* ── Stats bar ── */}
        <section className="bg-[#0D1526] border-b border-[#1E2D45] py-5! px-6!">
          <div className="sm:max-w-300 mx-auto flex sm:gap-12 gap-2 justify-center">
            {[
              { n: stats.total.toLocaleString(), label: "Active jobs" },
              { n: `${stats.companies}+`, label: "Companies tracked" },
              { n: "135+", label: "Ashby, Lever & Greenhouse boards" },
              { n: "3d", label: "Refresh cycle" },
            ].map(({ n, label }) => (
              <div key={label} className="text-center">
                <div className={`${spaceGrotesk.className} tabular-nums tracking-[-0.03em] text-[22px] font-bold text-[#F1F5F9]`}>{n}</div>
                <div className="text-xs text-[#64748B] mt-0.5 tracking-[0.04em] uppercase">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Companies marquee ── */}
        <section className="bg-[#F8FAFC] pt-16! pb-14! overflow-hidden">
          <div className="text-center mb-8 px-6!">
            <p className="sm:text-lg text-[13px] text-[#475569] tracking-[0.08em] uppercase font-medium">
              Tracking jobs at {companies.length}+ companies
            </p>
          </div>
          <div className="overflow-hidden">
            <div className={`${styles.marqueeTrack} flex w-max`}>
              {marqueeCompanies.map((name, i) => (
                <span
                  key={i}
                  className={`${spaceGrotesk.className} text-sm sm:text-xl font-medium text-[#475569] whitespace-nowrap px-8! border-r border-[#E2E8F0] leading-10 cursor-default`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="bg-[#080E1A] px-6! py-20!">
          <div className="max-w-[860px] mx-auto">
            <div className="text-center mb-14">
              <h2 className={`${spaceGrotesk.className} text-[clamp(28px,4vw,40px)] font-bold text-[#F1F5F9] tracking-[-0.025em] mb-4`}>
                How it works
              </h2>
              <p className="text-[17px] text-[#64748B]">
                Three steps. No manual checking.
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-px bg-[#1E2D45] border border-[#1E2D45] rounded-xl overflow-hidden">
              {[
                {
                  step: "01",
                  title: "Companies post on Ashby, Lever, or Greenhouse",
                  desc: "135+ top tech startups use AshbyHQ, Lever, or Greenhouse as their applicant tracking system and publish public job boards.",
                },
                {
                  step: "02",
                  title: "We scrape daily",
                  desc: "An automated cron job hits Ashby's, Lever's, and Greenhouse's public posting APIs for every company and stores all job data in our database.",
                },
                {
                  step: "03",
                  title: "You find jobs instantly",
                  desc: "Browse, filter by remote, department, company, or search keywords. All jobs. One feed. No accounts needed.",
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="bg-[#0D1526] py-9! px-7!">
                  <div className={`${spaceGrotesk.className} text-sm font-bold text-[#6B5FE8] tracking-[0.12em] mb-4`}>
                    {step}
                  </div>
                  <h3 className={`${spaceGrotesk.className} text-lg font-semibold text-[#F1F5F9] tracking-[-0.02em] mb-3`}>
                    {title}
                  </h3>
                  <p className="text-sm text-[#64748B] leading-[1.7]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="bg-[#F8FAFC] px-6! py-20!">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-center mb-14">
              <h2 className={`${spaceGrotesk.className} text-[clamp(28px,4vw,40px)] font-bold text-[#0F172A] tracking-[-0.025em] mb-4`}>
                Built for job seekers
              </h2>
              <p className="text-[17px] text-[#475569]">
                Everything you need to track AshbyHQ postings in one place.
              </p>
            </div>

            <div className="grid grid-cols-1 min-[481px]:grid-cols-2 min-[769px]:grid-cols-3 gap-4">
              {[
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                    </svg>
                  ),
                  title: "Full-text search",
                  desc: "Search job titles and companies across every listing simultaneously.",
                },
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                    </svg>
                  ),
                  title: "Remote filter",
                  desc: "One click to show only remote-friendly roles across all 135+ companies.",
                },
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  ),
                  title: "135+ companies",
                  desc: "OpenAI, Figma, Anthropic, Vercel, Linear, Cursor, Perplexity — all in one feed.",
                },
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                  title: "Auto-updated",
                  desc: "Scraped daily. New jobs appear fast. Closed roles are removed automatically.",
                },
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  ),
                  title: "Department & team filters",
                  desc: "Narrow to Engineering, Product, Design, Sales or any specific team name.",
                },
                {
                  icon: (
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  title: "Track applications",
                  desc: "Mark jobs as applied or ignored. Never lose track of where you've applied.",
                },
              ].map(({ icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-white border border-[#E2E8F0] rounded-[10px] py-7! px-6!"
                >
                  <div className="text-[#6B5FE8] mb-4 w-12 h-12 bg-[rgba(71,59,206,0.08)] rounded-[10px] flex items-center justify-center">{icon}</div>
                  <h3 className={`${spaceGrotesk.className} text-base font-semibold text-[#0F172A] tracking-[-0.015em] mb-2`}>
                    {title}
                  </h3>
                  <p className="text-sm text-[#475569] leading-[1.65]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ / AEO ── */}
        <section className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-6! py-20!">
          <div className="max-w-[720px] mx-auto">
            <div className="text-center mb-12">
              <h2 className={`${spaceGrotesk.className} text-[clamp(26px,4vw,36px)] font-bold text-[#0F172A] tracking-[-0.025em] mb-3`}>
                Frequently asked questions
              </h2>
            </div>

            <div className="flex flex-col rounded-[10px] border border-[#E2E8F0] overflow-hidden">
              {FAQS.map((faq, i) => (
                <details
                  key={i}
                  className={`group bg-white ${i < FAQS.length - 1 ? "border-b border-[#E2E8F0]" : ""}`}
                >
                  <summary className="flex items-center justify-between py-5! px-6! cursor-pointer select-none gap-4 list-none [&::-webkit-details-marker]:hidden">
                    <span className={`${spaceGrotesk.className} text-[15px] font-semibold text-[#0F172A] tracking-[-0.01em]`}>
                      {faq.q}
                    </span>
                    <svg className="w-4 h-4 shrink-0 text-[#475569] transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="text-sm text-[#475569] leading-[1.75] px-6! pb-5! m-0">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="bg-[#080E1A] border-t border-[#1E2D45] px-6! py-20!">
          <div className="max-w-[640px] mx-auto text-center">
            <h2 className={`${spaceGrotesk.className} text-[clamp(28px,5vw,48px)] font-bold text-[#F1F5F9] tracking-[-0.03em] mb-4`}>
              Start browsing now
            </h2>
            <p className="text-[17px] text-[#64748B] mb-9 leading-[1.65]">
              {stats.total.toLocaleString()} jobs from {stats.companies}+ companies. No sign-up. No noise.
            </p>
            <Link
              href="/"
              className={`${spaceGrotesk.className} inline-flex items-center gap-2 bg-[#6B5FE8] text-white text-base font-semibold py-4! px-10! rounded-lg no-underline tracking-[-0.01em]`}
            >
              Browse {stats.total.toLocaleString()} jobs →
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-[#080E1A] border-t border-[#1E2D45] py-6! px-6!">
          <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-3">
            <span className={`${spaceGrotesk.className} font-bold text-sm text-[#F1F5F9]`}>
              Ashby<span className="text-[#6B5FE8]">Tracker</span>
            </span>
            <span className="text-xs text-[#64748B]">
              Not affiliated with Ashby Inc., Lever Inc., or Greenhouse Software, Inc. · Job data from{" "}
              <a href="https://api.ashbyhq.com/posting-api" className="text-[#64748B] underline" target="_blank" rel="noopener noreferrer">
                AshbyHQ
              </a>
              ,{" "}
              <a href="https://www.lever.co" className="text-[#64748B] underline" target="_blank" rel="noopener noreferrer">
                Lever
              </a>
              , &amp;{" "}
              <a href="https://www.greenhouse.io" className="text-[#64748B] underline" target="_blank" rel="noopener noreferrer">
                Greenhouse
              </a>{" "}
              public APIs
            </span>
          </div>
        </footer>

      </div>
    </>
  );
}
