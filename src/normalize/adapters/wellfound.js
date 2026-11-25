const { contentHash } = require('../../utils');
const { sanitizeUrl, sanitizeDescription, normalizeLocation, fetchText, jobPostingFromHtml } = require('../shared');

// Wellfound (formerly AngelList Talent). The slug is the startup's:
// wellfound.com/company/{slug}/jobs.

// The page is server-rendered Next.js with its Apollo cache in __NEXT_DATA__.
// The startup's job connections list its jobs; the cache can hold other
// listings too, so only theirs are read. ponytail: the page renders the first
// 20 jobs only; boards past that need Wellfound's GraphQL API, which sits
// behind a bot check.
function jobsFromPage(html) {
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) return null;
  let cache;
  try {
    cache = JSON.parse(json)?.props?.pageProps?.apolloState?.data;
  } catch {
    return null;
  }
  const startup = cache && Object.entries(cache).find(([key]) => key.startsWith('Startup:'))?.[1];
  if (!startup) return null;
  const refs = new Set(
    Object.entries(startup)
      .filter(([key]) => key.startsWith('jobListingsConnection'))
      .flatMap(([, connection]) => connection?.edges ?? [])
      .map((edge) => edge?.node?.__ref)
  );
  return [...refs].map((ref) => cache[ref]).filter(Boolean);
}

const EMPLOYMENT_TYPES = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship', cofounder: 'Cofounder' };

function normalizeJob(raw, company) {
  if (!raw.id) return null;

  // ponytail: first location only, like the other adapters.
  const normalizedLocation = normalizeLocation(raw.locationNames?.[0], raw.remote === true);
  const department = raw.primaryRoleTitle || null;
  const employmentType = EMPLOYMENT_TYPES[raw.jobType] || null;
  const jobUrl = sanitizeUrl(`https://wellfound.com/jobs/${raw.id}-${raw.slug || ''}`);

  return {
    // Prefixed: Wellfound's ids are small numbers that other boards' ids could equal.
    jobId: `wellfound-${raw.id}`,
    company,
    source: 'wellfound',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department,
    employmentType,
    remote: normalizedLocation.remote,
    // The list only has a snippet; fetchDescription reads the whole text.
    description: null,
    applyUrl: jobUrl,
    jobUrl,
    publishedAt: raw.liveStartAt ? new Date(raw.liveStartAt * 1000).toISOString() : new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    // Free text ("$40k – $100k • 0.05% – 0.1%").
    compensationSummary: raw.compensation || null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.title, normalizedLocation.location, String(normalizedLocation.remote), department, employmentType),
  };
}

async function fetchDescription(job) {
  return sanitizeDescription(jobPostingFromHtml(await fetchText(job.jobUrl))?.description) || null;
}

module.exports = { normalizeJob, fetchDescription, jobsFromPage };
