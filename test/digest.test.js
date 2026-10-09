const test = require('node:test');
const assert = require('node:assert/strict');

const rules = require('../src/config/rules.json');
const { computeStoredScore } = require('../src/intelligence/rules-engine');
const { classifyNiche, NICHE_LABELS } = require('../src/digest/niche');
const { buildDigest, pickTopJobs, copyFacts } = require('../src/digest/content');
const { checkCopy } = require('../src/digest/writer');
const { postSlots, littleText } = require('../src/linkedin');

test('every niche in rules.json has a display label', () => {
  for (const niche of Object.keys(rules.niches)) assert.ok(NICHE_LABELS[niche], niche);
});

test('stored tags: niche first, then positive keywords, then tech tags; no tech tags on non-dev titles', () => {
  const ios = computeStoredScore({ title: 'Senior iOS Engineer', description: 'We use React, Kubernetes and AWS.' }, rules);
  assert.deepEqual(ios.matchedKeywords, ['mobile', 'react', 'aws', 'kubernetes']);
  const web = computeStoredScore({ title: 'Frontend Engineer', description: 'Next.js and GraphQL.' }, rules);
  assert.deepEqual(web.matchedKeywords, ['frontend', 'next.js', 'graphql']);
  const recruiter = computeStoredScore({ title: 'Technical Recruiter', description: 'Hiring Golang and AWS engineers.' }, rules);
  assert.deepEqual(recruiter.matchedKeywords, []);
});

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
    ['Engineering Lead, AI Email App', 'ai'],
    // Seen in production: a niche word without a technical role.
    ['Security Officer Full-Time II (Crypto.com Arena)', null],
    ['Senior Cloud Alliances Manager', null],
    ['Praktikum - Strategic Foresight & AI Agents', null],
    ['Senior Security Compliance (GRC) Manager', null],
    ['System Administrator for T-Cloud Public', null],
    ['Senior Resident Engineer - Bridge, Tunnel & Infrastructure', null],
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

