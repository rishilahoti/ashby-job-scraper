const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../src/normalize/shared');
const ashby = require('../src/normalize/adapters/ashby');
const lever = require('../src/normalize/adapters/lever');
const greenhouse = require('../src/normalize/adapters/greenhouse');

test('sanitizeDescription strips tags', () => {
  assert.equal(shared.sanitizeDescription('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(shared.sanitizeDescription(''), '');
});

test('decodeHtmlEntities decodes common entities', () => {
  assert.equal(shared.decodeHtmlEntities('&lt;div&gt;A &amp; B&lt;/div&gt;'), '<div>A & B</div>');
});

test('normalizeSalaryInterval maps known intervals, null for unknown', () => {
  assert.equal(shared.normalizeSalaryInterval('1 YEAR'), 'YEAR');
  assert.equal(shared.normalizeSalaryInterval('per-hour-salary'), 'HOUR');
  assert.equal(shared.normalizeSalaryInterval('nonsense'), null);
  assert.equal(shared.normalizeSalaryInterval(null), null);
});

test('ashby.normalizeJob maps core fields and extracts jobId from jobUrl', () => {
  const job = ashby.normalizeJob({
    jobUrl: 'https://jobs.ashbyhq.com/acme/abc-123',
    title: 'Engineer',
    location: 'Remote',
    isRemote: true,
    team: 'Platform',
    department: 'Engineering',
    employmentType: 'FullTime',
    descriptionPlain: 'Do things',
    applyUrl: 'https://jobs.ashbyhq.com/acme/abc-123/apply',
    publishedAt: '2026-01-01T00:00:00.000Z',
  }, 'Acme');

  assert.equal(job.jobId, 'abc-123');
  assert.equal(job.company, 'Acme');
  assert.equal(job.source, 'ashby');
  assert.equal(job.title, 'Engineer');
  assert.equal(job.remote, true);
  assert.equal(job.publishedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(job.contentHash);
});

test('ashby.normalizeJob returns null when jobUrl is missing', () => {
  assert.equal(ashby.normalizeJob({ title: 'No URL' }, 'Acme'), null);
});

test('ashby.normalizeJob extracts min/max/currency from the Salary compensation component', () => {
  const job = ashby.normalizeJob({
    jobUrl: 'https://jobs.ashbyhq.com/acme/xyz',
    compensation: {
      summaryComponents: [
        { compensationType: 'Equity' },
        { compensationType: 'Salary', currencyCode: 'USD', minValue: 100000, maxValue: 150000, interval: '1 YEAR' },
      ],
    },
  }, 'Acme');

  assert.equal(job.compensationMin, 100000);
  assert.equal(job.compensationMax, 150000);
  assert.equal(job.compensationCurrency, 'USD');
  assert.equal(job.compensationInterval, 'YEAR');
});

test('ashby.filterRaw drops unlisted jobs', () => {
  const raw = [{ isListed: true }, { isListed: false }, {}];
  assert.equal(ashby.filterRaw(raw).length, 2);
});

test('lever.normalizeJob maps categories and salary range', () => {
  const job = lever.normalizeJob({
    id: 'lev-1',
    text: 'Designer',
    workplaceType: 'remote',
    categories: { location: 'NYC', team: 'Design', department: 'Product', commitment: 'Full-time' },
    salaryRange: { currency: 'USD', min: 90000, max: 120000 },
    createdAt: 1735689600000,
  }, 'Acme');

  assert.equal(job.jobId, 'lev-1');
  assert.equal(job.remote, true);
  assert.equal(job.location, 'NYC');
  assert.equal(job.compensationSummary, 'USD 90,000–120,000');
});

test('lever.normalizeJob returns null when id is missing', () => {
  assert.equal(lever.normalizeJob({ text: 'No id' }, 'Acme'), null);
});

test('greenhouse.normalizeJob decodes double-encoded HTML and detects remote from location', () => {
  const job = greenhouse.normalizeJob({
    id: 42,
    title: 'Support Engineer',
    location: { name: 'Remote - US' },
    content: '&lt;p&gt;Help &amp; support&lt;/p&gt;',
    absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/42',
    first_published: '2026-01-01T00:00:00.000Z',
  }, 'Acme');

  assert.equal(job.jobId, '42');
  assert.equal(job.remote, true);
  // sanitize-html re-encodes remaining "&" in its stripped-tags output.
  assert.equal(job.description, 'Help &amp; support');
});

test('greenhouse.normalizeJob returns null when id is missing', () => {
  assert.equal(greenhouse.normalizeJob({ title: 'No id' }, 'Acme'), null);
});
