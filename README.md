# Ashby Jobs

A production-grade system that scrapes public job listings across **Ashby, Lever, and Greenhouse** — hundreds of companies and counting — persists them in PostgreSQL, tracks changes over time, and surfaces actionable opportunities through a Next.js frontend with intelligent scoring.

## Features

- **Multi-ATS** — Ashby, Lever, and Greenhouse job boards in one feed, via per-source fetch/normalize adapters
- **Self-growing registry** — Weekly crawl-based discovery (Common Crawl CDX API) finds new Ashby/Greenhouse company boards, verifies each against the live API, and adds it automatically — no manual JSON editing required
- **Self-Service Company Addition** — Paste any Ashby, Lever, or Greenhouse job board URL in the frontend to add and scrape a new company in real time
- **Automated Scraping** — Runs its own cron (default every 3 days) inside the scraper container (no external scheduler needed)
- **Change Detection** — Tracks new, updated, and removed postings via content hashing
- **Intelligent Scoring** — Ranks jobs by keyword relevance, location, remote preference, department, and freshness
- **Self-hosted Database** — Postgres running on a Docker Compose stack (see [Deployment](#deployment)), SSL-enabled, reachable over the public internet for the Vercel frontend
- **Web Frontend** — Next.js 16 App Router (deployed on Vercel) with filtering, pagination, and per-browser apply/ignore tracking (localStorage)
- **Stealth-Aware** — Jittered scheduling, randomized delays, browser-like headers
- **Reports** — CLI summaries and daily Markdown reports with apply links

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Docker Compose (self-hosted VM)                              │
│                                                               │
│  scraper container ─→ Scheduler ─→ Registry + DB ─→ Fetch ─→ │
│  Normalize ─→ PgSQL   (Ashby/Lever/Greenhouse adapters)       │
│                              │                                │
│                       Diff Engine                             │
│                              │                                │
│                   Intelligence ─→ Notifications               │
│                                                               │
│  db container ─→ Postgres 17, SSL, exposed on :5432          │
└──────────────────────────────┬───────────────────────────────┘
                               │  (public internet, TLS)
┌──────────────────────────────┴───────────────────────────────┐
│ Frontend (Next.js on Vercel)                                  │
│                                                                │
│ Server Components ─→ PostgreSQL queries ─→ Scored job feed    │
│ /add page ─→ POST /api/companies ─→ Live scrape + insert      │
│   (source selector: Ashby / Lever / Greenhouse)                │
│ Status tracking ─→ localStorage (per-browser, not DB)         │
└─────────────────────────────────────────────────────────────┘
```

## Deployment

Frontend and database are hosted separately:

- **Frontend** — Vercel, auto-deploys on push to `main`. Set `DATABASE_URL` in Vercel's Environment Variables to the self-hosted Postgres connection string, then trigger a redeploy — env var changes don't apply to already-running deployments.
- **Database + scraper** — `docker-compose.yml` at repo root runs `db` (Postgres 17, SSL enabled via a self-signed cert in `./certs/`, published on `5432`), `scraper` (runs `node index.js start`, which scrapes immediately on boot then follows `CRON_SCHEDULE`, default every 3 days), and `watchtower` (polls GHCR every 5 min, auto-pulls + recreates `scraper` on new pushes to `main` — no manual SSH/pull needed). The scraper image is built and pushed to GHCR by `.github/workflows/build-images.yml` on every push to `main`.
- **Migrating from Neon (or any other Postgres)** — `scripts/migrate-from-neon.sh` runs `pg_dump | psql` from a source URL into the local `db` container. Run it from the deployment host after `docker compose up -d db`.

SSL note: the self-signed cert encrypts the connection but isn't CA-verified — both `src/store/db.js` and `web/lib/db.ts` connect with `rejectUnauthorized: false`, and only enable SSL at all when the connection string includes `sslmode=require`.

## Quick Start

### Backend (Scraper)

```bash
# Install dependencies
npm install

# Configure environment (set DATABASE_URL)
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
echo "DATABASE_URL=your_postgres_connection_string" > .env.local

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

- `DATABASE_URL` — PostgreSQL connection string
- `CRON_SCHEDULE` — Cron expression for scrape frequency (default: every 3 days, 00:00 UTC)
- `MIN_RELEVANCE_SCORE` — Minimum score threshold for surfaced jobs
- `LOG_LEVEL` — Logging verbosity (debug/info/warn/error)

Intelligence rules (keyword weights, preferred locations, etc.) are in `src/config/rules.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js (CommonJS), Docker Compose |
| Database | PostgreSQL 17, self-hosted, SSL, multi-URL failover |
| HTTP client | Axios with exponential backoff |
| Scheduling | node-cron with jitter, runs in-container |
| Discovery | Common Crawl CDX API (free, no key) |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS — deployed on Vercel |
| CLI | Commander with chalk output |

## Project Structure

```
├── index.js                CLI entry point (run, start, report, add, discover)
├── Dockerfile               Scraper image (built by build-images.yml → GHCR)
├── docker-compose.yml       db (Postgres 17 + SSL) + scraper containers
├── scripts/
│   └── migrate-from-neon.sh  One-off pg_dump/psql migration into the db container
├── .github/workflows/
│   ├── build-images.yml    Builds + pushes the scraper image to GHCR (on push to main)
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
