const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeResponse } = require('../src/normalize');

// The scraper pipeline (src/scheduler/pipeline.js) feeds this function raw ATS
// responses shaped exactly like these fixtures before diffing/storing jobs.
const REQUIRED_FIELDS = [
  'jobId', 'title', 'location', 'team', 'department', 'employmentType',
  'remote', 'description', 'applyUrl', 'jobUrl', 'publishedAt',
  'compensationSummary', 'contentHash',
];

test('normalizeResponse produces DB-insert-ready fields for an ashby-shaped response', () => {
  const jobs = normalizeResponse(
    { jobs: [{ jobUrl: 'https://jobs.ashbyhq.com/acme/abc-123', title: 'Engineer', isListed: true }] },
    'Acme',
    'ashby'
  );
  assert.equal(jobs.length, 1);
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in jobs[0], `missing field "${field}"`);
  }
});

test('normalizeResponse produces DB-insert-ready fields for a lever-shaped response (bare array wrapped)', () => {
  const jobs = normalizeResponse(
    { jobs: [{ id: 'lev-1', text: 'Designer' }] },
    'Acme',
    'lever'
  );
  assert.equal(jobs.length, 1);
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in jobs[0], `missing field "${field}"`);
  }
});

test('normalizeResponse produces DB-insert-ready fields for a greenhouse-shaped response', () => {
  const jobs = normalizeResponse(
    { jobs: [{ id: 99, title: 'Support', location: { name: 'Remote' } }] },
    'Acme',
    'greenhouse'
  );
  assert.equal(jobs.length, 1);
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in jobs[0], `missing field "${field}"`);
  }
});

test('normalizeResponse returns an empty array for an unknown source', () => {
  assert.deepEqual(normalizeResponse({ jobs: [] }, 'Acme', 'bogus'), []);
});
