const { contentHash } = require('../../utils');
const { sanitizeDescription, sanitizeUrl } = require('../shared');

function formatCompensation(raw) {
  if (raw.compensation_minimum == null && raw.compensation_maximum == null) return null;
  const currency = raw.compensation_currency || '';
  const min = raw.compensation_minimum != null ? Number(raw.compensation_minimum).toLocaleString() : null;
  const max = raw.compensation_maximum != null ? Number(raw.compensation_maximum).toLocaleString() : null;
  const range = min && max ? `${currency} ${min}–${max}`.trim() : `${currency} ${min || max}`.trim();
  return raw.compensation_frequency ? `${range} / ${raw.compensation_frequency}` : range;
}

function normalizeInterval(frequency) {
  if (!frequency) return null;
  const f = frequency.toUpperCase();
  if (f.includes('HOUR')) return 'HOUR';
  if (f.includes('DAY')) return 'DAY';
  if (f.includes('WEEK')) return 'WEEK';
  if (f.includes('MONTH')) return 'MONTH';
  if (f.includes('YEAR') || f.includes('ANNUAL')) return 'YEAR';
  return null;
}

function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  const location = raw.location?.name || raw.location?.city || 'Unknown';
  const description = sanitizeDescription(raw.description);
  // No explicit remote boolean — Pinpoint expresses it via workplace_type_text.
  const remote = /remote/i.test(raw.workplace_type_text || raw.workplace_type || '');

  return {
    jobId,
    company,
    source: 'pinpoint',
    title: raw.title || 'Untitled',
    location,
    team: null,
    department: raw.job?.department || null,
    employmentType: raw.employment_type_text || raw.employment_type || null,
    remote,
    description,
    applyUrl: sanitizeUrl(raw.url),
    jobUrl: sanitizeUrl(raw.url),
    // Pinpoint's public postings.json has no posted-date field — falls back to
    // scrape time, same as every other adapter does when a source omits one.
    publishedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    compensationSummary: formatCompensation(raw),
    compensationMin: raw.compensation_minimum ?? null,
    compensationMax: raw.compensation_maximum ?? null,
    compensationCurrency: raw.compensation_currency ?? null,
    compensationInterval: normalizeInterval(raw.compensation_frequency),
    contentHash: contentHash(
      raw.title,
      location,
      description,
      raw.employment_type,
      String(remote),
      raw.job?.department
    ),
  };
}

// postings.json only ever lists live postings — nothing to filter out.
function filterRaw(rawJobs) {
  return rawJobs;
}

module.exports = { normalizeJob, filterRaw };
