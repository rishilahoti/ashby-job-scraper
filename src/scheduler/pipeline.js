const config = require('../config');
const { logger } = require('../utils');
const { getEnabledCompaniesWithDb, getDueCompanies } = require('../sources');
const { fetchJobBoard, FetchError } = require('../fetch');
const { normalizeResponse } = require('../normalize');
const store = require('../store');
const { detectChanges } = require('../diff');
const intelligence = require('../intelligence');
const { printRunSummary, generateReport } = require('../notify');

const CONCURRENCY = 8;

async function scrapeCompany(company) {
  const runId = await store.startScrapeRun(company.company);
  try {
    await store.upsertCompany(company.company, company.ashbySlug);

    const rawData = await fetchJobBoard(company.ashbySlug);
    const normalizedJobs = normalizeResponse(rawData, company.company);
    const changes = await detectChanges(normalizedJobs, company.company);

    const inserted = changes.filter(c => c.type === 'JOB_NEW').length;
    const updated  = changes.filter(c => c.type === 'JOB_UPDATED').length;
    const removed  = changes.filter(c => c.type === 'JOB_REMOVED').length;

    await store.updateLastScraped(company.ashbySlug);
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

async function runPipeline() {
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
    const allCompanies = await getEnabledCompaniesWithDb(pool);
    const lastScraped = await store.getAllCompaniesLastScraped();
    const companies = getDueCompanies(lastScraped, allCompanies);

    if (companies.length === 0) {
      logger.info('No companies due for scraping');
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Pipeline completed in ${elapsed}s — ${allChanges.length} total changes`);
  } finally {
    await pool.query('SELECT pg_advisory_unlock(20260420)');
  }
}

module.exports = { runPipeline };
