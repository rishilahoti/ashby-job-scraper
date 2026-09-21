const { contentHash } = require('../../utils');
const { sanitizeDescription, sanitizeUrl } = require('../shared');

// Recruitee's `salary` object uses a pay `period` ('month'/'year'/'hour') rather
// than the interval strings the other ATSs use — map it onto the same schema.org
// unitText vocabulary the rest of the pipeline expects.
function normalizeInterval(period) {
  if (!period) return null;
  const p = period.toUpperCase();
  if (p.startsWith('HOUR')) return 'HOUR';
  if (p.startsWith('DAY')) return 'DAY';
  if (p.startsWith('WEEK')) return 'WEEK';
  if (p.startsWith('MONTH')) return 'MONTH';
  if (p.startsWith('YEAR')) return 'YEAR';
  return null;
}

function formatSalary(salary) {
  if (!salary || (salary.min == null && salary.max == null)) return null;
  const currency = salary.currency || '';
  const min = salary.min != null ? Number(salary.min).toLocaleString() : null;
  const max = salary.max != null ? Number(salary.max).toLocaleString() : null;
  const range = min && max ? `${currency} ${min}–${max}`.trim() : `${currency} ${min || max}`.trim();
  return salary.period ? `${range} / ${salary.period}` : range;
}

function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const description = [sanitizeDescription(raw.description), sanitizeDescription(raw.requirements)]
    .filter(Boolean)
    .join('\n\n');
  const remote = Boolean(raw.remote);

  const publishedAt = raw.published_at || raw.created_at
    ? new Date(raw.published_at || raw.created_at).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'recruitee',
    title: raw.title || 'Untitled',
    location: raw.location || 'Unknown',
    team: null,
    department: raw.department || null,
    employmentType: raw.employment_type_code || null,
    remote,
    description,
    applyUrl: sanitizeUrl(raw.careers_apply_url),
    jobUrl: sanitizeUrl(raw.careers_url),
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: formatSalary(raw.salary),
    compensationMin: raw.salary?.min ?? null,
    compensationMax: raw.salary?.max ?? null,
    compensationCurrency: raw.salary?.currency ?? null,
    compensationInterval: normalizeInterval(raw.salary?.period),
    contentHash: contentHash(
      raw.title,
      raw.location,
      description,
      raw.employment_type_code,
      String(remote),
      raw.department
    ),
  };
}

function filterRaw(rawJobs) {
  return rawJobs.filter(j => j.status === 'published');
}

module.exports = { normalizeJob, filterRaw };
