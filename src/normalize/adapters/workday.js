const { contentHash } = require('../../utils');

// ponytail: the public /wday/cxs/{tenant}/{site}/jobs list endpoint has no
// description or employment-type field (only title/location/postedOn/remoteType) —
// full text only lives on a per-posting detail endpoint, one extra HTTP request per
// job. Shipping list-only data now, same tradeoff already accepted for SmartRecruiters.
// `_boardUrl` is injected by the fetch layer (not part of Workday's own response) —
// it's the only way to turn `externalPath` into an absolute URL, since Workday embeds
// no host/tenant info in each job.
function normalizeJob(raw, company) {
  const jobId = raw.externalPath || null;
  if (!jobId) return null;

  const location = raw.locationsText || 'Unknown';
  const remote = /remote/i.test(raw.remoteType || '');
  const url = raw._boardUrl ? `${raw._boardUrl}${raw.externalPath}` : null;

  return {
    jobId,
    company,
    source: 'workday',
    title: raw.title || 'Untitled',
    location,
    team: null,
    department: null,
    employmentType: null,
    remote,
    description: '',
    applyUrl: url,
    jobUrl: url,
    // Workday's list endpoint only gives relative text ("Posted Today") — falls
    // back to scrape time, same as every other adapter does when a source omits
    // a real posted-date field.
    publishedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.title, location, raw.remoteType, String(remote)),
  };
}

// The CXS jobs endpoint only ever lists live/public postings — nothing to filter out.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
