# Contributing to Ashby Jobs

Thanks for considering contributing. This project is a full-stack job tracker: a Node.js scraper for Ashby, Lever, and Greenhouse job boards, and a Next.js frontend backed by Neon PostgreSQL.

## Ways to Contribute

1. **Add companies** — Use the `/add` page, run `node index.js discover -s ashby|greenhouse` (Common Crawl-based, verifies live before adding), or suggest new slugs.
2. **Add a new ATS adapter** — See `src/normalize/adapters/` for the Ashby/Lever/Greenhouse pattern; a new source needs a fetch entry in `src/fetch/client.js` (`SOURCE_REQUESTS`) and a normalize adapter with the same `{ jobId, title, location, team, department, employmentType, remote, description, applyUrl, jobUrl, publishedAt, compensationSummary }` shape.
3. **Fix bugs** — Report or fix issues in the scraper, frontend, or API.
4. **Improve scoring** — Tweak keyword weights, location/department boosts, or freshness rules in `src/config/rules.json` and `web/lib/scoring.ts`.
5. **Documentation** — Improve README, INTERVIEW_GUIDE, or code comments.
6. **Performance & reliability** — Optimize queries, caching, or Neon connection handling (including the multi-DB failover in `src/store/db.js` / `web/lib/db.ts`).

## Development Setup

### Prerequisites

- Node.js 18+
- A Neon PostgreSQL database (or local Postgres with the same schema)

### Backend (scraper)

```bash
npm install
cp .env.example .env
# Set DATABASE_URL in .env
node index.js run    # one scrape cycle
node index.js start # cron scheduler
```

### Frontend (web)

```bash
cd web
npm install
echo "DATABASE_URL=your_neon_url" > .env.local
npx next dev -p 3000
```

### Key paths

- **Backend:** `src/` (scheduler, fetch, normalize, discovery, store, diff, intelligence, notify)
- **Frontend:** `web/app/`, `web/components/`, `web/lib/`
- **Scoring rules:** `src/config/rules.json`, `web/lib/scoring.ts`
- **Company list:** `src/sources/registry.json` (curated seed); DB `companies` table (dynamically added via `/add` or `discover`) — `getEnabledCompaniesWithDb()` merges both, so the DB is the real source of truth beyond the initial seed

## How to Contribute

1. **Fork the repo** and clone your fork locally.

2. **Create a branch** for your change:
   ```bash
   git checkout -b fix/thing or feature/thing
   ```

3. **Make your changes.** Keep backend (CommonJS) and frontend (TypeScript) style consistent with the rest of the codebase.

4. **Test:**
   - Backend: `node index.js run` (and optionally `node index.js report`).
   - Frontend: `cd web && npx next dev` and click through feed, filters, applied/ignored, add company.

5. **Commit** with a clear message, e.g. `fix: connection timeout retry` or `feat: add company X to registry`.

6. **Push** and open a **Pull Request** against the main branch. Describe what you changed and why.

7. **Respond to review** if the maintainer asks for changes.

## Pull Request Guidelines

- One logical change per PR when possible.
- Don’t commit `.env` or secrets; use `.env.example` for required variables.
- If you add a new company via the registry, use the same JSON shape: `company`, `slug`, `source` (`ashby`/`lever`/`greenhouse`), `enabled`, `frequencyHours`.

## Code of Conduct

Be respectful and constructive. This is a personal/open project; feedback and patches are welcome.
