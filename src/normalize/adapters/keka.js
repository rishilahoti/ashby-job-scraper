const { contentHash } = require('../../utils');
const { sanitizeDescription, sanitizeUrl, normalizeLocation } = require('../shared');

// Keka's own ids, from its careers widget (embedjobs/js): jobType 1 is part
// time, 2 full time; salaryPeriod 1 hourly, 2 bi-weekly, 3 monthly, 4 annual,
// 0 not given. Bi-weekly has no schema.org unitText, so it maps to null.
const EMPLOYMENT_TYPES = { 1: 'PartTime', 2: 'FullTime' };
const SALARY_INTERVALS = { 1: 'HOUR', 3: 'MONTH', 4: 'YEAR' };

function normalizeJob(raw, company) {
  const jobId = raw.id != null ? String(raw.id) : null;
  if (!jobId) return null;

  // ponytail: first location only, like the other adapters; a multi-city
  // posting lists just one of them.
  const place = raw.jobLocations?.[0];
  const normalizedLocation = normalizeLocation(
    place ? [place.city || place.name, place.countryName].filter(Boolean).join(', ') : ''
  );
  const description = sanitizeDescription(raw.description);
  const employmentType = EMPLOYMENT_TYPES[raw.jobType] || null;
  // Keka shows a range only when its maximum is set; the minimum may be 0.
  const salary = raw.salaryRange?.maximum ? raw.salaryRange : null;
  const jobUrl = sanitizeUrl(`${raw._boardUrl}jobdetails/${raw.id}`);

  return {
    jobId,
    company,
    source: 'keka',
    title: raw.title || 'Untitled',
    location: normalizedLocation.location,
    team: null,
    department: raw.departmentName || null,
    employmentType,
    remote: normalizedLocation.remote,
    description,
    applyUrl: jobUrl,
    jobUrl,
    publishedAt: raw.publishedOn ? new Date(raw.publishedOn).toISOString() : new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    compensationSummary: salary ? raw.salaryRangeFormat || null : null,
    compensationMin: salary ? salary.minimum ?? null : null,
    compensationMax: salary ? salary.maximum : null,
    compensationCurrency: salary ? salary.currency ?? null : null,
    compensationInterval: salary ? SALARY_INTERVALS[salary.salaryPeriod] ?? null : null,
    contentHash: contentHash(
      raw.title,
      normalizedLocation.location,
      description,
      employmentType,
      String(normalizedLocation.remote),
      raw.departmentName
    ),
  };
}

function filterRaw(rawJobs) {
  return rawJobs.filter(j => j && j.id != null && j.title);
}

module.exports = { normalizeJob, filterRaw };