test('buildDigest: subject numbers, 2 distinct hooks on the same list', () => {
  const { subject, text, html } = buildDigest(baseData());
  assert.match(subject, /\+1,234 jobs · \+1 companies/);

  const hooks = [...text.matchAll(/^== Post [23]: today's jobs \(hook [AB]\) .*\n-+\n(.*)$/gm)].map((m) => m[1]);
  assert.equal(hooks.length, 2);
  assert.equal(new Set(hooks).size, 2);
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
  assert.match(text, /→ 1 company job board stopped loading: JustBrokeCo\.\n/);
  assert.match(text, /JustBrokeCo: HTTP 500/);
  assert.match(text, /2 boards failing for 2\+ days .*: MovedCo, NeverLoadedCo/);

  const onlyDead = buildDigest(baseData({ run: { scraped: 10, failed: 1, new: 1, updated: 0, removed: 0 }, failures: failures.slice(1, 2) }));
  assert.match(onlyDead.text, /→ Nothing new\. Every board that worked yesterday still works/);
});

// A draft for baseData() as Groq returns it.
const goodCopy = () => ({
  hook: '1,234 new jobs since yesterday, from 1,061 companies.',
  hookLine2: '',
  shipped: ['A daily email with the best new roles'],
  broke: '',
  closer: 'Every role straight from the company, the day it opens.',
  jobHooks: [
    'These 10 roles opened yesterday. Apply before the crowd does.',
    'Frontend, ML and iOS roles, all under a day old.',
  ],
});

test('checkCopy: takes a clean draft, rejects invented numbers, hashtags, questions, "on it" and missing names', () => {
  const facts = copyFacts(baseData());
  assert.equal(checkCopy(goodCopy(), facts), null);
  assert.match(checkCopy({ ...goodCopy(), hook: '2,000 new jobs since yesterday.' }, facts), /2000 isn't in the facts/);
  assert.match(checkCopy({ ...goodCopy(), closer: 'Try it today #jobs' }, facts), /hashtag/);
  assert.match(checkCopy({ ...goodCopy(), closer: 'Which one is yours?' }, facts), /question/);
  assert.match(checkCopy({ ...goodCopy(), closer: 'Two boards broke, on it.' }, facts), /banned/);
  assert.match(checkCopy({ ...goodCopy(), shipped: [] }, facts), /shipped/);

  const broken = copyFacts(baseData({ failures: [{ company: 'JustBrokeCo', error_message: 'HTTP 500', last_ok: new Date('2026-10-04T00:05:00Z') }] }));
  assert.match(checkCopy(goodCopy(), broken), /leaves out a company/);
  assert.match(checkCopy({ ...goodCopy(), broke: 'JustBrokeCo is hiring.' }, broken), /doesn't say the boards stopped loading/);
  assert.equal(checkCopy({ ...goodCopy(), broke: 'JustBrokeCo\'s job board stopped loading.' }, broken), null);
});

test('checkCopy: a number must be the fact it counts, not just any number in the facts', () => {
  const facts = copyFacts(baseData());
  // 321 is the signed-up-user count, not the 1,234 new jobs.
  assert.match(checkCopy({ ...goodCopy(), hook: '321 new jobs since yesterday.' }, facts), /321 doesn't match what it counts/);
  assert.match(checkCopy({ ...goodCopy(), hook: '1,061 job seekers signed up.' }, facts), /1061 doesn't match/);
  assert.equal(checkCopy({ ...goodCopy(), hook: '78 jobs closed, 46,000 live roles, 321 job seekers.' }, facts), null);
});

test('buildDigest: Groq copy around the exact numbers, tags from the day\'s niches', () => {
  const { text, posts } = buildDigest({ ...baseData(), copy: goodCopy(), copyNote: 'Wording by Groq.' });
  assert.ok(posts[0].startsWith('1,234 new jobs since yesterday, from 1,061 companies.\n\nDay 220 of building'));
  assert.match(posts[0], /\n→ 1,234 new jobs\n/);
  assert.match(posts[0], /Shipped:\n→ A daily email with the best new roles\n/);
  assert.match(posts[0], /the day it opens\.\nFree, no sign-up: https:\/\/ashbyhq-scraper\.vercel\.app\n\n#BuildInPublic/);
  assert.deepEqual(posts.slice(1).map((p) => p.split('\n')[0]), goodCopy().jobHooks);
  assert.ok(posts[1].endsWith('\n#Hiring #NowHiring #JobOpenings #JobAlert #TechJobs #SoftwareJobs #SoftwareEngineering #SoftwareDeveloper'
    + ' #OpenToWork #JobSearch #Frontend #WebDevelopment #Backend #APIs #AI #MachineLearning'));
  assert.match(text, /Wording by Groq\./);
});

test('job posts: score after the number, link right under each job, no first comment', () => {
  const { text, posts } = buildDigest(baseData());
  assert.equal(posts.length, 3);
  assert.ok(posts[1].includes('\n\n1. [40] 🎨 Frontend Engineer at Co0 (Berlin)\nLink: https://ashbyhq-scraper.vercel.app/jobs/j0\n\n2. [39] ⚙️ Backend Engineer at Co1'));
  assert.equal(posts[1].match(/^Link: /gm).length, 10);
  assert.ok(!/first comment/i.test(text));
});

test('job posts: long titles are cut and the list shrinks to fit LinkedIn\'s 3,000 characters', () => {
  const long = Array.from({ length: 10 }, (_, i) => job(i, `Frontend Engineer ${'x'.repeat(200)}`, 40 - i, `Company${i}${'y'.repeat(150)}`));
  const { posts } = buildDigest(baseData({ candidates: long }));
  // Escaped as it's sent, with room for the longest hook Groq may write.
  for (const post of posts.slice(1)) assert.ok(littleText(post).length <= 3000 - 320, String(littleText(post).length));
  assert.ok(posts[1].match(/^Link: /gm).length < 10);
  assert.match(posts[1], /^1\. \[40\] 🎨 Frontend Engineer x+… at Company0/m);
  const crowded = Array.from({ length: 10 }, (_, i) => job(i, `Frontend (${'['.repeat(60)}) Engineer`, 40 - i, `Co*${'_'.repeat(150)}`));
  assert.ok(littleText(buildDigest(baseData({ candidates: crowded })).posts[1]).length <= 3000 - 320, 'escapes count too');
});

test('post 1: a busy day\'s shipped list gives way so the post fits LinkedIn', () => {
  const shipped = Array.from({ length: 30 }, (_, i) => ({ number: i, title: `Pull request ${i}: ${'x'.repeat(120)}`, url: 'u' }));
  const [post1] = buildDigest(baseData({ shipped })).posts;
  assert.ok(littleText(post1).length <= 3000, String(littleText(post1).length));
  assert.match(post1, /\n→ …and \d+ more\n/);
  assert.match(post1, /\nWhat broke:\n.*\n\nFree, no sign-up: .*\n\n#BuildInPublic/);
});

test('buildDigest: the email says when each post goes out', () => {
  const postAt = postSlots(3, new Date('2026-10-05T00:10:00Z'));
  const { text, posts } = buildDigest({ ...baseData(), postAt });
  assert.match(text, /These post themselves on LinkedIn at 09:00, 15:00 and 21:00 IST\./);
  assert.match(text, /== Post 3: today's jobs \(hook B\) · posts itself at 21:00 IST/);
  assert.equal(posts.length, 3);
});

test('buildDigest: no new software jobs means no jobs posts, and says so', () => {
  const { text } = buildDigest(baseData({ candidates: [job(1, 'Account Executive', 30)] }));
  assert.ok(!text.includes("today's jobs"));
  assert.match(text, /skip the jobs posts today/);
});
