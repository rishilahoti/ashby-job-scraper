const { Pool } = require('pg');
const config = require('../config');
const { logger } = require('../utils');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!config.db.url) {
    throw new Error(
      'DATABASE_URL is not set. ' +
      'In GitHub Actions, add it under Settings → Secrets and variables → Actions. ' +
      'Locally, add it to your .env file.'
    );
  }

  pool = new Pool({
    connectionString: config.db.url,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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
      ashby_slug TEXT NOT NULL UNIQUE,
      last_scraped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      team TEXT,
      department TEXT,
      employment_type TEXT,
      remote BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT,
      description_html TEXT,
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
      snapshot_data TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_job
      ON job_snapshots (company, job_id)
  `);

  logger.info('PostgreSQL database initialized (Neon)');
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, initDb, closeDb };
