const config = require('../config');
const { logger } = require('../utils');
const { getEnabledCompaniesWithDb, getDueCompanies } = require('../sources');
const { fetchJobBoard, FetchError } = require('../fetch');
const { normalizeResponse } = require('../normalize');
const store = require('../store');
const { detectChanges } = require('../diff');
const intelligence = require('../intelligence');
const { printRunSummary, generateReport } = require('../notify');
const { runDigest } = require('../digest');

const CONCURRENCY = 16;

async function scrapeCompany(company) {
  const source = company.source || 'ashby';
  const runId = await store.startScrapeRun(company.company);
  try {
    await store.upsertCompany(company.company, company.slug, source);

    const rawData = await fetchJobBoard(company.slug, source);
    const normalizedJobs = normalizeResponse(rawData, company.company, source);
    const changes = await detectChanges(normalizedJobs, company.company);

    const inserted = changes.filter(c => c.type === 'JOB_NEW').length;
    const updated  = changes.filter(c => c.type === 'JOB_UPDATED').length;
    const removed  = changes.filter(c => c.type === 'JOB_REMOVED').length;

    await store.updateLastScraped(company.slug, source);
    await store.completeScrapeRun(runId, {
      status: 'success',
      jobsFetched: normalizedJobs.length,
      jobsInserted: inserted,
      jobsUpdated: updated,
      jobsRemoved: removed,
    });

    logger.info(`[${company.company}] ${normalizedJobs.length} jobs, +${inserted} ~${updated} -${removed}`);
    return changes;
  } catch (err) {
    await store.completeScrapeRun(runId, { status: 'error', errorMessage: err.message });
    if (err instanceof FetchError) {
      logger.error(`Fetch error for ${company.company}: ${err.message}`);
    } else {
      logger.error(`Pipeline error for ${company.company}: ${err.message}`);
    }
    return [];
  }
}

// The last 23 hours, not just this run: a container restart (every merge to
// main) can do the day's scrape hours before the nightly run, which then
// finds nothing due. 23, not 24, so it never reaches back into the previous
// nightly run (cron at 00:00 plus jitter, a few minutes long).
// ponytail: a fixed window, not "since the last digest": a restart run in the
// hour after a nightly run lands in neither digest. Store the last send time
// if that ever matters.
async function sendDailyDigest(pool) {
  // Best effort: an email problem must never fail the scrape.
  try {
    await runDigest(pool, { since: new Date(Date.now() - 23 * 60 * 60 * 1000) });
  } catch (err) {
    logger.error(`Daily digest failed: ${err.message}`);
  }
}

async function runPipeline({ digest = true } = {}) {
  const startTime = Date.now();
  logger.info('Pipeline run started');

  await store.initDb();

  const pool = store.getPool();

  // Advisory lock: prevent two pipeline processes running concurrently against the same DB.
  const { rows: lockRows } = await pool.query('SELECT pg_try_advisory_lock(20260420) AS locked');
  if (!lockRows[0].locked) {
    logger.warn('Another pipeline run is already in progress — skipping this run');
    return;
  }

  try {
    await store.rescoreJobsIfRulesChanged(config.intelligence.rules);

    const allCompanies = await getEnabledCompaniesWithDb(pool);
    const lastScraped = await store.getAllCompaniesLastScraped();
    const companies = getDueCompanies(lastScraped, allCompanies);

    if (companies.length === 0) {
      logger.info('No companies due for scraping');
      if (digest) await sendDailyDigest(pool);
      return;
    }

    logger.info(`Processing ${companies.length} companies (concurrency=${CONCURRENCY})`);

    const allChanges = [];

    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      const batch = companies.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(scrapeCompany));
      for (const r of results) {
        if (r.status === 'fulfilled') allChanges.push(...r.value);
      }
    }

    const activeRows = await store.getAllActiveJobs();
    const allActiveJobs = activeRows.map(row => ({
      jobId: row.job_id,
      company: row.company,
      source: row.source,
      title: row.title,
      location: row.location,
      team: row.team,
      department: row.department,
      employmentType: row.employment_type,
      remote: Boolean(row.remote),
      description: row.description,
      applyUrl: row.apply_url,
      jobUrl: row.job_url,
      publishedAt: row.published_at,
      compensationSummary: row.compensation_summary,
      compensationMin: row.compensation_min,
      compensationMax: row.compensation_max,
      compensationCurrency: row.compensation_currency,
      compensationInterval: row.compensation_interval,
    }));

    const { filtered } = intelligence.filterAndRank(allActiveJobs);

    if (config.notify.cli) {
      printRunSummary(allChanges, filtered);
    }

    if (config.notify.markdown && allChanges.length > 0) {
      generateReport(allChanges, filtered);
    }

    // Remove inactive jobs older than 30 days to keep Neon storage under control.
    await store.cleanupOldInactiveJobs(30);

    if (digest) await sendDailyDigest(pool);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Pipeline completed in ${elapsed}s — ${allChanges.length} total changes`);
  } finally {
    await pool.query('SELECT pg_advisory_unlock(20260420)');
  }
}

module.exports = { runPipeline };
