const test = require('node:test');
const assert = require('node:assert/strict');

const workable = require('../src/normalize/adapters/workable');
const recruitee = require('../src/normalize/adapters/recruitee');
const teamtailor = require('../src/normalize/adapters/teamtailor');
const pinpoint = require('../src/normalize/adapters/pinpoint');
const smartrecruiters = require('../src/normalize/adapters/smartrecruiters');
const workday = require('../src/normalize/adapters/workday');
const keka = require('../src/normalize/adapters/keka');

test('workable.normalizeJob maps a real widget response shape', () => {
  const job = workable.normalizeJob({
    title: 'Controls Automation Engineer',
    shortcode: '98DA245FC8',
    employment_type: 'Full-time',
    telecommuting: false,
    department: 'Operations',
    url: 'https://apply.workable.com/j/98DA245FC8',
    application_url: 'https://apply.workable.com/j/98DA245FC8/apply',
    published_on: '2025-10-01',
    country: 'United Kingdom',
    city: 'Park Royal',
    description: '<p>Do things</p>',
  }, 'Skin + Me');

  assert.equal(job.jobId, '98DA245FC8');
  assert.equal(job.source, 'workable');
  assert.equal(job.remote, false);
  assert.equal(job.location, 'Park Royal');
  assert.equal(job.description, 'Do things');
  assert.ok(job.contentHash);
});

test('workable.normalizeJob returns null when shortcode is missing', () => {
  assert.equal(workable.normalizeJob({ title: 'No shortcode' }, 'Acme'), null);
});

test('workable.filterRaw keeps published/unstated jobs, drops others', () => {
  const raw = [{ state: 'published' }, { state: 'closed' }, {}];
  assert.equal(workable.filterRaw(raw).length, 2);
});

test('recruitee.normalizeJob maps a real offers response shape', () => {
  const job = recruitee.normalizeJob({
    id: 2751915,
    title: 'Customer Success Manager',
    department: 'Customer Success',
    location: 'Utrecht, Utrecht, Netherlands',
    remote: false,
    employment_type_code: 'fulltime_permanent',
    description: '<p>Role info</p>',
    requirements: '<p>Must know things</p>',
    careers_apply_url: 'https://jobs.channable.com/o/csm/c/new',
    careers_url: 'https://jobs.channable.com/o/csm',
    salary: { min: '3750', max: '5250', period: 'month', currency: 'EUR' },
    published_at: '2026-09-18T12:55:59Z',
    status: 'published',
  }, 'Channable');

  assert.equal(job.jobId, '2751915');
  assert.equal(job.source, 'recruitee');
  assert.equal(job.compensationMin, '3750');
  assert.equal(job.compensationInterval, 'MONTH');
  assert.match(job.description, /Role info/);
  assert.match(job.description, /Must know things/);
});

test('recruitee.normalizeJob returns null when id is missing', () => {
  assert.equal(recruitee.normalizeJob({ title: 'No id' }, 'Acme'), null);
});

test('recruitee.filterRaw drops non-published offers', () => {
  const raw = [{ status: 'published' }, { status: 'draft' }];
  assert.equal(recruitee.filterRaw(raw).length, 1);
});

test('teamtailor.normalizeJob maps the JSON Feed + schema.org _jobposting shape', () => {
  const job = teamtailor.normalizeJob({
    id: '3ce2c88b-cbc6-4ae9-8ecb-000466c69037',
    title: 'Group Financial Controller',
    url: 'https://career.teamtailor.com/jobs/8124573-group-financial-controller',
    date_published: '2026-07-24T13:57:16+02:00',
    content_html: '<p>Own the books</p>',
    _jobposting: {
      '@type': 'JobPosting',
      datePosted: '2026-07-24T13:57:16+02:00',
      jobLocation: [{ address: { addressLocality: 'Stockholm', addressCountry: 'SE' } }],
    },
  }, 'Teamtailor');

  assert.equal(job.jobId, '3ce2c88b-cbc6-4ae9-8ecb-000466c69037');
  assert.equal(job.source, 'teamtailor');
  assert.equal(job.location, 'Stockholm');
  assert.equal(job.description, 'Own the books');
});

test('teamtailor.normalizeJob returns null when id is missing', () => {
  assert.equal(teamtailor.normalizeJob({ title: 'No id' }, 'Acme'), null);
});

test('pinpoint.normalizeJob maps a real postings.json response shape', () => {
  const job = pinpoint.normalizeJob({
    id: '559663',
    title: 'Founding Legal Counsel',
    location: { city: 'London', name: 'Remote' },
    employment_type: 'full_time',
    employment_type_text: 'Full Time',
    workplace_type_text: 'Fully remote',
    description: '<p>Legal stuff</p>',
    url: 'https://workwithus.pinpointhq.com/en/postings/abc',
    job: { department: 'Legal' },
    compensation_minimum: 90000,
    compensation_maximum: 120000,
    compensation_currency: 'GBP',
    compensation_frequency: 'annual',
  }, 'Pinpoint');

  assert.equal(job.jobId, '559663');
  assert.equal(job.source, 'pinpoint');
  assert.equal(job.remote, true);
  assert.equal(job.department, 'Legal');
  assert.equal(job.compensationInterval, 'YEAR');
});

test('pinpoint.normalizeJob returns null when id is missing', () => {
  assert.equal(pinpoint.normalizeJob({ title: 'No id' }, 'Acme'), null);
});

