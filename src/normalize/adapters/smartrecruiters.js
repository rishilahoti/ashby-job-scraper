const { contentHash } = require('../../utils');
const { normalizeLocation } = require('../shared');

// ponytail: the public /postings list endpoint (unlike Ashby/Lever/Greenhouse's
// single-call boards) has no description field — full text only lives on the
// per-posting detail endpoint, which would mean one extra HTTP request per job.
// Shipping list-only data (no description) now; add a detail fetch per job if
// SmartRecruiters descriptions turn out to matter for scoring/display.
function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const normalizedLocation = normalizeLocation(raw.location?.fullLocation, raw.location?.remote);
  const employmentType = raw.typeOfEmployment?.label || null;
  const department = raw.department?.label || null;

  const publishedAt = raw.releasedDate
    ? new Date(raw.releasedDate).toISOString()
    : new Date().toISOString();

  const identifier = raw.company?.identifier || company;

  return {
    jobId,
    company,
    source: 'smartrecruiters',
    title: raw.name || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department,
    employmentType,
    remote: normalizedLocation.remote,
    description: '',
    applyUrl: `https://jobs.smartrecruiters.com/${identifier}/${jobId}`,
    jobUrl: `https://jobs.smartrecruiters.com/${identifier}/${jobId}`,
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.name, normalizedLocation.location, employmentType, String(normalizedLocation.remote), department),
  };
}

function filterRaw(rawJobs) {
  return rawJobs.filter(j => j.visibility === 'PUBLIC');
}

module.exports = { normalizeJob, filterRaw };
