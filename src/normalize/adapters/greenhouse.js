const { contentHash } = require('../../utils');
const { sanitizeDescription, decodeHtmlEntities } = require('../shared');

function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const location = raw.location?.name || 'Unknown';
  const remote = /remote/i.test(location);
  const description = sanitizeDescription(decodeHtmlEntities(raw.content));

  const publishedAt = raw.first_published || raw.updated_at
    ? new Date(raw.first_published || raw.updated_at).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'greenhouse',
    title: raw.title || 'Untitled',
    location,
    team: null,
    department: null,
    // Greenhouse's public job board API doesn't expose employment type or department.
    employmentType: null,
    remote,
    description,
    applyUrl: raw.absolute_url || '',
    jobUrl: raw.absolute_url || '',
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    contentHash: contentHash(raw.title, location, description, String(remote)),
  };
}

// Greenhouse's board endpoint only lists open, published jobs already.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