test('smartrecruiters.normalizeJob maps a real postings list response shape', () => {
  const job = smartrecruiters.normalizeJob({
    id: '744000150404949',
    name: 'Automotive Technician',
    company: { identifier: 'BMWDealerCareers', name: 'BMW Dealer Careers' },
    releasedDate: '2026-09-18T15:18:44.118Z',
    location: { fullLocation: 'Lexington, KY, United States', remote: false },
    department: {},
    typeOfEmployment: { id: 'permanent', label: 'Full-time' },
    visibility: 'PUBLIC',
  }, 'BMW Dealer Careers');

  assert.equal(job.jobId, '744000150404949');
  assert.equal(job.source, 'smartrecruiters');
  assert.equal(job.applyUrl, 'https://jobs.smartrecruiters.com/BMWDealerCareers/744000150404949');
  assert.equal(job.description, '');
});

test('smartrecruiters.normalizeJob returns null when id is missing', () => {
  assert.equal(smartrecruiters.normalizeJob({ name: 'No id' }, 'Acme'), null);
});

test('smartrecruiters.filterRaw keeps only PUBLIC postings', () => {
  const raw = [{ visibility: 'PUBLIC' }, { visibility: 'INTERNAL' }];
  assert.equal(smartrecruiters.filterRaw(raw).length, 1);
});

test('workday.normalizeJob maps a real CXS jobs response shape', () => {
  const job = workday.normalizeJob({
    title: 'Principal Engagement Manager - Paradox',
    externalPath: '/job/USA-IL-Chicago/Principal-Engagement-Manager---Paradox_JR-0109678',
    locationsText: 'USA, IL, Chicago',
    postedOn: 'Posted Yesterday',
    remoteType: 'Flex',
    bulletFields: ['JR-0109678'],
    _boardUrl: 'https://workday.wd5.myworkdayjobs.com/Workday',
  }, 'Workday');

  assert.equal(job.jobId, 'Principal-Engagement-Manager---Paradox_JR-0109678');
  assert.equal(job.source, 'workday');
  assert.equal(job.remote, false);
  assert.equal(job.location, 'Chicago');
  assert.equal(
    job.applyUrl,
    'https://workday.wd5.myworkdayjobs.com/Workday/job/USA-IL-Chicago/Principal-Engagement-Manager---Paradox_JR-0109678'
  );
  assert.ok(job.contentHash);
});

test('workday.normalizeJob keeps jobId route-safe for dotted/accented/long titles', () => {
  const job = workday.normalizeJob({
    title: 'x',
    externalPath: '/job/München/Sr.-Staff-Engineer-(Platform)-Distributed-Systems-and-Infrastructure_JR-0123456',
  }, 'Acme');
  assert.match(job.jobId, /^[a-zA-Z0-9_-]{1,64}$/);
  assert.ok(job.jobId.endsWith('_JR-0123456'), 'requisition id must survive the trim');
});

test('workday.normalizeJob returns null when externalPath is missing', () => {
  assert.equal(workday.normalizeJob({ title: 'No path' }, 'Acme'), null);
});

test('workday.normalizeJob detects remoteType containing "Remote"', () => {
  const job = workday.normalizeJob({
    title: 'Remote Role',
    externalPath: '/job/Remote/Remote-Role_JR-1',
    remoteType: 'Remote',
    _boardUrl: 'https://acme.wd1.myworkdayjobs.com/Acme',
  }, 'Acme');
  assert.equal(job.remote, true);
});

// Shape from a live board (advantum.keka.com), trimmed.
const KEKA_JOB = {
  id: 143633,
  title: 'Coder - Professional',
  description: '<div>Strong experience in denial coding</div>',
  departmentName: 'CODINGOP',
  jobLocations: [{ id: 2688, name: 'Hyderabad', city: 'Hyderabad', state: 'TG', countryCode: 'IN', countryName: 'India' }],
  jobType: 2,
  salaryRange: { minimum: 50000, maximum: 80000, currency: 'INR', salaryPeriod: 4, cultureInfo: 'en-IN' },
  salaryRangeFormat: 'INR 50,000.00 - 80,000.00',
  publishedOn: '2026-10-06T07:41:37.493Z',
  _boardUrl: 'https://advantum.keka.com/careers/',
};

test('keka.normalizeJob maps a live posting', () => {
  const job = keka.normalizeJob(KEKA_JOB, 'Advantum');
  assert.equal(job.jobId, '143633');
  assert.equal(job.source, 'keka');
  assert.equal(job.location, 'Hyderabad');
  assert.equal(job.employmentType, 'FullTime');
  assert.equal(job.department, 'CODINGOP');
  assert.equal(job.description, 'Strong experience in denial coding');
  assert.equal(job.jobUrl, 'https://advantum.keka.com/careers/jobdetails/143633');
  assert.equal(job.applyUrl, job.jobUrl);
  assert.equal(job.publishedAt, '2026-10-06T07:41:37.493Z');
  assert.equal(job.compensationSummary, 'INR 50,000.00 - 80,000.00');
  assert.equal(job.compensationMax, 80000);
  assert.equal(job.compensationInterval, 'YEAR');
  assert.ok(job.contentHash);
});

test('keka.normalizeJob leaves pay empty when no maximum is set', () => {
  const job = keka.normalizeJob({ ...KEKA_JOB, salaryRange: { currency: 'INR', salaryPeriod: 0 }, salaryRangeFormat: '' }, 'Advantum');
  assert.equal(job.compensationSummary, null);
  assert.equal(job.compensationMin, null);
  assert.equal(job.compensationInterval, null);
});

test('keka.normalizeJob handles a posting with no location or job type', () => {
  const job = keka.normalizeJob({ ...KEKA_JOB, jobLocations: [], jobType: 9 }, 'Advantum');
  assert.equal(job.location, 'Unknown');
  assert.equal(job.employmentType, null);
});

test('keka.filterRaw drops postings without an id or title', () => {
  assert.equal(keka.filterRaw([KEKA_JOB, { id: 1 }, { title: 'No id' }, null]).length, 1);
});
