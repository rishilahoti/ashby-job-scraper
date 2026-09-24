const { contentHash } = require('../../utils');
const { sanitizeDescription, sanitizeUrl, normalizeLocation } = require('../shared');

function formatLocation(jobLocation) {
  const place = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  const addr = place?.address;
  if (!addr) return 'Unknown';
  return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ') || 'Unknown';
}

// Teamtailor's public feed is a generic JSON Feed (jsonfeed.org) with ATS-specific
// data tucked into the `_jobposting` schema.org extension — no ATS-specific fields
// live on the top-level item itself.
function normalizeJob(raw, company) {
  const jobId = raw.id;
  if (!jobId) return null;

  const jp = raw._jobposting || {};
  const normalizedLocation = normalizeLocation(formatLocation(jp.jobLocation), /remote/i.test(raw.title || ''));
  const description = sanitizeDescription(raw.content_html || jp.description);
  // No remote flag in the feed — infer the same way the Greenhouse adapter does.

  const publishedAt = jp.datePosted || raw.date_published
    ? new Date(jp.datePosted || raw.date_published).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'teamtailor',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department: null,
    employmentType: jp.employmentType || null,
    remote: normalizedLocation.remote,
    description,
    applyUrl: sanitizeUrl(raw.url),
    jobUrl: sanitizeUrl(raw.url),
    publishedAt,
    scrapedAt: new Date().toISOString(),
    // schema.org baseSalary is rarely populated in practice — leave unset rather
    // than guess at its (inconsistently used) sub-shape across Teamtailor tenants.
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(raw.title, normalizedLocation.location, description, String(normalizedLocation.remote)),
  };
}

// jobs.json only ever lists currently live postings.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
