const { contentHash } = require('../../utils');
const { sanitizeUrl, sanitizeDescription, normalizeLocation, fetchText } = require('../shared');

// Rippling's public board list has no description or posted date; each job
// only has its own detail endpoint for those (one request per job, so the diff
// calls fetchDescription for new jobs only).
function normalizeJob(raw, company) {
  const jobId = raw.uuid ? String(raw.uuid) : null;
  if (!jobId) return null;

  const normalizedLocation = normalizeLocation(raw.workLocation?.label);
  const department = raw.department?.label || null;

  return {
    jobId,
    company,
    source: 'rippling',
    title: raw.name || 'Untitled',
    location: normalizedLocation.location,
    locationRaw: normalizedLocation.raw,
    team: null,
    department,
    employmentType: null,
    remote: normalizedLocation.remote,
    description: null,
    applyUrl: sanitizeUrl(raw.url),
    jobUrl: sanitizeUrl(raw.url),
    publishedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.name, normalizedLocation.location, String(normalizedLocation.remote), department),
  };
}

// The list repeats a job once per location. ponytail: keeps the first
// location only; join the labels if multi-location jobs need all of them.
function filterRaw(rawJobs) {
  const seen = new Set();
  return rawJobs.filter(j => j?.uuid && !seen.has(j.uuid) && seen.add(j.uuid));
}

// ats.rippling.com/{board}/jobs/{uuid} -> api.rippling.com/.../board/{board}/jobs/{uuid}
async function fetchDescription(job) {
  const path = new URL(job.jobUrl).pathname.replace(/^\/[a-z]{2}-[A-Z]{2}\//, '/');
  const detail = JSON.parse(await fetchText(`https://api.rippling.com/platform/api/ats/v1/board${path}`));
  return sanitizeDescription(`${detail.description?.company ?? ''} ${detail.description?.role ?? ''}`) || null;
}

module.exports = { normalizeJob, filterRaw, fetchDescription };
