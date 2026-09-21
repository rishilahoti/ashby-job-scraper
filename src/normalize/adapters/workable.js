const { contentHash } = require('../../utils');
const { sanitizeDescription, sanitizeUrl } = require('../shared');

function formatSalary(job) {
  if (job.salary_from == null && job.salary_to == null) return null;
  const currency = job.salary_currency || '';
  const min = job.salary_from != null ? Number(job.salary_from).toLocaleString() : null;
  const max = job.salary_to != null ? Number(job.salary_to).toLocaleString() : null;
  return min && max ? `${currency} ${min}–${max}`.trim() : `${currency} ${min || max}`.trim();
}

function normalizeJob(raw, company) {
  const jobId = raw.shortcode;
  if (!jobId) return null;

  const location = [raw.city, raw.state, raw.country].filter(Boolean).join(', ') || 'Unknown';
  const description = sanitizeDescription(raw.description);
  const remote = Boolean(raw.telecommuting);

  const publishedAt = raw.published_on || raw.created_at
    ? new Date(raw.published_on || raw.created_at).toISOString()
    : new Date().toISOString();

  return {
    jobId,
    company,
    source: 'workable',
    title: raw.title || 'Untitled',
    location,
    team: null,
    department: raw.department || null,
    employmentType: raw.employment_type || null,
    remote,
    description,
    applyUrl: sanitizeUrl(raw.application_url || raw.url),
    jobUrl: sanitizeUrl(raw.url || raw.shortlink),
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary: formatSalary(raw),
    compensationMin: raw.salary_from ?? null,
    compensationMax: raw.salary_to ?? null,
    compensationCurrency: raw.salary_currency ?? null,
    compensationInterval: null,
    contentHash: contentHash(
      raw.title,
      location,
      description,
      raw.employment_type,
      String(remote),
      raw.department
    ),
  };
}

// The public widget endpoint only ever lists live jobs, but `state` shows up on
// some accounts — filter defensively rather than trust that unconditionally.
function filterRaw(rawJobs) {
  return rawJobs.filter(j => !j.state || j.state === 'published');
}

module.exports = { normalizeJob, filterRaw };
