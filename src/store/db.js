const { Pool, Client } = require('pg');
const config = require('../config');
const { logger } = require('../utils');
const { normalizeLocation } = require('../normalize/shared');

let pool = null;

function connectionOptions() {
  const url = config.db.url;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. ' +
      'In GitHub Actions, add it under Settings → Secrets and variables → Actions. ' +
      'Locally, add it to your .env file.'
    );
  }
  return {
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  };
}

function getPool() {
  if (pool) return pool;

  pool = new Pool({
    ...connectionOptions(),
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

// Schema setup runs on its own connection, not the pool: the pool's 30s
// statement/query timeouts are for scrape queries, while a one-time migration
// step (e.g. building the search GIN index over every job) legitimately takes
// minutes. Under the pool it was cancelled at 30s — and since every pipeline
// run starts with initDb, every run failed.
async function initDb() {
  const client = new Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
  client.on('error', (err) => logger.error(`Schema setup connection error: ${err.message}`));
  await client.connect();
  try {
    // Work is unbounded, waiting is not. A stuck session must not hang every
    // later setup, and a waiting ALTER TABLE queues every read of that table
    // (the site's) behind it — so fail after 30s of waiting for any lock; the
    // next run retries (every step is idempotent).
    await client.query(`SET lock_timeout = '30s'`);
    // Serializes concurrent setups (scraper boot, discovery job): two sessions
    // racing CREATE INDEX IF NOT EXISTS on one name can fail with a duplicate.
    // Session-level lock, released when the connection closes.
    await client.query('SELECT pg_advisory_lock(20260924)');
    await migrateSchema(client);
  } finally {
    await client.end();
  }
  logger.info('PostgreSQL database initialized');
}

async function migrateSchema(p) {

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
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_active_location ON jobs (location) WHERE is_active = TRUE`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_employment_type ON jobs (employment_type)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_matched_keywords ON jobs USING GIN (matched_keywords)`);

  // Full-text keyword search (web/lib/query.ts): words match in any order,
  // descriptions included, title/company hits rank first. Trigger-maintained
  // rather than a GENERATED column: upsertJob rewrites every row on every
  // scrape, and re-parsing ~28k descriptions nightly is minutes of CPU on this
  // 1-OCPU box — the trigger only recomputes when the searchable text changed.
  await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS search_tsv tsvector`);
  await p.query(`
    CREATE OR REPLACE FUNCTION jobs_search_tsv() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'INSERT' OR NEW.search_tsv IS NULL
         OR (NEW.title, NEW.company, NEW.department, NEW.team, NEW.location, NEW.description)
            IS DISTINCT FROM (OLD.title, OLD.company, OLD.department, OLD.team, OLD.location, OLD.description) THEN
        NEW.search_tsv :=
          setweight(to_tsvector('english', concat_ws(' ', NEW.title, NEW.company)), 'A') ||
          setweight(to_tsvector('english', concat_ws(' ', NEW.department, NEW.team, NEW.location)), 'B') ||
          setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
      END IF;
      RETURN NEW;
    END $$
  `);
  await p.query(`CREATE OR REPLACE TRIGGER jobs_search_tsv BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION jobs_search_tsv()`);
  // Backfill via the trigger (NULL -> NULL still fires it, and the trigger
  // fills NULLs; it never yields NULL, so this terminates). Batched so the
  // first boot is many short transactions, not one multi-minute UPDATE
  // locking every row, and a crash keeps finished batches. Every boot after
  // that it's a single no-match scan.
  for (;;) {
    const { rowCount } = await p.query(
      `UPDATE jobs SET search_tsv = NULL
       WHERE id IN (SELECT id FROM jobs WHERE search_tsv IS NULL LIMIT 1000)`
    );
    if (rowCount === 0) break;
  }
  await p.query(`CREATE INDEX IF NOT EXISTS idx_jobs_search ON jobs USING GIN (search_tsv)`);
  // Only served the old title/company ILIKE search, replaced by idx_jobs_search.
  await p.query(`DROP INDEX IF EXISTS idx_jobs_title_trgm`);
  await p.query(`DROP INDEX IF EXISTS idx_jobs_company_trgm`);

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
}

// One-time backfill for job rows written before the shared location
// normalizer existed. Not run automatically by initDb(): on a large table
// this is a real full-table scan, not something that should silently ride
// along on every scraper boot. Run explicitly via `node index.js migrate`
// once per database — the schema_migrations marker makes every run after
// the first a single cheap row lookup.
async function canonicalizeJobLocations() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const locationMigration = await p.query(
    `SELECT 1 FROM schema_migrations WHERE name = 'canonical-job-locations-v3'`
  );
  if (locationMigration.rowCount > 0) {
    logger.info('Job locations already canonicalized — nothing to do');
    return;
  }

  // Advisory lock (same pattern as the pipeline's run lock) stops two
  // concurrent `migrate` runs from racing this backfill. Held on one
  // dedicated connection so lock and unlock can't land on different pooled
  // sessions and leak the lock.
  const client = await p.connect();
  try {
    const { rows: lockRows } = await client.query('SELECT pg_try_advisory_lock(20260421) AS locked');
    if (!lockRows[0].locked) {
      logger.warn('Location canonicalization already running elsewhere — skipping');
      return;
    }
    try {
      // Chunked by id, not one SELECT * FROM jobs: bounds memory to one
      // page and avoids holding a single long transaction over the whole
      // table. normalizeLocation() is idempotent, so a crash mid-backfill
      // (marker only inserted at the end) just redoes the scan on the next
      // `migrate` run rather than corrupting anything.
      // ponytail: full rescan on restart rather than an id checkpoint —
      // fine at tens of thousands of rows, revisit if the table grows
      // enough that redoing the scan gets expensive.
      let lastId = 0;
      let totalUpdated = 0;
      for (;;) {
        const { rows } = await client.query(
          'SELECT id, location, remote FROM jobs WHERE id > $1 ORDER BY id LIMIT 1000',
          [lastId]
        );
        if (rows.length === 0) break;
        lastId = rows[rows.length - 1].id;

        const updates = [];
        for (const row of rows) {
          const normalized = normalizeLocation(row.location, row.remote);
          if (normalized.location !== row.location || normalized.remote !== row.remote) {
            updates.push([normalized.location, normalized.remote, row.id]);
          }
        }
        if (updates.length > 0) {
          const values = [];
          const placeholders = updates.map((update, index) => {
            const base = index * 3;
            values.push(...update);
            return `($${base + 1}, $${base + 2}, $${base + 3})`;
          });
          await client.query(
            `UPDATE jobs AS jobs
             SET location = updates.location, remote = updates.remote::boolean
             FROM (VALUES ${placeholders.join(', ')}) AS updates(location, remote, id)
             WHERE jobs.id = updates.id::integer`,
            values
          );
          totalUpdated += updates.length;
        }
        logger.info(`Canonicalizing job locations: scanned up to id ${lastId}, ${totalUpdated} updated so far`);
      }
      await client.query(
        `INSERT INTO schema_migrations (name) VALUES ('canonical-job-locations-v3')`
      );
      logger.info(`Canonicalized ${totalUpdated} existing job locations`);
    } finally {
      await client.query('SELECT pg_advisory_unlock(20260421)');
    }
  } finally {
    client.release();
  }
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, initDb, canonicalizeJobLocations, closeDb };
