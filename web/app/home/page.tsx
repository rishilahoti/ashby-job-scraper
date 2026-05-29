import Link from "next/link";
import type { Metadata } from "next";
import { getStats, getCompanies } from "@/lib/query";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  const title = "Ashby Tracker — Every Job from Every AshbyHQ Company";
  const description = `Find ${stats.total.toLocaleString()} active jobs from ${stats.companies}+ tech startups on AshbyHQ. OpenAI, Figma, Anthropic, Linear, Cursor, Vercel and 130+ more — all in one place. Updated twice daily.`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/home`,
      images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "Ashby Tracker — Every AshbyHQ Job in One Feed" }],
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
    q: "Which companies use Ashby for hiring?",
    a: "135+ top tech companies post jobs on AshbyHQ including OpenAI, Figma, Anthropic, Linear, Cursor, Vercel, Perplexity, Notion, Ramp, Brex, Scale AI, Reddit, Shopify, Plaid, Airtable, Retool, Supabase, PostHog, Replit, Mercury, and many more.",
  },
  {
    q: "How do I find all jobs posted on AshbyHQ?",
    a: "This tracker aggregates every public job from 135+ companies on AshbyHQ, scraped twice daily from Ashby's public posting API. Browse the full feed, filter by remote, department, company, or keyword.",
  },
  {
    q: "Is this an official AshbyHQ product?",
    a: "No. This is an independent open-source tracker that indexes publicly available job listings from AshbyHQ's public API. It is not affiliated with or endorsed by Ashby.",
  },
  {
    q: "How often is the job data updated?",
    a: "Jobs are scraped every 48 hours via a GitHub Actions workflow. New listings, closed roles, and description changes are all tracked automatically.",
  },
];

export default async function HomePage() {
  const [stats, companies] = await Promise.all([getStats(), getCompanies()]);

  const marqueeCompanies = [...FEATURED_COMPANIES, ...FEATURED_COMPANIES];

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Ashby Tracker",
    url: siteUrl,
    description: `${stats.total.toLocaleString()} jobs from ${stats.companies}+ tech startups on AshbyHQ.`,
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');

        .home-page {
          --accent: #6B5FE8;
          --accent-dim: #473bce;
          --dark: #080E1A;
          --dark-surface: #0D1526;
          --dark-border: #1E2D45;
          --light: #F8FAFC;
          --light-surface: #FFFFFF;
          --light-border: #E2E8F0;
          --text-on-dark: #F1F5F9;
          --text-muted-dark: #64748B;
          --text-on-light: #0F172A;
          --text-muted-light: #475569;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .home-page h1, .home-page h2, .home-page h3 {
          font-family: 'Space Grotesk', system-ui, sans-serif;
        }

        /* Marquee */
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee 40s linear infinite;
        }
        .marquee-track:hover { animation-play-state: paused; }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }

        /* Cursor blink */
        .cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: var(--accent);
          margin-left: 3px;
          vertical-align: middle;
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Number grid */
        .stat-num {
          font-family: 'Space Grotesk', monospace;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.03em;
        }

        /* FAQ accordion */
        details summary { list-style: none; }
        details summary::-webkit-details-marker { display: none; }
        details[open] .chevron { transform: rotate(180deg); }
        .chevron { transition: transform 200ms ease; }

        /* Features grid */
        .features-grid { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 768px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .features-grid { grid-template-columns: 1fr; } }

        /* Gradient line */
        .accent-line {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
        }
      `}</style>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="home-page">

        {/* ── Nav ── */}
        <nav style={{ background: "var(--dark)", borderBottom: "1px solid var(--dark-border)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--text-on-dark)", letterSpacing: "-0.02em" }}>
                Ashby<span style={{ color: "var(--accent)" }}>Tracker</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--text-muted-dark)" }}>
                {stats.total.toLocaleString()} jobs · {stats.companies}+ companies
              </span>
              <Link
                href="/"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "7px 16px",
                  borderRadius: 6,
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                  transition: "background 150ms",
                }}
              >
                Browse Jobs →
              </Link>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section style={{ background: "var(--dark)", padding: "96px 24px 80px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(71,59,206,0.1)",
              border: "1px solid rgba(71,59,206,0.25)",
              borderRadius: 20, padding: "5px 14px", marginBottom: 32,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--accent)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Updated every 48 hours
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "clamp(36px, 6vw, 72px)",
              fontWeight: 700,
              color: "var(--text-on-dark)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              marginBottom: 24,
            }}>
              Every job on{" "}
              <span style={{ color: "var(--accent)" }}>AshbyHQ</span>
              <br />in one feed
            </h1>

            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "clamp(16px, 2.2vw, 20px)",
              color: "var(--text-muted-dark)",
              lineHeight: 1.65,
              maxWidth: 580,
              margin: "0 auto 48px",
            }}>
              We scrape the public Ashby job board API for {stats.companies}+ top tech startups — so you don&apos;t have to check each one manually.
            </p>

            {/* Live counter */}
            <div style={{
              display: "inline-flex", flexDirection: "column", alignItems: "center",
              background: "var(--dark-surface)",
              border: "1px solid var(--dark-border)",
              borderRadius: 12, padding: "20px 40px", marginBottom: 40,
            }}>
              <span style={{
                fontFamily: "'Space Grotesk', monospace",
                fontSize: "clamp(48px, 8vw, 80px)",
                fontWeight: 700,
                color: "var(--text-on-dark)",
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}>
                {stats.total.toLocaleString()}<span className="cursor" />
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--text-muted-dark)", marginTop: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                active job listings
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "14px 32px",
                  borderRadius: 8,
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                Browse all jobs →
              </Link>
              <a
                href="#how-it-works"
                style={{
                  background: "transparent",
                  color: "var(--text-muted-dark)",
                  border: "1px solid var(--dark-border)",
                  fontSize: 15,
                  fontWeight: 500,
                  padding: "14px 32px",
                  borderRadius: 8,
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                }}
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        <div className="accent-line" />

        {/* ── Stats bar ── */}
        <section style={{ background: "var(--dark-surface)", borderBottom: "1px solid var(--dark-border)", padding: "20px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 48, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { n: stats.total.toLocaleString(), label: "Active jobs" },
              { n: `${stats.companies}+`, label: "Companies tracked" },
              { n: "135+", label: "AshbyHQ boards" },
              { n: "48h", label: "Refresh cycle" },
            ].map(({ n, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div className="stat-num" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-on-dark)" }}>{n}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--text-muted-dark)", marginTop: 2, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Companies marquee ── */}
        <section style={{ background: "var(--light)", padding: "64px 0 56px", overflow: "hidden" }}>
          <div style={{ textAlign: "center", marginBottom: 32, padding: "0 24px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--text-muted-light)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
              Tracking jobs at {companies.length}+ companies
            </p>
          </div>
          <div style={{ overflow: "hidden" }}>
            <div className="marquee-track">
              {marqueeCompanies.map((name, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-muted-light)",
                    whiteSpace: "nowrap",
                    padding: "0 32px",
                    borderRight: "1px solid var(--light-border)",
                    lineHeight: "40px",
                    cursor: "default",
                    transition: "color 150ms",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" style={{ background: "var(--dark)", padding: "80px 24px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, color: "var(--text-on-dark)", letterSpacing: "-0.025em", marginBottom: 16 }}>
                How it works
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, color: "var(--text-muted-dark)" }}>
                Three steps. No manual checking.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, background: "var(--dark-border)", border: "1px solid var(--dark-border)", borderRadius: 12, overflow: "hidden" }}>
              {[
                {
                  step: "01",
                  title: "Companies post on Ashby",
                  desc: "135+ top tech startups use AshbyHQ as their applicant tracking system and publish public job boards.",
                },
                {
                  step: "02",
                  title: "We scrape every 48 hours",
                  desc: "A GitHub Actions workflow hits Ashby's public posting API for every company and stores all job data in our database.",
                },
                {
                  step: "03",
                  title: "You find jobs instantly",
                  desc: "Browse, filter by remote, department, company, or search keywords. All jobs. One feed. No accounts needed.",
                },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ background: "var(--dark-surface)", padding: "36px 28px" }}>
                  <div style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 14, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 16 }}>
                    {step}
                  </div>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, color: "var(--text-on-dark)", letterSpacing: "-0.02em", marginBottom: 12 }}>
                    {title}
                  </h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--text-muted-dark)", lineHeight: 1.7 }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section style={{ background: "var(--light)", padding: "80px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, color: "var(--text-on-light)", letterSpacing: "-0.025em", marginBottom: 16 }}>
                Built for job seekers
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, color: "var(--text-muted-light)" }}>
                Everything you need to track AshbyHQ postings in one place.
              </p>
            </div>

            <div className="features-grid" style={{ display: "grid", gap: 16 }}>
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
                  desc: "Scraped every 48 hours. New jobs appear fast. Closed roles are removed automatically.",
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
                  style={{
                    background: "var(--light-surface)",
                    border: "1px solid var(--light-border)",
                    borderRadius: 10,
                    padding: "28px 24px",
                  }}
                >
                  <div style={{ color: "var(--accent)", marginBottom: 16, width: 48, height: 48, background: "rgba(71,59,206,0.08)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "var(--text-on-light)", letterSpacing: "-0.015em", marginBottom: 8 }}>
                    {title}
                  </h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--text-muted-light)", lineHeight: 1.65 }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ / AEO ── */}
        <section style={{ background: "var(--light)", borderTop: "1px solid var(--light-border)", padding: "80px 24px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, color: "var(--text-on-light)", letterSpacing: "-0.025em", marginBottom: 12 }}>
                Frequently asked questions
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 10, border: "1px solid var(--light-border)", overflow: "hidden" }}>
              {FAQS.map((faq, i) => (
                <details
                  key={i}
                  style={{
                    borderBottom: i < FAQS.length - 1 ? "1px solid var(--light-border)" : "none",
                    background: "var(--light-surface)",
                  }}
                >
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "20px 24px",
                      cursor: "pointer",
                      userSelect: "none",
                      gap: 16,
                    }}
                  >
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: "var(--text-on-light)", letterSpacing: "-0.01em" }}>
                      {faq.q}
                    </span>
                    <svg className="chevron" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, color: "var(--text-muted-light)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--text-muted-light)", lineHeight: 1.75, padding: "0 24px 20px", margin: 0 }}>
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section style={{ background: "var(--dark)", borderTop: "1px solid var(--dark-border)", padding: "80px 24px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 700, color: "var(--text-on-dark)", letterSpacing: "-0.03em", marginBottom: 16 }}>
              Start browsing now
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, color: "var(--text-muted-dark)", marginBottom: 36, lineHeight: 1.65 }}>
              {stats.total.toLocaleString()} jobs from {stats.companies}+ companies. No sign-up. No noise.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--accent)",
                color: "#fff",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                padding: "16px 40px",
                borderRadius: 8,
                textDecoration: "none",
                letterSpacing: "-0.01em",
              }}
            >
              Browse {stats.total.toLocaleString()} jobs →
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ background: "var(--dark)", borderTop: "1px solid var(--dark-border)", padding: "24px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--text-on-dark)" }}>
              Ashby<span style={{ color: "var(--accent)" }}>Tracker</span>
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--text-muted-dark)" }}>
              Not affiliated with Ashby Inc. · Job data from{" "}
              <a href="https://api.ashbyhq.com/posting-api" style={{ color: "var(--text-muted-dark)", textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">
                AshbyHQ public API
              </a>
            </span>
          </div>
        </footer>

      </div>
    </>
  );
}
