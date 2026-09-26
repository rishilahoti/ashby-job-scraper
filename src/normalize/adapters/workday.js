const { contentHash } = require('../../utils');
const { normalizeLocation } = require('../shared');

// ponytail: the public /wday/cxs/{tenant}/{site}/jobs list endpoint has no
// description or employment-type field (only title/location/postedOn/remoteType) —
// full text only lives on a per-posting detail endpoint, one extra HTTP request per
// job. Shipping list-only data now, same tradeoff already accepted for SmartRecruiters.
// `_boardUrl` is injected by the fetch layer (not part of Workday's own response) —
// it's the only way to turn `externalPath` into an absolute URL, since Workday embeds
// no host/tenant info in each job.
function normalizeJob(raw, company) {
  // externalPath ("/job/Santa-Clara/Engineer_JR123") has slashes, but jobId
  // must pass /jobs/[jobId] and /api/jobs/*'s ^[a-zA-Z0-9_-]{1,64}$ check.
  // The last segment is a title slug ending in Workday's requisition id, so
  // other characters become "-" and a long title is trimmed from the front.
  const segment = (raw.externalPath || '').split('/').filter(Boolean).pop();
  if (!segment) return null;
  const jobId = segment.replace(/[^\w-]/g, '-').slice(-64);

  const normalizedLocation = normalizeLocation(raw.locationsText, /remote/i.test(raw.remoteType || ''));
  const url = raw._boardUrl ? `${raw._boardUrl}${raw.externalPath}` : null;

  return {
    jobId,
    company,
    source: 'workday',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department: null,
    employmentType: null,
    remote: normalizedLocation.remote,
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
    contentHash: contentHash(
      raw.title,
      normalizedLocation.location,
      raw.remoteType,
      String(normalizedLocation.remote)
    ),
  };
}

// The CXS jobs endpoint only ever lists live/public postings — nothing to filter out.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
