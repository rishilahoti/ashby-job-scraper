const { contentHash } = require('../../utils');
const { sanitizeDescription, decodeHtmlEntities, sanitizeUrl, normalizeLocation } = require('../shared');

function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const normalizedLocation = normalizeLocation(raw.location?.name);
  const description = sanitizeDescription(decodeHtmlEntities(raw.content));

  const publishedAt = raw.first_published || raw.updated_at
    ? new Date(raw.first_published || raw.updated_at).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'greenhouse',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department: null,
    // Greenhouse's public job board API doesn't expose employment type or department.
    employmentType: null,
    remote: normalizedLocation.remote,
    description,
    applyUrl: sanitizeUrl(raw.absolute_url),
    jobUrl: sanitizeUrl(raw.absolute_url),
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.title, normalizedLocation.location, description, String(normalizedLocation.remote)),
  };
}

// Greenhouse's board endpoint only lists open, published jobs already.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
