const { contentHash } = require('../../utils');
const { sanitizeUrl, normalizeLocation, decodeHtmlEntities, jobPostingDescription } = require('../shared');

// Y Combinator's own job board (Work at a Startup). The slug is the company's
// YC directory slug: ycombinator.com/companies/{slug}/jobs.
const YC = 'https://www.ycombinator.com';

// The page is an Inertia app: its props, job list included, sit HTML-escaped
// in a data-page attribute. (Asking for the JSON with X-Inertia gets a 409
// unless the client sends the site's current asset version.)
function jobsFromPage(html) {
  const attr = /data-page="([^"]*)"/.exec(html)?.[1];
  if (!attr) return null;
  try {
    const jobs = JSON.parse(decodeHtmlEntities(attr))?.props?.jobPostings;
    return Array.isArray(jobs) ? jobs : null;
  } catch {
    return null;
  }
}

// createdAt is relative ("13 days", "about 1 month"); the exact date is only
// on the job's own page. Close enough for sorting, and it is stored once:
// unchanged jobs aren't rewritten. Hours and minutes count as today.
const UNIT_DAYS = { day: 1, month: 30, year: 365 };
function postedAt(ago) {
  const match = /(\d+)\s+(day|month|year)/.exec(ago || '');
  const days = match ? Number(match[1]) * UNIT_DAYS[match[2]] : 0;
  return new Date(Date.now() - days * 86400000).toISOString();
}

function normalizeJob(raw, company) {
  if (raw.id == null) return null;

  // "San Francisco, CA, US / Remote (US)"
  const normalizedLocation = normalizeLocation(raw.location);
  const department = raw.prettyRole || null;
  const employmentType = raw.type || null;
  // applyUrl is a YC sign-in link; the job page has the apply button.
  const jobUrl = sanitizeUrl(raw.url ? `${YC}${raw.url}` : '');

  return {
    // Prefixed: YC's ids are small numbers that other boards' ids could equal.
    jobId: `yc-${raw.id}`,
    company,
    source: 'yc',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    locationRaw: normalizedLocation.raw,
    team: null,
    department,
    employmentType,
    remote: normalizedLocation.remote,
    description: null,
    applyUrl: jobUrl,
    jobUrl,
    publishedAt: postedAt(raw.createdAt),
    scrapedAt: new Date().toISOString(),
    // Free text ("$150K - $200K", "0.10% - 0.50%").
    compensationSummary: [raw.salaryRange, raw.equityRange].filter(Boolean).join(' • ') || null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.title, normalizedLocation.location, String(normalizedLocation.remote), department, employmentType),
  };
}

// The list has no descriptions; each job page's JSON-LD does.
module.exports = { normalizeJob, fetchDescription: (job) => jobPostingDescription(job.jobUrl), jobsFromPage };
