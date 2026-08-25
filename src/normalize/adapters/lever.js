const { contentHash } = require('../../utils');
const { normalizeSalaryInterval } = require('../shared');

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
  const remote = raw.workplaceType === 'remote';

  const publishedAt = raw.createdAt
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'lever',
    title: raw.text || 'Untitled',
    location: categories.location || raw.country || 'Unknown',
    team: categories.team || null,
    department: categories.department || null,
    employmentType: categories.commitment || null,
    remote,
    description,
    applyUrl: raw.applyUrl || raw.hostedUrl || '',
    jobUrl: raw.hostedUrl || raw.applyUrl || '',
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: formatSalaryRange(raw.salaryRange),
    compensationMin: raw.salaryRange?.min ?? null,
    compensationMax: raw.salaryRange?.max ?? null,
    compensationCurrency: raw.salaryRange?.currency ?? null,
    compensationInterval: normalizeSalaryInterval(raw.salaryRange?.interval),
    contentHash: contentHash(
      raw.text,
      categories.location,
      description,
      categories.commitment,
      String(remote),
      categories.team,
      categories.department
    ),
  };
}

// Lever's postings endpoint already only returns published, listed postings.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
