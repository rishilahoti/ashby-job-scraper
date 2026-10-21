const { getPool } = require('./db');
const { logger } = require('../utils');
const config = require('../config');
const crypto = require('crypto');
const { computeStoredScore, TAGGING_VERSION } = require('../intelligence/rules-engine');
const { departmentGroup, DEPARTMENT_RULES_VERSION } = require('../normalize/departments');

const MAX_SNAPSHOTS_PER_JOB = 2;

// Cheap lookup used to skip re-sending unchanged descriptions over the wire.
async function getContentHashesForCompany(company) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT job_id, content_hash FROM jobs WHERE company = $1 AND is_active = TRUE',
    [company]
  );
  return new Map(rows.map(r => [r.job_id, r.content_hash]));
}

// Bumps scraped_at/is_active without re-sending the (large) description column.
async function touchJob(company, jobId, scrapedAt) {
  const pool = getPool();
  await pool.query(
    `UPDATE jobs SET scraped_at = $1, is_active = TRUE, updated_at = NOW()
     WHERE company = $2 AND job_id = $3`,
    [scrapedAt, company, jobId]
  );
}

async function upsertJob(job) {
  const pool = getPool();
  const { baseScore, matchedKeywords, minYears } = computeStoredScore(job, config.intelligence.rules);

  const { rows } = await pool.query(
    `WITH old_hash AS (
        SELECT content_hash FROM jobs WHERE company = $2 AND job_id = $1
      )
      INSERT INTO jobs (
        job_id, company, source, title, location, team, department,
        employment_type, remote, description,
        apply_url, job_url, published_at, scraped_at,
        compensation_summary, compensation_min, compensation_max, compensation_currency, compensation_interval,
        content_hash, is_active, base_score, matched_keywords, department_group, min_years
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, TRUE, $21, $22, $23, $24
      )
      ON CONFLICT (company, job_id) DO UPDATE SET
        source            = EXCLUDED.source,
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
        compensation_summary  = EXCLUDED.compensation_summary,
        compensation_min      = EXCLUDED.compensation_min,
        compensation_max      = EXCLUDED.compensation_max,
        compensation_currency = EXCLUDED.compensation_currency,
        compensation_interval = EXCLUDED.compensation_interval,
        content_hash      = EXCLUDED.content_hash,
        is_active         = TRUE,
        base_score        = EXCLUDED.base_score,
        matched_keywords  = EXCLUDED.matched_keywords,
        department_group  = EXCLUDED.department_group,
        min_years         = EXCLUDED.min_years,
        updated_at        = NOW()
      RETURNING
        (xmax = 0)                                               AS was_inserted,
        (xmax <> 0 AND (SELECT content_hash FROM old_hash) = $20) AS was_unchanged`,
    [
      job.jobId, job.company, job.source || 'ashby', job.title, job.location, job.team, job.department,
      job.employmentType, !!job.remote, job.description,
      job.applyUrl, job.jobUrl, job.publishedAt, job.scrapedAt,
      job.compensationSummary, job.compensationMin ?? null, job.compensationMax ?? null, job.compensationCurrency ?? null,
      job.compensationInterval ?? null, job.contentHash, baseScore, matchedKeywords,
      departmentGroup(job.department, job.team, job.title), minYears,
    ]
  );

  const { was_inserted, was_unchanged } = rows[0];
  if (was_inserted) return 'inserted';
  if (was_unchanged) return 'unchanged';
  return 'updated';
}

// Deactivates the company's active jobs missing from this scrape and returns
// them shaped like normalized jobs, for the JOB_REMOVED events.
async function markRemovedJobs(company, activeJobIds) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE jobs
       SET is_active = FALSE, updated_at = NOW()
     WHERE company = $1
       AND is_active = TRUE
       AND NOT (job_id = ANY($2::text[]))
     RETURNING job_id AS "jobId", company, title, location, team, department,
               employment_type AS "employmentType", remote,
               apply_url AS "applyUrl", job_url AS "jobUrl"`,
    [company, activeJobIds]
  );

  if (rows.length > 0) logger.debug(`Marked ${rows.length} jobs as removed for ${company}`);

  return rows;
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
       job_id AS "jobId", company, source, title, location, team, department,
       employment_type AS "employmentType", remote,
       LEFT(description, 500) AS description,
       apply_url AS "applyUrl", job_url AS "jobUrl", published_at AS "publishedAt",
       compensation_summary AS "compensationSummary",
       compensation_min AS "compensationMin", compensation_max AS "compensationMax",
       compensation_currency AS "compensationCurrency", compensation_interval AS "compensationInterval"
     FROM jobs
     WHERE is_active = TRUE`
  );
  // No ORDER BY: both callers re-sort by score (filterAndRank), and sorting
  // ~50K rows with their description snippets spilled to disk on the 1 GB VM.
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

// Stored base_score, matched_keywords and department_group go stale when
// rules.json or the department groups change:
// detectChanges only touches jobs whose content is unchanged, never re-scores
// them. So once per rules version, re-score every active job. Batched by id
// like canonicalizeJobLocations; the version is saved last, so a crash midway
// just redoes the pass on the next run.
async function rescoreJobsIfRulesChanged(rules) {
  const pool = getPool();
  const version = crypto.createHash('sha256')
    .update(JSON.stringify({ rules, TAGGING_VERSION, DEPARTMENT_RULES_VERSION }))
    .digest('hex');
  const { rows: state } = await pool.query(`SELECT value FROM app_state WHERE key = 'rules_version'`);
  if (state[0]?.value === version) return 0;

  let lastId = 0;
  let total = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, title, description, location, remote, department, team
       FROM jobs WHERE is_active = TRUE AND id > $1 ORDER BY id LIMIT 500`,
      [lastId]
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    const values = [];
    const placeholders = rows.map((row, i) => {
      const { baseScore, matchedKeywords, minYears } = computeStoredScore(row, rules);
      values.push(row.id, baseScore, matchedKeywords, departmentGroup(row.department, row.team, row.title), minYears);
      return `($${i * 5 + 1}::int, $${i * 5 + 2}::int, $${i * 5 + 3}::text[], $${i * 5 + 4}::text, $${i * 5 + 5}::smallint)`;
    });
    // Only rows whose score, tags, group or years change. Most jobs aren't dev
    // roles and get no new tags; rewriting them would just bloat the table.
    const { rowCount } = await pool.query(
      `UPDATE jobs SET base_score = v.base_score, matched_keywords = v.tags, department_group = v.department_group,
         min_years = v.min_years
       FROM (VALUES ${placeholders.join(', ')}) AS v(id, base_score, tags, department_group, min_years)
       WHERE jobs.id = v.id
         AND (jobs.base_score, jobs.matched_keywords, jobs.department_group, jobs.min_years)
             IS DISTINCT FROM (v.base_score, v.tags, v.department_group, v.min_years)`,
      values
    );
    total += rowCount ?? 0;
  }

  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('rules_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [version]
  );
  logger.info(`Rules changed: updated the score, tags or department of ${total} active jobs`);
  return total;
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
  getContentHashesForCompany,
  touchJob,
  upsertJob,
  markRemovedJobs,
  saveSnapshot,
  getAllActiveJobs,
  startScrapeRun,
  completeScrapeRun,
  rescoreJobsIfRulesChanged,
  cleanupOldInactiveJobs,
};
