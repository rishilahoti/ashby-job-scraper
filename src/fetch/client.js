const config = require('../config');
const { logger, delay } = require('../utils');

const DEFAULT_HEADERS = {
  'User-Agent': config.fetch.userAgent,
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

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
// buildUrl() normalizes the request; extractJobs() normalizes the response
// down to a plain array so the rest of the pipeline never has to branch on source.
const SOURCE_REQUESTS = {
  ashby: {
    buildUrl: (slug) => {
      const url = new URL(`${config.fetch.sources.ashby.baseUrl}/${slug}`);
      if (config.fetch.includeCompensation) url.searchParams.set('includeCompensation', 'true');
      return url;
    },
    extractJobs: (data) => (Array.isArray(data?.jobs) ? data.jobs : null),
  },
  lever: {
    buildUrl: (slug) => {
      const url = new URL(`${config.fetch.sources.lever.baseUrl}/${slug}`);
      url.searchParams.set('mode', 'json');
      return url;
    },
    extractJobs: (data) => (Array.isArray(data) ? data : null),
  },
  greenhouse: {
    buildUrl: (slug) => {
      const url = new URL(`${config.fetch.sources.greenhouse.baseUrl}/${slug}/jobs`);
      url.searchParams.set('content', 'true');
      return url;
    },
    extractJobs: (data) => (Array.isArray(data?.jobs) ? data.jobs : null),
  },
};

async function fetchJobBoard(slug, source = 'ashby') {
  const sourceConfig = SOURCE_REQUESTS[source];
  if (!sourceConfig) {
    throw new FetchError(`Unknown source "${source}" for ${slug}`, slug, null, false);
  }

  const url = sourceConfig.buildUrl(slug);

  let lastError;

  for (let attempt = 1; attempt <= config.fetch.maxRetries; attempt++) {
    try {
      logger.debug(`Fetching ${slug} (${source}, attempt ${attempt}/${config.fetch.maxRetries})`);
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        throw new FetchError(
          `Fetch failed for ${slug} (${source}): HTTP ${response.status}`,
          slug, response.status, retryable
        );
      }

      const data = await response.json();
      const jobs = sourceConfig.extractJobs(data);
      if (jobs === null) {
        throw new FetchError(
          `Invalid response structure for ${slug} (${source})`,
          slug, response.status, false
        );
      }

      logger.info(`Fetched ${jobs.length} jobs from ${slug} (${source})`);
      return { jobs };
    } catch (err) {
      // Network failures, timeouts, and bad JSON aren't FetchErrors — treat
      // them as retryable, same as the old "no status code" axios case.
      const fetchErr = err instanceof FetchError
        ? err
        : new FetchError(`Fetch failed for ${slug} (${source}): ${err.message}`, slug, null, true);

      if (!fetchErr.retryable) {
        logger.error(`Non-retryable error for ${slug} (${source}, HTTP ${fetchErr.statusCode})`);
        throw fetchErr;
      }

      lastError = fetchErr;

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
