const { getPool } = require('./db');
const { logger } = require('../utils');

// How many snapshot versions to keep per job (older ones get pruned automatically)
const MAX_SNAPSHOTS_PER_JOB = 3;

/**
 * Fetch only the lightweight columns needed for removed-job detection.
 * Avoids pulling large description / description_html over the wire.
 */
async function getActiveJobIdsForCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT job_id, title, location, team, department, employment_type, remote, apply_url, job_url FROM jobs WHERE company = $1 AND is_active = TRUE',
    [company]
  );
  return rows;
}

// Keep for external callers that genuinely need full rows (e.g. getJobsByCompany)
async function getActiveJobsForCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM jobs WHERE company = $1 AND is_active = TRUE',
    [company]
  );
  return rows;
}

async function getJobByCompanyAndId(company, jobId) {
  const pool = getPool();
  // Only fetch the columns actually needed for change detection
  const { rows } = await pool.query(
    'SELECT job_id, company, title, location, team, department, employment_type, remote, apply_url, job_url, published_at, compensation_summary, content_hash FROM jobs WHERE company = $1 AND job_id = $2',
    [company, jobId]
  );
  return rows[0] || null;
}

/**
 * Upsert a job using pure ON CONFLICT — no pre-SELECT needed.
 * Returns 'inserted', 'updated', or 'unchanged'.
 */
async function upsertJob(job) {
  const pool = getPool();

  // Use a single upsert that also returns whether it was inserted/updated/unchanged.
  // xmax = 0 means the row was newly inserted; otherwise it was updated.
  const { rows } = await pool.query(
    `INSERT INTO jobs (
        job_id, company, title, location, team, department,
        employment_type, remote, description, description_html,
        apply_url, job_url, published_at, scraped_at,
        compensation_summary, content_hash, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, TRUE
      )
      ON CONFLICT (company, job_id) DO UPDATE SET
        title             = EXCLUDED.title,
        location          = EXCLUDED.location,
        team              = EXCLUDED.team,
        department        = EXCLUDED.department,
        employment_type   = EXCLUDED.employment_type,
        remote            = EXCLUDED.remote,
        description       = EXCLUDED.description,
        description_html  = EXCLUDED.description_html,
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
        (xmax <> 0 AND content_hash = $16)  AS was_unchanged`,
    [
      job.jobId, job.company, job.title, job.location, job.team, job.department,
      job.employmentType, !!job.remote, job.description, job.descriptionHtml,
      job.applyUrl, job.jobUrl, job.publishedAt, job.scrapedAt,
      job.compensationSummary, job.contentHash,
    ]
  );

  const { was_inserted, was_unchanged } = rows[0];
  if (was_inserted) return 'inserted';
  if (was_unchanged) return 'unchanged';
  return 'updated';
}

/**
 * Mark jobs as inactive in a single bulk UPDATE instead of N individual queries.
 * Only fetches job_id + lightweight columns to detect which jobs were removed.
 */
async function markRemovedJobs(company, activeJobIds) {
  const pool = getPool();
  const currentActive = await getActiveJobIdsForCompany(company);
  const activeSet = new Set(activeJobIds);
  const removedRows = currentActive.filter(j => !activeSet.has(j.job_id));

  if (removedRows.length === 0) return [];

  const removedJobIds = removedRows.map(j => j.job_id);

  // Single bulk UPDATE instead of one query per removed job
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

/**
 * Save a snapshot only when there isn't already one with this content_hash.
 * After saving, prune old snapshots beyond MAX_SNAPSHOTS_PER_JOB.
 * This prevents the job_snapshots table from growing without bound.
 */
async function saveSnapshot(job) {
  const pool = getPool();

  // Dedup: skip if an identical snapshot already exists (same content_hash)
  const { rows: existing } = await pool.query(
    'SELECT id FROM job_snapshots WHERE company = $1 AND job_id = $2 AND content_hash = $3 LIMIT 1',
    [job.company, job.jobId, job.contentHash]
  );
  if (existing.length > 0) return; // already captured this version

  // Strip description_html from the snapshot blob to save space —
  // the plain-text description is sufficient for diff/audit purposes.
  const { descriptionHtml: _dropped, ...snapshotData } = job;

  await pool.query(
    `INSERT INTO job_snapshots (job_id, company, content_hash, snapshot_data)
     VALUES ($1, $2, $3, $4)`,
    [job.jobId, job.company, job.contentHash, JSON.stringify(snapshotData)]
  );

  // Prune oldest snapshots beyond the retention limit
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

/**
 * Fetch only the columns needed for intelligence filtering — intentionally
 * excludes description_html which is large and unused after this point.
 */
async function getAllActiveJobs() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       job_id, company, title, location, team, department,
       employment_type, remote, description,
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
    'SELECT * FROM jobs WHERE company = $1 ORDER BY published_at DESC',
    [company]
  );
  return rows;
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
};
