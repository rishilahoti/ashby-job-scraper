const { logger } = require('../utils');
const ashby = require('./adapters/ashby');
const lever = require('./adapters/lever');
const greenhouse = require('./adapters/greenhouse');

const ADAPTERS = { ashby, lever, greenhouse };

function normalizeResponse(apiResponse, company, source = 'ashby') {
  const adapter = ADAPTERS[source];
  if (!adapter) {
    logger.warn(`Unknown source "${source}" for ${company} — skipping`);
    return [];
  }

  if (!apiResponse || !Array.isArray(apiResponse.jobs)) {
    logger.warn(`No jobs array in response for ${company}`);
    return [];
  }

  const jobs = adapter
    .filterRaw(apiResponse.jobs)
    .map(j => adapter.normalizeJob(j, company))
    .filter(Boolean);

  logger.debug(`Normalized ${jobs.length} jobs for ${company} (${source})`);
  return jobs;
}

module.exports = { normalizeResponse };
