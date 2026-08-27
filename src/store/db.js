const { Pool } = require('pg');
const config = require('../config');
const { logger } = require('../utils');

let pool = null;

function getPool() {
  if (pool) return pool;

  const url = config.db.url;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. ' +
      'In GitHub Actions, add it under Settings → Secrets and variables → Actions. ' +
      'Locally, add it to your .env file.'
    );
  }

  pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 30000,
  });
  pool.on('error', (err) => {
    logger.error(`Unexpected pool error: ${err.message}`);
  });

  return pool;
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

  // precomputed relevance score (minus time-decaying freshness boost, added back
  // in SQL at query time) + matched keywords — lets the web app push filter/sort/
  // pagination into Postgres instead of loading + scoring the whole table per request
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS base_score INT NOT NULL DEFAULT 0`);
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS matched_keywords TEXT[] NOT NULL DEFAULT '{}'`);

  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_active_published ON jobs (published_at DESC) WHERE is_active = TRUE`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_active_score ON jobs (base_score DESC) WHERE is_active = TRUE`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_remote ON jobs (remote)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_department ON jobs (department)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_team ON jobs (team)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs (location)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_employment_type ON jobs (employment_type)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_matched_keywords ON jobs USING GIN (matched_keywords)`);

  // trigram index — makes ILIKE '%term%' (leading wildcard, unindexable by btree) fast
  await p.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING GIN (title gin_trgm_ops)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_company_trgm ON jobs USING GIN (company gin_trgm_ops)`);

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

  logger.info('PostgreSQL database initialized');
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, initDb, closeDb };
