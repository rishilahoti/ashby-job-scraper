const sanitizeHtml = require('sanitize-html');
const { contentHash } = require('../utils');
const { logger } = require('../utils');

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

function sanitizeDescription(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

function normalizeJob(raw, company) {
  const jobId = extractJobId(raw.jobUrl);
  if (!jobId) {
    logger.warn(`Skipping job with no extractable ID: ${raw.title}`);
    return null;
  }

  const description = raw.descriptionPlain || sanitizeDescription(raw.descriptionHtml);

  const compensationSummary =
    raw.compensation?.compensationTierSummary ||
    raw.compensation?.scrapeableCompensationSalarySummary ||
    null;

  let publishedAt = null;
  if (raw.publishedAt) {
    const d = new Date(raw.publishedAt);
    publishedAt = isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (!publishedAt) publishedAt = new Date().toISOString();

  const normalized = {
    jobId,
    company,
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

  return normalized;
}

function normalizeResponse(apiResponse, company) {
  if (!apiResponse || !Array.isArray(apiResponse.jobs)) {
    logger.warn(`No jobs array in response for ${company}`);
    return [];
  }

  const jobs = apiResponse.jobs
    .filter(j => j.isListed !== false)
    .map(j => normalizeJob(j, company))
    .filter(Boolean);

  logger.debug(`Normalized ${jobs.length} jobs for ${company}`);
  return jobs;
}

module.exports = { normalizeResponse, normalizeJob, extractJobId };
