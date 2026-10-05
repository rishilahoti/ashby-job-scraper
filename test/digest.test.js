const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyNiche } = require('../src/digest/niche');
const { buildDigest, pickTopJobs } = require('../src/digest/content');

test('classifyNiche: narrow niches win, non-dev titles are out, generic titles fall back', () => {
  const cases = [
    ['Senior Frontend Engineer', 'frontend'],
    ['React Native Developer', 'mobile'],
    ['ML Engineer', 'ai'],
    ['Software Engineer, AI Infrastructure', 'ai'],
    ['Full Stack Engineer', 'fullstack'],
    ['Data Infrastructure Engineer', 'data'],
    ['Cloud Security Engineer', 'security'],
    ['Site Reliability Engineer', 'devops'],
    ['Smart Contract Engineer', 'web3'],
    ['Firmware Engineer', 'embedded'],
    ['QA Engineer', 'qa'],
    ['Data Scientist', 'data'],
    ['Software Engineer', 'software'],
    ['Founding Engineer', 'software'],
    ['Lighting and AV Engineer', null],
    ['QAQC Engineer', null],
    ['Sales Engineer', null],
    ['AI Trainer (Python)', null],
    ['Product Manager, AI', null],
    ['Hardware Engineer', null],
    ['Account Executive', null],
  ];
  for (const [title, niche] of cases) assert.equal(classifyNiche({ title }), niche, title);
  assert.equal(classifyNiche({ title: 'Software Engineer', team: 'Infrastructure' }), 'devops');
  assert.equal(classifyNiche({ title: 'Recruiter', team: 'Machine Learning' }), null);
});

const job = (id, title, score, company = `Co${id}`, extra = {}) => ({
  jobId: `j${id}`, company, title, location: 'Berlin', remote: false, score, ...extra,
});

test('pickTopJobs: software only, one per role, max 3 per niche, topped up, score order', () => {
  const candidates = [
    job(1, 'ML Engineer', 50),
    job(2, 'ML Engineer', 49, 'Co1'), // same role at the same company, another city
    job(3, 'AI Engineer', 48),
    job(4, 'LLM Engineer', 47),
    job(5, 'Applied Scientist', 46), // 4th AI role: over the cap
    job(6, 'Sales Engineer', 45),
    job(7, 'Frontend Engineer', 30),
  ];
  const picked = pickTopJobs(candidates, 5, 3);
  assert.deepEqual(picked.map((j) => j.jobId), ['j1', 'j3', 'j4', 'j5', 'j7']);
  assert.deepEqual(pickTopJobs(candidates, 4, 3).map((j) => j.jobId), ['j1', 'j3', 'j4', 'j7']);
});

const baseData = (overrides = {}) => ({
  date: new Date('2026-10-05T00:10:00Z'),
  run: { scraped: 1000, failed: 0, new: 1234, updated: 56, removed: 78 },
  failures: [],
  newCompanies: [{ name: 'Acme', source: 'ashby', jobs: 12 }],
  totals: { jobs: 46000, companies: 1061, sources: ['ashby', 'greenhouse', 'lever'] },
  users: 321,
  shipped: [{ number: 23, title: 'Daily digest email', url: 'https://github.com/x/y/pull/23' }],
  candidates: Array.from({ length: 12 }, (_, i) => job(i, ['Frontend Engineer', 'Backend Engineer', 'ML Engineer', 'iOS Engineer'][i % 4], 40 - i)),
  ...overrides,
});

test('buildDigest: subject numbers, 3 distinct hooks on the same list, links in the first comment', () => {
  const { subject, text, html } = buildDigest(baseData());
  assert.match(subject, /\+1,234 jobs · \+1 companies/);

  const hooks = [...text.matchAll(/^== Post [234]: today's jobs \(hook [ABC]\) .*\n-+\n(.*)$/gm)].map((m) => m[1]);
  assert.equal(hooks.length, 3);
  assert.equal(new Set(hooks).size, 3);

  const links = text.match(/^\d+\. https:\/\/ashbyhq-scraper\.vercel\.app\/jobs\/j\d+$/gm);
  assert.equal(links.length, 10);
  assert.match(text, /Day 220 of building|day 220/);
  assert.match(text, /across Ashby, Greenhouse and Lever\./);
  assert.match(text, /Shipped:\n→ Daily digest email/);
  assert.match(text, /→ Nothing\. Every job board loaded/);
  assert.match(html, /<pre/);
});

test('buildDigest: escapes scraped text in the HTML', () => {
  const { html } = buildDigest(baseData({
    candidates: [job(1, 'Frontend Engineer <script>alert(1)</script>', 30, 'Evil & Co')],
  }));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /Evil &amp; Co/);
});

test('buildDigest: only newly broken boards go in the post; long-dead ones only in the email', () => {
  const failures = [
    { company: 'JustBrokeCo', error_message: 'HTTP 500', last_ok: new Date('2026-10-04T00:05:00Z') },
    { company: 'MovedCo', error_message: 'HTTP 404', last_ok: new Date('2026-08-01T00:00:00Z') },
    { company: 'NeverLoadedCo', error_message: 'HTTP 404', last_ok: null },
  ];
  const { text } = buildDigest(baseData({ run: { scraped: 10, failed: 3, new: 1, updated: 0, removed: 0 }, failures }));
  assert.match(text, /→ 1 company job board stopped loading \(JustBrokeCo\)\. On it\./);
  assert.match(text, /JustBrokeCo: HTTP 500/);
  assert.match(text, /2 boards failing for 2\+ days .*: MovedCo, NeverLoadedCo/);

  const onlyDead = buildDigest(baseData({ run: { scraped: 10, failed: 1, new: 1, updated: 0, removed: 0 }, failures: failures.slice(1, 2) }));
  assert.match(onlyDead.text, /→ Nothing new\. Every board that worked yesterday still works/);
});

test('buildDigest: no new software jobs means no jobs posts, and says so', () => {
  const { text } = buildDigest(baseData({ candidates: [job(1, 'Account Executive', 30)] }));
  assert.ok(!text.includes("today's jobs"));
  assert.match(text, /skip the jobs posts today/);
});
