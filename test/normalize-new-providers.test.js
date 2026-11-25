const test = require('node:test');
const assert = require('node:assert/strict');

const workable = require('../src/normalize/adapters/workable');
const recruitee = require('../src/normalize/adapters/recruitee');
const teamtailor = require('../src/normalize/adapters/teamtailor');
const pinpoint = require('../src/normalize/adapters/pinpoint');
const smartrecruiters = require('../src/normalize/adapters/smartrecruiters');
const workday = require('../src/normalize/adapters/workday');
const keka = require('../src/normalize/adapters/keka');
const rippling = require('../src/normalize/adapters/rippling');
const rules = require('../src/config/rules.json');
const { computeStoredScore } = require('../src/intelligence/rules-engine');

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
    // The real shape: an object, not a string (the old fixture hid a crash).
    job: { id: '535660', department: { id: '44464', name: 'Legal' } },
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
  // Scoring is where the object department crashed every Pinpoint board.
  assert.doesNotThrow(() => computeStoredScore(job, rules));
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

// Shape of api.rippling.com/platform/api/ats/v1/board/{slug}/jobs, one row per location.
const RIPPLING_ROW = {
  uuid: '96601a74-e7b6-469d-8c69-6fdfd1c83bc0',
  name: 'Account Executive',
  department: { id: 'Sales', label: 'Sales' },
  url: 'https://ats.rippling.com/rippling/jobs/96601a74-e7b6-469d-8c69-6fdfd1c83bc0',
  workLocation: { label: 'Remote (India)', id: 'Remote (India)' },
};

test('rippling.normalizeJob maps a board row', () => {
  const job = rippling.normalizeJob(RIPPLING_ROW, 'Rippling');
  assert.equal(job.jobId, RIPPLING_ROW.uuid);
  assert.equal(job.source, 'rippling');
  assert.equal(job.title, 'Account Executive');
  assert.equal(job.department, 'Sales');
  assert.equal(job.remote, true);
  assert.equal(job.jobUrl, RIPPLING_ROW.url);
  assert.equal(rippling.normalizeJob({ name: 'No id' }, 'Acme'), null);
});

test('rippling.filterRaw keeps one row per job', () => {
  const other = { ...RIPPLING_ROW, workLocation: { label: 'New York, NY' } };
  assert.deepEqual(rippling.filterRaw([RIPPLING_ROW, other, { name: 'no uuid' }]), [RIPPLING_ROW]);
});

const personio = require('../src/normalize/adapters/personio');
const breezy = require('../src/normalize/adapters/breezy');

// Trimmed from 1nce.jobs.personio.de/xml: own fields both sides of <jobDescriptions>.
const personioPosting = (descriptions) => ({
  slug: '1nce',
  posting: `<position>
    <id>2509340</id>
    <office>Remote Norway</office>
    <department>Sales &amp; Marketing</department>
    <name>Account Manager - Nordics (all)</name>
    <jobDescriptions>${descriptions}</jobDescriptions>
    <employmentType>permanent</employmentType>
    <schedule>full-time</schedule>
    <createdAt>2026-01-27T14:46:54+00:00</createdAt>
</position>`,
});
const PERSONIO_SECTION = '<jobDescription><name>Your team</name><value><![CDATA[<p>IoT &amp; more</p>]]></value></jobDescription>';

test('personio.normalizeJob reads the XML posting', () => {
  const job = personio.normalizeJob(personioPosting(PERSONIO_SECTION), '1NCE');
  assert.equal(job.jobId, '2509340');
  assert.equal(job.title, 'Account Manager - Nordics (all)');
  assert.equal(job.department, 'Sales & Marketing');
  assert.equal(job.employmentType, 'permanent, full-time');
  assert.equal(job.remote, true);
  assert.equal(job.publishedAt, '2026-01-27T14:46:54.000Z');
  assert.equal(job.jobUrl, 'https://1nce.jobs.personio.de/job/2509340');
  assert.match(job.description, /^Your team\nIoT &amp; more/);
  assert.equal(personio.normalizeJob({ posting: '<position></position>', slug: 'x' }, 'X'), null);
});

test('personio.filterRaw keeps the copy of a posting that has a description', () => {
  const blank = personioPosting('');
  const full = personioPosting(PERSONIO_SECTION);
  assert.deepEqual(personio.filterRaw([blank, full]), [full]);
  assert.deepEqual(personio.filterRaw([full, blank]), [full]);
});

test('breezy.normalizeJob maps a /json position', () => {
  const job = breezy.normalizeJob({
    id: '853ab5036db4',
    name: 'Data Science Analytics',
    url: 'https://nexthire.breezy.hr/p/853ab5036db4-data-science',
    published_date: '2026-09-09T05:07:43.918Z',
    type: { id: 'fullTime', name: 'Full-Time' },
    location: { city: 'Mumbai', is_remote: false, name: 'Mumbai, IN' },
    department: null,
    salary: '',
  }, 'Nexthire');
  assert.equal(job.jobId, '853ab5036db4');
  assert.equal(job.source, 'breezy');
  assert.equal(job.employmentType, 'Full-Time');
  assert.equal(job.description, null);
  assert.equal(job.publishedAt, '2026-09-09T05:07:43.918Z');
  assert.equal(breezy.normalizeJob({ name: 'No id' }, 'Acme'), null);
});

