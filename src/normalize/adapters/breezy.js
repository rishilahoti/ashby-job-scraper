const { contentHash } = require('../../utils');
const { sanitizeUrl, sanitizeDescription, normalizeLocation, fetchText } = require('../shared');

// {slug}.breezy.hr/json lists every published position, without descriptions:
// those live on each position's own page (see fetchDescription).
function normalizeJob(raw, company) {
  const jobId = raw.id ? String(raw.id) : null;
  if (!jobId) return null;

  const normalizedLocation = normalizeLocation(raw.location?.name, raw.location?.is_remote);
  const department = typeof raw.department === 'string' ? raw.department : null;
  const employmentType = raw.type?.name || null;

  return {
    jobId,
    company,
    source: 'breezy',
    title: raw.name || 'Untitled',
    location: normalizedLocation.location,
    locationRaw: normalizedLocation.raw,
    team: null,
    department,
    employmentType,
    remote: normalizedLocation.remote,
    description: null,
    applyUrl: sanitizeUrl(raw.url),
    jobUrl: sanitizeUrl(raw.url),
    publishedAt: raw.published_date ? new Date(raw.published_date).toISOString() : new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    // Free text ("$50k - $60k / year"); no structured min/max to parse reliably.
    compensationSummary: raw.salary || null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    // No pay in the hash, as in the other adapters.
    contentHash: contentHash(raw.name, normalizedLocation.location, String(normalizedLocation.remote), department, employmentType),
  };
}

// ponytail: reads the position page's description <div>; breaks if Breezy
// changes that markup, which then only costs descriptions (jobs still list).
async function fetchDescription(job) {
  const html = await fetchText(job.jobUrl);
  const match = html.match(/<div class="description">([\s\S]*?)<\/div><div class="apply-container">/);
  return match ? sanitizeDescription(match[1]) || null : null;
}

// No filterRaw: the JSON feed only lists published positions.
module.exports = { normalizeJob, fetchDescription };
