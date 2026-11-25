const test = require('node:test');
const assert = require('node:assert/strict');

const { getDueCompanies, SUPPORTED_SOURCES } = require('../src/sources');

test('all implemented ATS providers can be registered', () => {
  assert.deepEqual(SUPPORTED_SOURCES, [
    'ashby',
    'lever',
    'greenhouse',
    'workable',
    'recruitee',
    'teamtailor',
    'pinpoint',
    'smartrecruiters',
    'workday',
    'keka',
    'rippling',
    'personio',
    'breezy',
  ]);
});

test('newly registered companies without scrape history are due immediately', () => {
  const companies = [
    {
      company: 'Acme',
      slug: 'acme',
      source: 'workable',
    },
  ];

  assert.deepEqual(getDueCompanies({}, companies), companies);
});

test('source-specific Workday slugs retain their tenant, host, and site segments', () => {
  const workdayCompany = {
    company: 'Acme',
    slug: 'acme/wd5/careers',
    source: 'workday',
  };

  assert.deepEqual(getDueCompanies({}, [workdayCompany]), [workdayCompany]);
});

test('scrape history is keyed by source and slug', () => {
  const companies = [
    {
      company: 'Acme Workable',
      slug: 'acme',
      source: 'workable',
    },
    {
      company: 'Acme Lever',
      slug: 'acme',
      source: 'lever',
    },
  ];

  const recentlyScraped = new Date().toISOString();
  assert.deepEqual(
    getDueCompanies({ 'workable:acme': recentlyScraped }, companies),
    [companies[1]]
  );
});