const yc = require('../src/normalize/adapters/yc');
const wellfound = require('../src/normalize/adapters/wellfound');

// Trimmed from ycombinator.com/companies/posthog/jobs: props in an HTML-escaped data-page attribute.
const YC_POSTING = {
  id: 122380,
  title: 'Strategic Finance Analyst',
  url: '/companies/posthog/jobs/Zj8Hw8R-strategic-finance-analyst',
  location: 'San Francisco, CA, US / Remote (US)',
  type: 'Full-time',
  prettyRole: 'Sales',
  salaryRange: '$120K - $180K',
  equityRange: '',
  companyName: 'PostHog',
  createdAt: '13 days',
};
const ycPage = (props) => `<div id="app" data-page="${JSON.stringify({ component: 'WaasShowJobsPage', props })
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"></div>`;

test('yc.jobsFromPage reads the jobs out of the escaped data-page props', () => {
  assert.deepEqual(yc.jobsFromPage(ycPage({ jobPostings: [{ ...YC_POSTING, title: "R&D 'Lead'" }] })), [{ ...YC_POSTING, title: "R&D 'Lead'" }]);
  assert.deepEqual(yc.jobsFromPage(ycPage({ jobPostings: [] })), []);
  assert.equal(yc.jobsFromPage('<html>no props</html>'), null);
  assert.equal(yc.jobsFromPage(ycPage({})), null);
});

test('yc.normalizeJob maps a YC job posting', () => {
  const job = yc.normalizeJob(YC_POSTING, 'PostHog');
  assert.equal(job.jobId, 'yc-122380');
  assert.equal(job.source, 'yc');
  assert.equal(job.location, 'San Francisco');
  assert.equal(job.remote, true);
  assert.equal(job.department, 'Sales');
  assert.equal(job.compensationSummary, '$120K - $180K');
  assert.equal(job.jobUrl, 'https://www.ycombinator.com/companies/posthog/jobs/Zj8Hw8R-strategic-finance-analyst');
  assert.equal(job.description, null);
  const daysAgo = (Date.now() - Date.parse(job.publishedAt)) / 86400000;
  assert.ok(daysAgo > 12.9 && daysAgo < 13.1);
  assert.equal(yc.normalizeJob({ title: 'No id' }, 'Acme'), null);
});

// Trimmed from wellfound.com/company/fuzehq/jobs: the Apollo cache in __NEXT_DATA__.
const WELLFOUND_LISTING = {
  __typename: 'JobListing',
  id: '2448180',
  slug: 'software-engineer',
  title: 'Software Engineer',
  locationNames: ['Dubai', 'Bengaluru'],
  remote: true,
  primaryRoleTitle: 'Engineering',
  liveStartAt: 1793169764,
  jobType: 'full_time',
  compensation: '$40k – $100k • 0.05% – 0.1%',
  description: '',
};
const wellfoundPage = (data) => `<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">${
  JSON.stringify({ props: { pageProps: { apolloState: { data } } } })}</script>`;

test("wellfound.jobsFromPage reads only the startup's own listings", () => {
  const data = {
    'Startup:9160805': {
      'jobListingsConnection({"first":10})': { edges: [{ node: { __ref: 'JobListing:2448180' } }] },
      'jobListingsConnection({"first":20})': { edges: [{ node: { __ref: 'JobListing:2448180' } }] },
    },
    'JobListing:2448180': WELLFOUND_LISTING,
    'JobListing:999': { ...WELLFOUND_LISTING, id: '999' },
  };
  assert.deepEqual(wellfound.jobsFromPage(wellfoundPage(data)), [WELLFOUND_LISTING]);
  assert.deepEqual(wellfound.jobsFromPage(wellfoundPage({ 'Startup:1': {} })), []);
  assert.equal(wellfound.jobsFromPage(wellfoundPage({})), null);
  assert.equal(wellfound.jobsFromPage('<html>challenge</html>'), null);
});

test('wellfound.normalizeJob maps a job listing', () => {
  const job = wellfound.normalizeJob(WELLFOUND_LISTING, 'Fuze');
  assert.equal(job.jobId, 'wellfound-2448180');
  assert.equal(job.source, 'wellfound');
  assert.equal(job.location, 'Dubai');
  assert.equal(job.remote, true);
  assert.equal(job.employmentType, 'Full-time');
  assert.equal(job.publishedAt, '2026-10-28T06:42:44.000Z');
  assert.equal(job.jobUrl, 'https://wellfound.com/jobs/2448180-software-engineer');
  assert.equal(job.compensationSummary, '$40k – $100k • 0.05% – 0.1%');
  assert.equal(wellfound.normalizeJob({ title: 'No id' }, 'Acme'), null);
});
