const axios = require('axios');
const config = require('../config');
const { logger, delay } = require('../utils');

const httpClient = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': config.fetch.userAgent,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
  },
});

class FetchError extends Error {
  constructor(message, slug, statusCode, retryable) {
    super(message);
    this.name = 'FetchError';
    this.slug = slug;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

// Each ATS has a different URL shape, query params, and response envelope
// (Ashby/Greenhouse wrap jobs in `{ jobs: [...] }`, Lever returns a bare array).
// buildRequest() normalizes the request; extractJobs() normalizes the response
// down to a plain array so the rest of the pipeline never has to branch on source.
const SOURCE_REQUESTS = {
  ashby: {
    buildRequest: (slug) => ({
      url: `${config.fetch.sources.ashby.baseUrl}/${slug}`,
      params: config.fetch.includeCompensation ? { includeCompensation: true } : {},
    }),
    extractJobs: (data) => (Array.isArray(data?.jobs) ? data.jobs : null),
  },
  lever: {
    buildRequest: (slug) => ({
      url: `${config.fetch.sources.lever.baseUrl}/${slug}`,
      params: { mode: 'json' },
    }),
    extractJobs: (data) => (Array.isArray(data) ? data : null),
  },
  greenhouse: {
    buildRequest: (slug) => ({
      url: `${config.fetch.sources.greenhouse.baseUrl}/${slug}/jobs`,
      params: { content: true },
    }),
    extractJobs: (data) => (Array.isArray(data?.jobs) ? data.jobs : null),
  },
};

async function fetchJobBoard(slug, source = 'ashby') {
  const sourceConfig = SOURCE_REQUESTS[source];
  if (!sourceConfig) {
    throw new FetchError(`Unknown source "${source}" for ${slug}`, slug, null, false);
  }

  const { url, params } = sourceConfig.buildRequest(slug);

  let lastError;

  for (let attempt = 1; attempt <= config.fetch.maxRetries; attempt++) {
    try {
      logger.debug(`Fetching ${slug} (${source}, attempt ${attempt}/${config.fetch.maxRetries})`);
      const response = await httpClient.get(url, { params });

      const jobs = sourceConfig.extractJobs(response.data);
      if (jobs === null) {
        throw new FetchError(
          `Invalid response structure for ${slug} (${source})`,
          slug, response.status, false
        );
      }

      logger.info(`Fetched ${jobs.length} jobs from ${slug} (${source})`);
      return { jobs };
    } catch (err) {
      if (err instanceof FetchError && !err.retryable) throw err;

      const status = err.response?.status;
      const retryable = !status || status >= 500 || status === 429;

      lastError = new FetchError(
        `Fetch failed for ${slug} (${source}): ${err.message}`,
        slug, status, retryable
      );

      if (!retryable) {
        logger.error(`Non-retryable error for ${slug} (${source}, HTTP ${status})`);
        throw lastError;
      }

      if (attempt < config.fetch.maxRetries) {
        const backoff = config.fetch.retryBaseMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * backoff * 0.5;
        const waitMs = backoff + jitter;
        logger.warn(`Retrying ${slug} (${source}) in ${Math.round(waitMs)}ms (attempt ${attempt}/${config.fetch.maxRetries})`);
        await delay(waitMs);
      }
    }
  }

  throw lastError;
}

module.exports = { fetchJobBoard, FetchError };
