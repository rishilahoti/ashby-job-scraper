const config = require('../config');
const { logger, jitteredDelay } = require('../utils');
const { getEnabledCompaniesWithDb, getDueCompanies } = require('../sources');
const { fetchJobBoard, FetchError } = require('../fetch');
const { normalizeResponse } = require('../normalize');
const store = require('../store');
const { detectChanges } = require('../diff');
const intelligence = require('../intelligence');
const { printRunSummary, generateReport } = require('../notify');

async function runPipeline() {
  const startTime = Date.now();
  logger.info('Pipeline run started');

  await store.initDb();

  const pool = store.getPool();
  const allCompanies = await getEnabledCompaniesWithDb(pool);
  const lastScraped = await store.getAllCompaniesLastScraped();
  const companies = getDueCompanies(lastScraped, allCompanies);

  if (companies.length === 0) {
    logger.info('No companies due for scraping');
    return;
  }

  logger.info(`Processing ${companies.length} companies`);

  const allChanges = [];
  const allNewJobs = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    try {
      await store.upsertCompany(company.company, company.ashbySlug);

      const rawData = await fetchJobBoard(company.ashbySlug);
      const normalizedJobs = normalizeResponse(rawData, company.company);

      const changes = await detectChanges(normalizedJobs, company.company);
      allChanges.push(...changes);

      const newJobs = changes
        .filter(c => c.type === 'JOB_NEW')
        .map(c => c.job);
      allNewJobs.push(...newJobs);

      await store.updateLastScraped(company.ashbySlug);

      logger.info(`Completed ${company.company}: ${normalizedJobs.length} jobs, ${changes.length} changes`);
    } catch (err) {
      if (err instanceof FetchError) {
        logger.error(`Fetch error for ${company.company}: ${err.message}`);
      } else {
        logger.error(`Pipeline error for ${company.company}: ${err.message}`);
      }
    }

    if (i < companies.length - 1) {
      await jitteredDelay(
        config.fetch.delayBetweenCompaniesMin,
        config.fetch.delayBetweenCompaniesMax
      );
    }
  }

  const activeRows = await store.getAllActiveJobs();
  // description_html is intentionally excluded from getAllActiveJobs to reduce
  // data transfer \u2014 it's not used for filtering or reporting.
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`Pipeline completed in ${elapsed}s — ${allChanges.length} total changes`);
}

module.exports = { runPipeline };
