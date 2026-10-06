const test = require('node:test');
const assert = require('node:assert/strict');

const { slugFromCrawledUrl } = require('../src/discovery');
const { isValidSlug } = require('../src/sources');

test('subdomain sources take the company from the hostname', () => {
  assert.equal(slugFromCrawledUrl('recruitee', 'https://acme.recruitee.com/o/backend-engineer'), 'acme');
  assert.equal(slugFromCrawledUrl('pinpoint', 'https://acme.pinpointhq.com/en/postings/abc'), 'acme');
  assert.equal(slugFromCrawledUrl('teamtailor', 'https://Acme.teamtailor.com/jobs'), 'acme');
});

test("the providers' own subdomains are not company boards", () => {
  assert.equal(slugFromCrawledUrl('recruitee', 'https://www.recruitee.com/en/pricing'), null);
  assert.equal(slugFromCrawledUrl('recruitee', 'https://support.recruitee.com/articles/1'), null);
  assert.equal(slugFromCrawledUrl('recruitee', 'https://www.acme.recruitee.com/'), null);
  assert.equal(slugFromCrawledUrl('pinpoint', 'https://pinpointhq.com/pricing'), null);
});

test('North American Teamtailor boards keep their region in the slug', () => {
  assert.equal(slugFromCrawledUrl('teamtailor', 'https://acme.na.teamtailor.com/jobs/123-engineer'), 'acme.na');
  assert.equal(isValidSlug('acme.na', 'teamtailor'), true);
  assert.equal(isValidSlug('acme.eu', 'teamtailor'), false);
  assert.equal(isValidSlug('acme.na', 'recruitee'), false);
});

test('Workday slugs are tenant/wdHost/site, skipping a locale segment', () => {
  assert.equal(
    slugFromCrawledUrl('workday', 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Engineer_JR123'),
    'nvidia/wd5/nvidiaexternalcareersite'
  );
  assert.equal(slugFromCrawledUrl('workday', 'https://acme.wd1.myworkdayjobs.com/Careers'), 'acme/wd1/careers');
  assert.equal(slugFromCrawledUrl('workday', 'https://acme.wd1.myworkdayjobs.com/'), null);
  assert.equal(slugFromCrawledUrl('workday', 'https://www.myworkdayjobs.com/en-US/Careers'), null);
});

test('path-based sources still take the first path segment', () => {
  assert.equal(slugFromCrawledUrl('ashby', 'https://jobs.ashbyhq.com/Notion/abc'), 'notion');
  assert.equal(slugFromCrawledUrl('ashby', 'https://jobs.ashbyhq.com/api/non-user-graphql'), null);
  assert.equal(slugFromCrawledUrl('smartrecruiters', 'https://jobs.smartrecruiters.com/BMWDealerCareers/123'), 'BMWDealerCareers');
});

test('garbage URLs yield no slug', () => {
  assert.equal(slugFromCrawledUrl('ashby', 'not a url'), null);
  assert.equal(slugFromCrawledUrl('ashby', 'https://jobs.ashbyhq.com/acme%22%3E'), null);
});
