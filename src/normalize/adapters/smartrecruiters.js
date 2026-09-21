const { contentHash } = require('../../utils');

// ponytail: the public /postings list endpoint (unlike Ashby/Lever/Greenhouse's
// single-call boards) has no description field — full text only lives on the
// per-posting detail endpoint, which would mean one extra HTTP request per job.
// Shipping list-only data (no description) now; add a detail fetch per job if
// SmartRecruiters descriptions turn out to matter for scoring/display.
function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const location = raw.location?.fullLocation || 'Unknown';
  const employmentType = raw.typeOfEmployment?.label || null;
  const department = raw.department?.label || null;
  const remote = Boolean(raw.location?.remote);

  const publishedAt = raw.releasedDate
    ? new Date(raw.releasedDate).toISOString()
    : new Date().toISOString();

  const identifier = raw.company?.identifier || company;

  return {
    jobId,
    company,
    source: 'smartrecruiters',
    title: raw.name || 'Untitled',
    location,
    team: null,
    department,
    employmentType,
    remote,
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
    contentHash: contentHash(raw.name, location, employmentType, String(remote), department),
  };
}

function filterRaw(rawJobs) {
  return rawJobs.filter(j => j.visibility === 'PUBLIC');
}

module.exports = { normalizeJob, filterRaw };
