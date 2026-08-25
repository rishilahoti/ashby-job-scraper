# Ashby Jobs

A production-grade system that scrapes public job listings across **Ashby, Lever, and Greenhouse** — hundreds of companies and counting — persists them in Neon PostgreSQL, tracks changes over time, and surfaces actionable opportunities through a Next.js frontend with intelligent scoring.

## Features

- **Multi-ATS** — Ashby, Lever, and Greenhouse job boards in one feed, via per-source fetch/normalize adapters
- **Self-growing registry** — Weekly crawl-based discovery (Common Crawl CDX API) finds new Ashby/Greenhouse company boards, verifies each against the live API, and adds it automatically — no manual JSON editing required
- **Self-Service Company Addition** — Paste any Ashby, Lever, or Greenhouse job board URL in the frontend to add and scrape a new company in real time
- **Automated Scraping** — Polls each ATS's public job board API on a configurable cron schedule
- **Multi-DB failover** — Configure multiple Neon connection strings (`DATABASE_URLS`); automatically fails over if the primary is down or over its data-transfer quota
- **Change Detection** — Tracks new, updated, and removed postings via content hashing
- **Intelligent Scoring** — Ranks jobs by keyword relevance, location, remote preference, department, and freshness
- **Cloud Database** — Neon PostgreSQL with connection pooling (queryable from anywhere)
- **Web Frontend** — Next.js 16 App Router with filtering, pagination, and per-browser apply/ignore tracking (localStorage)
- **Stealth-Aware** — Jittered scheduling, randomized delays, browser-like headers
- **Reports** — CLI summaries and daily Markdown reports with apply links

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Backend (Node.js)                                           │
│                                                             │
│ Scheduler ─→ Registry + DB ─→ Fetch ─→ Normalize ─→ PgSQL  │
│              (Ashby/Lever/Greenhouse adapters)               │
│                                          │                  │
│                                   Diff Engine               │
│                                          │                  │
│                               Intelligence ─→ Notifications │
│                                                             │
│ Discovery (Common Crawl CDX) ─→ verify vs live API ─→ DB    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                   Neon PostgreSQL (multi-DB failover)
                               │
┌──────────────────────────────┴──────────────────────────────┐
│ Frontend (Next.js)                                          │
│                                                             │
│ Server Components ─→ PostgreSQL queries ─→ Scored job feed  │
│ /add page ─→ POST /api/companies ─→ Live scrape + insert   │
│   (source selector: Ashby / Lever / Greenhouse)              │
│ Status tracking ─→ localStorage (per-browser, not DB)       │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Backend (Scraper)

```bash
# Install dependencies
npm install

# Configure environment (set DATABASE_URL, or DATABASE_URLS for failover)
cp .env.example .env

# Run a single scrape cycle
node index.js run

# Start the scheduled scraper
node index.js start
```

### Frontend (Web UI)

```bash
cd web
npm install

# Configure environment
echo "DATABASE_URL=your_neon_connection_string" > .env.local

# Start the dev server
npx next dev -p 3000
```

## Adding Companies

### Automatically (Ashby + Greenhouse)

The `discover` command scans Common Crawl's free CDX index for each ATS's hosted job-board domain, verifies every candidate slug against the live posting API, and adds confirmed-active companies straight to the database:

```bash
node index.js discover --source ashby
node index.js discover --source greenhouse
node index.js discover --source ashby --dry-run   # preview without writing
```

Runs weekly via `.github/workflows/discover.yml`. Lever isn't included here — it blocks Common Crawl's bot in its own `robots.txt`, so there's no free crawl index to query for it; new Lever companies currently need a manual `site:jobs.lever.co` search-engine query and a CLI `add`.

### Via the Web UI

Navigate to `/add` in the frontend. Pick Ashby, Lever, or Greenhouse, then paste a job board URL (e.g. `https://jobs.ashbyhq.com/stripe`) or just the slug (`stripe`). The system validates the board against that platform's API, scrapes all open positions, and adds them to the database in real time. Future cron runs pick up the new company automatically.

### Via the CLI

```bash
node index.js add <slug> -n "Company Name" -s ashby|lever|greenhouse   # -s defaults to ashby
node index.js run   # scrape immediately
```

## Commands

| Command | Description |
|---|---|
| `node index.js run` | Run a single scrape cycle across all due companies |
| `node index.js start` | Start the cron-based scheduler |
| `node index.js report` | Generate a Markdown report from existing data |
| `node index.js add <slug> [-s source]` | Add a company to the source registry (ashby/lever/greenhouse) |
| `node index.js discover -s <source> [--dry-run]` | Crawl Common Crawl for new Ashby/Greenhouse companies and verify+add them |

## Configuration

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` — Neon PostgreSQL connection string (single URL)
- `DATABASE_URLS` — comma-separated list, priority order, for automatic failover — optional, takes priority over `DATABASE_URL` when set. Failover only, not replication: if the primary goes down and a backup takes over, rows written during that window don't retroactively appear on the primary once it recovers.
- `CRON_SCHEDULE` — Cron expression for scrape frequency (default: every 12h)
- `MIN_RELEVANCE_SCORE` — Minimum score threshold for surfaced jobs
- `LOG_LEVEL` — Logging verbosity (debug/info/warn/error)

Intelligence rules (keyword weights, preferred locations, etc.) are in `src/config/rules.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js (CommonJS) |
| Database | Neon PostgreSQL (connection pooling, SSL, multi-URL failover) |
| HTTP client | Axios with exponential backoff |
| Scheduling | node-cron with jitter |
| Discovery | Common Crawl CDX API (free, no key) |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| CLI | Commander with chalk output |

## Project Structure

```
├── index.js                CLI entry point (run, start, report, add, discover)
├── .github/workflows/
│   ├── scrape.yml          Scheduled scrape (every 2 days)
│   └── discover.yml        Scheduled Ashby/Greenhouse discovery (weekly)
├── src/
│   ├── config/             Environment + rules.json + per-source fetch config
│   ├── scheduler/          Cron + pipeline orchestration
│   ├── sources/            Company registry (registry.json + DB, slug+source)
│   ├── fetch/              Axios client, per-source URL/response handling
│   ├── normalize/          Per-ATS adapters (ashby/lever/greenhouse) → shared schema
│   │   └── adapters/
│   ├── discovery/          Common Crawl candidate discovery + live verification
│   ├── store/              PostgreSQL persistence (async pg, multi-DB failover)
│   ├── diff/               Change detection (NEW/UPDATED/REMOVED)
│   ├── intelligence/       Multi-signal scoring engine
│   ├── notify/             CLI output + Markdown reports
│   └── utils/              Logger, hash, delay helpers
├── web/
│   ├── app/                Next.js pages (feed, detail, applied, ignored, add)
│   │   └── api/companies/  POST to add + scrape (any source), GET to list companies
│   ├── components/         UI components (filters, job list, add company form, source tag)
│   └── lib/                Database queries (multi-DB failover), scoring, types, localStorage status
├── reports/                Generated Markdown reports
└── md/INTERVIEW_GUIDE.md   End-to-end project walkthrough
```
