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
  workable: {
    buildUrl: (slug) => {
      const url = new URL(`${config.fetch.sources.workable.baseUrl}/${slug}`);
      url.searchParams.set('details', 'true');
      return url;
    },
    extractJobs: (data) => (Array.isArray(data?.jobs) ? data.jobs : null),
  },
  recruitee: {
    buildUrl: (slug) => new URL(`https://${slug}.recruitee.com/api/offers/`),
    extractJobs: (data) => (Array.isArray(data?.offers) ? data.offers : null),
  },
  teamtailor: {
    buildUrl: (slug) => new URL(`https://${slug}.teamtailor.com/jobs.json`),
    extractJobs: (data) => (Array.isArray(data?.items) ? data.items : null),
  },
  pinpoint: {
    buildUrl: (slug) => new URL(`https://${slug}.pinpointhq.com/postings.json`),
    extractJobs: (data) => (Array.isArray(data?.data) ? data.data : null),
  },
  smartrecruiters: {
    // Capped at 100 postings (SmartRecruiters' own max `limit`) — fine for the
    // vast majority of boards; only a handful of very large multi-location
    // employers exceed it. Add offset-based pagination if that becomes a problem.
    buildUrl: (slug) => {
      const url = new URL(`${config.fetch.sources.smartrecruiters.baseUrl}/${slug}/postings`);
      url.searchParams.set('limit', '100');
      return url;
    },
    extractJobs: (data) => (Array.isArray(data?.content) ? data.content : null),
  },
};

// One request/response cycle with the existing retry+backoff policy. Shared by
// the single-page sources and Workday's paginated loop below.
async function fetchOnce(url, options, slug, source, extractJobs) {
  let lastError;

  for (let attempt = 1; attempt <= config.fetch.maxRetries; attempt++) {
    try {
      logger.debug(`Fetching ${slug} (${source}, attempt ${attempt}/${config.fetch.maxRetries})`);
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(30000),
        ...options,
      });

      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        throw new FetchError(
          `Fetch failed for ${slug} (${source}): HTTP ${response.status}`,
          slug, response.status, retryable
        );
      }

      const data = await response.json();
      const jobs = extractJobs(data);
      if (jobs === null) {
        throw new FetchError(
          `Invalid response structure for ${slug} (${source})`,
          slug, response.status, false
        );
      }

      return jobs;
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

const WORKDAY_PAGE_SIZE = 20; // API-enforced max per page (HTTP 400 above it)
// ponytail: caps every Workday board at 200 jobs (10 requests) per scrape so one
// mega-employer (NVIDIA-scale boards run 2000+) can't blow up the VM's per-cycle
// request budget. Raise the page cap if smaller/typical boards ever need more.
const WORKDAY_MAX_PAGES = 10;

async function fetchWorkdayJobBoard(slug, source) {
  const [tenant, wdHost, site] = slug.split('/');
  if (!tenant || !wdHost || !site) {
    throw new FetchError(`Malformed workday slug "${slug}" (expected tenant/wdHost/site)`, slug, null, false);
  }

  const boardUrl = `https://${tenant}.${wdHost}.myworkdayjobs.com/${site}`;
  const apiUrl = new URL(`https://${tenant}.${wdHost}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`);

  // ponytail: Workday's `total` field is unreliable across stateless requests
  // (observed dropping to 0 on the 2nd+ page without a session cookie) — a
  // short page (fewer than WORKDAY_PAGE_SIZE results) is the only trustworthy
  // "no more pages" signal, backstopped by WORKDAY_MAX_PAGES either way.
  const jobs = [];
  for (let page = 0; page < WORKDAY_MAX_PAGES; page++) {
    const body = JSON.stringify({ appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset: page * WORKDAY_PAGE_SIZE, searchText: '' });
    const pageJobs = await fetchOnce(
      apiUrl,
      { method: 'POST', headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/json' }, body },
      slug, source,
      (data) => (Array.isArray(data?.jobPostings) ? data.jobPostings : null)
    );
    // Each posting only carries a relative externalPath — bake in the board's
    // base URL here so the adapter can build an absolute apply/job URL.
    for (const job of pageJobs) jobs.push({ ...job, _boardUrl: boardUrl });
    if (pageJobs.length < WORKDAY_PAGE_SIZE) break;
  }

  logger.info(`Fetched ${jobs.length} jobs from ${slug} (${source})`);
  return { jobs };
}

async function fetchJobBoard(slug, source = 'ashby') {
  if (source === 'workday') return fetchWorkdayJobBoard(slug, source);

  const sourceConfig = SOURCE_REQUESTS[source];
  if (!sourceConfig) {
    throw new FetchError(`Unknown source "${source}" for ${slug}`, slug, null, false);
  }

  const url = sourceConfig.buildUrl(slug);
  const jobs = await fetchOnce(url, {}, slug, source, sourceConfig.extractJobs);
  logger.info(`Fetched ${jobs.length} jobs from ${slug} (${source})`);
  return { jobs };
}

module.exports = { fetchJobBoard, FetchError };
