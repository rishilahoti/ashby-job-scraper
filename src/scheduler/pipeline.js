const config = require('../config');
const { logger } = require('../utils');
const { getEnabledCompaniesWithDb, getDueCompanies } = require('../sources');
const { fetchJobBoard, FetchError } = require('../fetch');
const { normalizeResponse } = require('../normalize');
const store = require('../store');
const { detectChanges } = require('../diff');
const intelligence = require('../intelligence');
const { printRunSummary, generateReport } = require('../notify');
const { runDigest, lastDigestAt } = require('../digest');

const CONCURRENCY = 16;
// Workday answered ~640 HTTP 429s a night at full concurrency (2026-11), and a
// rate-limited board's jobs never update. Its boards get their own slow lane
// so the other 15+ sources keep going at full speed beside it.
const WORKDAY_CONCURRENCY = 3;
// A job unseen this many daily runs is hidden (see deactivateUnseenJobs).
const UNSEEN_DAYS = 3;

// Runs fn over items with `limit` of them in flight at once. Unlike fixed
// batches, one slow board doesn't hold up the next 15. A rejected item is
// logged and skipped, so the pool only returns (and runPipeline only releases
// its lock) once every worker is done.
async function runPool(items, limit, fn) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        results.push(...await fn(item));
      } catch (err) {
        logger.error(`Pipeline error for ${item.company}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function scrapeCompany(company) {
  const source = company.source || 'ashby';
  const runId = await store.startScrapeRun(company.company);
  try {
    await store.upsertCompany(company.company, company.slug, source);

    const rawData = await fetchJobBoard(company.slug, source);
    const normalizedJobs = normalizeResponse(rawData, company.company, source);
    const changes = await detectChanges(normalizedJobs, company.company, source);

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

// Everything since the last digest (runDigest keeps track), not just this
// run: a container restart (every merge to main) can do the day's scrape
// hours before the nightly run, which then finds nothing due.
// One per UTC day, sent by the day's first run to finish. That's normally the
// nightly one; a restart run sends it only when the nightly run didn't (it
// crashed, or hung like on 2026-10-09), so a missed day heals on its own.
async function sendDailyDigest(pool) {
  // Best effort: an email problem must never fail the scrape.
  try {
    const last = await lastDigestAt(pool);
    const today = new Date().toISOString().slice(0, 10);
    if (last && last.toISOString().slice(0, 10) === today) return;
    await runDigest(pool);
  } catch (err) {
    logger.error(`Daily digest failed: ${err.message}`);
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
    // Best effort, like the digest: a failed pass must not cost the scrape.
    // The rules version is saved only after a full pass, so the next run retries.
    try {
      await store.rescoreJobsIfRulesChanged(config.intelligence.rules);
    } catch (err) {
      logger.error(`Re-scoring jobs for the current rules failed: ${err.message}`);
    }

    const allCompanies = await getEnabledCompaniesWithDb(pool);
    const lastScraped = await store.getAllCompaniesLastScraped();
    const companies = getDueCompanies(lastScraped, allCompanies);

    if (companies.length === 0) {
      logger.info('No companies due for scraping');
      return;
    }

    logger.info(`Processing ${companies.length} companies (concurrency=${CONCURRENCY})`);

    const isWorkday = (c) => c.source === 'workday';
    const lanes = await Promise.all([
      runPool(companies.filter(c => !isWorkday(c)), CONCURRENCY, scrapeCompany),
      runPool(companies.filter(isWorkday), WORKDAY_CONCURRENCY, scrapeCompany),
    ]);
    const allChanges = lanes.flat();

    // Best effort: hiding stale jobs must not cost the summary or the digest.
    try {
      await store.deactivateUnseenJobs(UNSEEN_DAYS);
    } catch (err) {
      logger.error(`Deactivating unseen jobs failed: ${err.message}`);
    }

    // Best effort, like the re-scoring pass and the digest: this summary loads
    // every active job, and when that query timed out (2026-10-07, while
    // autovacuum was busy on jobs) the error also cost the cleanup and the digest.
    try {
      const allActiveJobs = await store.getAllActiveJobs();
      const { filtered } = intelligence.filterAndRank(allActiveJobs);

      if (config.notify.cli) {
        printRunSummary(allChanges, filtered);
      }

      if (config.notify.markdown && allChanges.length > 0) {
        generateReport(allChanges, filtered);
      }
    } catch (err) {
      logger.error(`Run summary failed: ${err.message}`);
    }

    // Remove inactive jobs older than 30 days to keep Neon storage under control.
    await store.cleanupOldInactiveJobs(30);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Pipeline completed in ${elapsed}s — ${allChanges.length} total changes`);
  } finally {
    // Here so that nothing failing above (the cleanup, say) costs the digest.
    await sendDailyDigest(pool);
    await pool.query('SELECT pg_advisory_unlock(20260420)');
  }
}

module.exports = { runPipeline };
