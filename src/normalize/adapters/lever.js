const { contentHash } = require('../../utils');
const { normalizeSalaryInterval, sanitizeUrl, normalizeLocation } = require('../shared');

function formatSalaryRange(salaryRange) {
  if (!salaryRange || (salaryRange.min == null && salaryRange.max == null)) return null;
  const currency = salaryRange.currency || '';
  const min = salaryRange.min != null ? salaryRange.min.toLocaleString() : null;
  const max = salaryRange.max != null ? salaryRange.max.toLocaleString() : null;
  if (min && max) return `${currency} ${min}–${max}`.trim();
  return `${currency} ${min || max}`.trim();
}

function normalizeJob(raw, company) {
  const jobId = raw.id;
  if (!jobId) return null;

  const categories = raw.categories || {};
  const description = raw.descriptionPlain || '';
  const normalizedLocation = normalizeLocation(
    categories.location || raw.country,
    raw.workplaceType === 'remote'
  );

  const publishedAt = raw.createdAt
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'lever',
    title: raw.text || 'Untitled',
    location: normalizedLocation.location,
    // Every location for the place filter, the first one shown.
    locationRaw: categories.allLocations?.length ? categories.allLocations.join('; ') : normalizedLocation.raw,
    team: categories.team || null,
    department: categories.department || null,
    employmentType: categories.commitment || null,
    remote: normalizedLocation.remote,
    description,
    applyUrl: sanitizeUrl(raw.applyUrl || raw.hostedUrl),
    jobUrl: sanitizeUrl(raw.hostedUrl || raw.applyUrl),
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: formatSalaryRange(raw.salaryRange),
    compensationMin: raw.salaryRange?.min ?? null,
    compensationMax: raw.salaryRange?.max ?? null,
    compensationCurrency: raw.salaryRange?.currency ?? null,
    compensationInterval: normalizeSalaryInterval(raw.salaryRange?.interval),
    contentHash: contentHash(
      raw.text,
      normalizedLocation.location,
      description,
      categories.commitment,
      String(normalizedLocation.remote),
      categories.team,
      categories.department
    ),
  };
}

// No filterRaw: Lever's postings endpoint already only returns published, listed postings.
module.exports = { normalizeJob };
