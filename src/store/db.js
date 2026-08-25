const { Pool } = require('pg');
const config = require('../config');
const { logger } = require('../utils');

let pools = null; // [{ url, pool }], priority order — index 0 is primary
let activeIndex = 0;

function isConnectionFailure(err) {
  const msg = err?.message || '';
  return (
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ETIMEDOUT' ||
    msg.includes('timeout') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('Connection terminated') ||
    msg.includes('too many connections') ||
    msg.includes('compute time') // Neon free-tier quota exhausted
  );
}

function buildPools() {
  if (pools) return pools;
  const urls = config.db.urls;
  if (urls.length === 0) {
    throw new Error(
      'DATABASE_URL is not set. ' +
      'In GitHub Actions, add it under Settings → Secrets and variables → Actions. ' +
      'Locally, add it to your .env file.'
    );
  }

  pools = urls.map((url, i) => {
    const p = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      query_timeout: 30000,
    });
    p.on('error', (err) => {
      logger.error(`Unexpected pool error (DB #${i + 1}): ${err.message}`);
    });
    return { url, pool: p };
  });

  return pools;
}

// Drop-in replacement for a plain pg Pool — same .query() surface, but on a
// connection-level failure it transparently retries the next DATABASE_URLS
// entry, in priority order, and remembers the last-good one for subsequent
// calls in this process (avoids re-hitting a dead primary on every query).
//
// ponytail: this is failover, not replication — there's no reconciliation
// between DBs. Rows written to a backup DB while the primary is down won't
// exist on the primary once it recovers and traffic moves back. Fine for a
// side-project job tracker (worst case: a few stale "applied" flags, some
// jobs get rescraped as "new"); if that gap ever matters, write a one-off
// script to diff+merge (company, job_id) rows between DBs after an outage.
function getPool() {
  const list = buildPools();

  return {
    query: async (text, params) => {
      let lastErr;
      const order = [
        ...Array.from({ length: list.length - activeIndex }, (_, i) => activeIndex + i),
        ...Array.from({ length: activeIndex }, (_, i) => i),
      ];

      for (const i of order) {
        try {
          const result = await list[i].pool.query(text, params);
          if (i !== activeIndex) {
            logger.warn(`Failed over to DB #${i + 1}`);
            activeIndex = i;
          }
          return result;
        } catch (err) {
          lastErr = err;
          if (!isConnectionFailure(err)) throw err; // real query error (bad SQL etc) — don't fail over
          logger.warn(`DB #${i + 1} unreachable (${err.message})`);
        }
      }

      throw lastErr;
    },
  };
}

async function initDb() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ashby',
      last_scraped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      company TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ashby',
      title TEXT NOT NULL,
      location TEXT,
      team TEXT,
      department TEXT,
      employment_type TEXT,
      remote BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT,
      apply_url TEXT,
      job_url TEXT,
      published_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ NOT NULL,
      compensation_summary TEXT,
      content_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_company_jobid
      ON jobs (company, job_id)
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs (is_active)
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs (company)
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS job_snapshots (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      company TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      snapshot_data JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_job
      ON job_snapshots (company, job_id)
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id SERIAL PRIMARY KEY,
      company TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      status TEXT,
      jobs_fetched INT,
      jobs_inserted INT,
      jobs_updated INT,
      jobs_removed INT,
      error_message TEXT
    )
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_runs_company
      ON scrape_runs (company, started_at DESC)
  `);

  // --- one-time migrations for existing deployments ---

  // drop description_html if it still exists (frees up ~50-80% storage per row)
  await p.query(`
    ALTER TABLE jobs DROP COLUMN IF EXISTS description_html
  `);

  // rename companies.ashby_slug -> slug + add source column (multi-ATS support)
  await p.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'ashby_slug'
      ) THEN
        ALTER TABLE companies RENAME COLUMN ashby_slug TO slug;
      END IF;
    END$$
  `);

  await p.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ashby'`);
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ashby'`);

  // structured salary data (min/max/currency), where the source exposes it —
  // compensation_summary stays as the free-text display string
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_min NUMERIC`);
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_max NUMERIC`);
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_currency TEXT`);
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_interval TEXT`);

  // old schema had a single-column UNIQUE(ashby_slug) — replace with UNIQUE(slug, source)
  // now that the same slug string could exist under different ATSes.
  await p.query(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_ashby_slug_key`);
  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug_source
      ON companies (slug, source)
  `);

  // migrate snapshot_data column from TEXT to JSONB if needed
  await p.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_snapshots'
          AND column_name = 'snapshot_data'
          AND data_type = 'text'
      ) THEN
        ALTER TABLE job_snapshots
          ALTER COLUMN snapshot_data TYPE JSONB USING snapshot_data::jsonb;
      END IF;
    END$$
  `);

  logger.info(`PostgreSQL database initialized (Neon) — ${config.db.urls.length} DB(s) configured`);
}

async function closeDb() {
  if (pools) {
    await Promise.all(pools.map(({ pool }) => pool.end()));
    pools = null;
    activeIndex = 0;
  }
}

module.exports = { getPool, initDb, closeDb };
