const { contentHash } = require('../../utils');
const { sanitizeDescription, normalizeSalaryInterval } = require('../shared');

function extractJobId(jobUrl) {
  if (!jobUrl) return null;
  try {
    const url = new URL(jobUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return jobUrl;
  }
}

function normalizeJob(raw, company) {
  const jobId = extractJobId(raw.jobUrl);
  if (!jobId) return null;

  const description = raw.descriptionPlain || sanitizeDescription(raw.descriptionHtml);

  const compensationSummary =
    raw.compensation?.compensationTierSummary ||
    raw.compensation?.scrapeableCompensationSalarySummary ||
    null;

  // summaryComponents can include equity/bonus entries alongside salary — only
  // the "Salary" component has the currency+min/max GSC's baseSalary needs.
  const salaryComponent = raw.compensation?.summaryComponents?.find(
    c => c.compensationType === 'Salary' && c.currencyCode && (c.minValue != null || c.maxValue != null)
  );
  const compensationMin = salaryComponent?.minValue ?? null;
  const compensationMax = salaryComponent?.maxValue ?? null;
  const compensationCurrency = salaryComponent?.currencyCode ?? null;
  const compensationInterval = normalizeSalaryInterval(salaryComponent?.interval);

  let publishedAt = null;
  if (raw.publishedAt) {
    const d = new Date(raw.publishedAt);
    publishedAt = isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (!publishedAt) publishedAt = new Date().toISOString();

  return {
    jobId,
    company,
    source: 'ashby',
    title: raw.title || 'Untitled',
    location: raw.location || 'Unknown',
    team: raw.team || null,
    department: raw.department || null,
    employmentType: raw.employmentType || null,
    remote: Boolean(raw.isRemote),
    description,
    applyUrl: raw.applyUrl || '',
    jobUrl: raw.jobUrl || '',
    publishedAt,
    scrapedAt: new Date().toISOString(),
    compensationSummary,
    compensationMin,
    compensationMax,
    compensationCurrency,
    compensationInterval,
    contentHash: contentHash(
      raw.title,
      raw.location,
      description,
      raw.employmentType,
      String(raw.isRemote),
      raw.team,
      raw.department
    ),
  };
}

// Ashby lists unpublished/draft jobs too — only keep what's actually live.
function filterRaw(rawJobs) {
  return rawJobs.filter(j => j.isListed !== false);
}

module.exports = { normalizeJob, filterRaw };
