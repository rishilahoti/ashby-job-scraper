const { getPool } = require('./db');
const { logger } = require('../utils');

const MAX_SNAPSHOTS_PER_JOB = 2;

async function getActiveJobIdsForCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT job_id, title, location, team, department, employment_type, remote, apply_url, job_url FROM jobs WHERE company = $1 AND is_active = TRUE',
    [company]
  );
  return rows;
}

async function getActiveJobsForCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT job_id, company, title, location, team, department,
            employment_type, remote, description, apply_url, job_url,
            published_at, scraped_at, compensation_summary, content_hash,
            is_active, status, created_at, updated_at
     FROM jobs WHERE company = $1 AND is_active = TRUE`,
    [company]
  );
  return rows;
}

async function getJobByCompanyAndId(company, jobId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT job_id, company, title, location, team, department, employment_type, remote, apply_url, job_url, published_at, compensation_summary, content_hash FROM jobs WHERE company = $1 AND job_id = $2',
    [company, jobId]
  );
  return rows[0] || null;
}

async function upsertJob(job) {
  const pool = getPool();

  const { rows } = await pool.query(
    `INSERT INTO jobs (
        job_id, company, title, location, team, department,
        employment_type, remote, description,
        apply_url, job_url, published_at, scraped_at,
        compensation_summary, content_hash, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, TRUE
      )
      ON CONFLICT (company, job_id) DO UPDATE SET
        title             = EXCLUDED.title,
        location          = EXCLUDED.location,
        team              = EXCLUDED.team,
        department        = EXCLUDED.department,
        employment_type   = EXCLUDED.employment_type,
        remote            = EXCLUDED.remote,
        description       = CASE
                              WHEN jobs.content_hash = EXCLUDED.content_hash THEN jobs.description
                              ELSE EXCLUDED.description
                            END,
        apply_url         = EXCLUDED.apply_url,
        job_url           = EXCLUDED.job_url,
        published_at      = EXCLUDED.published_at,
        scraped_at        = EXCLUDED.scraped_at,
        compensation_summary = EXCLUDED.compensation_summary,
        content_hash      = CASE
                              WHEN jobs.content_hash = EXCLUDED.content_hash THEN jobs.content_hash
                              ELSE EXCLUDED.content_hash
                            END,
        is_active         = TRUE,
        updated_at        = NOW()
      RETURNING
        (xmax = 0)                          AS was_inserted,
        (xmax <> 0 AND content_hash = $15)  AS was_unchanged`,
    [
      job.jobId, job.company, job.title, job.location, job.team, job.department,
      job.employmentType, !!job.remote, job.description,
      job.applyUrl, job.jobUrl, job.publishedAt, job.scrapedAt,
      job.compensationSummary, job.contentHash,
    ]
  );

  const { was_inserted, was_unchanged } = rows[0];
  if (was_inserted) return 'inserted';
  if (was_unchanged) return 'unchanged';
  return 'updated';
}

async function markRemovedJobs(company, activeJobIds) {
  const pool = getPool();
  const currentActive = await getActiveJobIdsForCompany(company);
  const activeSet = new Set(activeJobIds);
  const removedRows = currentActive.filter(j => !activeSet.has(j.job_id));

  if (removedRows.length === 0) return [];

  const removedJobIds = removedRows.map(j => j.job_id);

  await pool.query(
    `UPDATE jobs
       SET is_active = FALSE, updated_at = NOW()
     WHERE company = $1
       AND job_id = ANY($2::text[])`,
    [company, removedJobIds]
  );

  logger.debug(`Marked ${removedRows.length} jobs as removed for ${company}`);

  return removedRows.map(row => ({
    job_id: row.job_id,
    company,
    title: row.title,
    location: row.location,
    team: row.team,
    department: row.department,
    employment_type: row.employment_type,
    remote: Boolean(row.remote),
    apply_url: row.apply_url,
    job_url: row.job_url,
  }));
}

async function saveSnapshot(job) {
  const pool = getPool();

  const { rows: existing } = await pool.query(
    'SELECT id FROM job_snapshots WHERE company = $1 AND job_id = $2 AND content_hash = $3 LIMIT 1',
    [job.company, job.jobId, job.contentHash]
  );
  if (existing.length > 0) return;

  // Strip description — it's already in the jobs table, no need to duplicate in JSONB.
  const { description: _desc, ...snapshotData } = job;

  await pool.query(
    `INSERT INTO job_snapshots (job_id, company, content_hash, snapshot_data)
     VALUES ($1, $2, $3, $4)`,
    [job.jobId, job.company, job.contentHash, snapshotData]
  );

  await pool.query(
    `DELETE FROM job_snapshots
     WHERE company = $1 AND job_id = $2
       AND id NOT IN (
         SELECT id FROM job_snapshots
         WHERE company = $1 AND job_id = $2
         ORDER BY captured_at DESC
         LIMIT $3
       )`,
    [job.company, job.jobId, MAX_SNAPSHOTS_PER_JOB]
  );
}

async function getAllActiveJobs() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       job_id, company, title, location, team, department,
       employment_type, remote,
       LEFT(description, 500) AS description,
       apply_url, job_url, published_at, compensation_summary
     FROM jobs
     WHERE is_active = TRUE
     ORDER BY company, published_at DESC`
  );
  return rows;
}

async function getJobsByCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT job_id, company, title, location, team, department,
            employment_type, remote, description, apply_url, job_url,
            published_at, scraped_at, compensation_summary, content_hash,
            is_active, status, created_at, updated_at
     FROM jobs WHERE company = $1 ORDER BY published_at DESC`,
    [company]
  );
  return rows;
}

// Scrape run tracking

async function startScrapeRun(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO scrape_runs (company, started_at, status)
     VALUES ($1, NOW(), 'running')
     RETURNING id`,
    [company]
  );
  return rows[0].id;
}

async function completeScrapeRun(id, { status, jobsFetched, jobsInserted, jobsUpdated, jobsRemoved, errorMessage }) {
  const pool = getPool();
  await pool.query(
    `UPDATE scrape_runs SET
       completed_at = NOW(),
       status = $2,
       jobs_fetched = $3,
       jobs_inserted = $4,
       jobs_updated = $5,
       jobs_removed = $6,
       error_message = $7
     WHERE id = $1`,
    [id, status, jobsFetched ?? null, jobsInserted ?? null, jobsUpdated ?? null, jobsRemoved ?? null, errorMessage ?? null]
  );
}

// Delete inactive jobs older than retentionDays to keep Neon storage under control.
async function cleanupOldInactiveJobs(retentionDays = 30) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM jobs
     WHERE is_active = FALSE
       AND updated_at < NOW() - ($1 || ' days')::INTERVAL`,
    [retentionDays]
  );
  if (rowCount > 0) {
    logger.info(`Cleaned up ${rowCount} inactive jobs older than ${retentionDays} days`);
  }
  return rowCount;
}

module.exports = {
  getActiveJobsForCompany,
  getActiveJobIdsForCompany,
  getJobByCompanyAndId,
  upsertJob,
  markRemovedJobs,
  saveSnapshot,
  getAllActiveJobs,
  getJobsByCompany,
  startScrapeRun,
  completeScrapeRun,
  cleanupOldInactiveJobs,
};
