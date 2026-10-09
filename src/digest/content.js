// Pure builders for the daily digest email (no DB, no network), so
// test/digest.test.js can call them directly. src/digest/index.js gathers the
// data and sends the result.
const { classifyNiche, NICHE_LABELS } = require('./niche');
const { littleText } = require('../linkedin');

const SITE_URL = (process.env.SITE_URL || 'https://ashbyhq-scraper.vercel.app').replace(/\/+$/, '');
// First commit and Vercel project: day 1 of the build-in-public counter.
const LAUNCH_DATE = Date.UTC(2026, 1, 28);
const DAY_MS = 24 * 60 * 60 * 1000;

const SOURCE_NAMES = {
  ashby: 'Ashby', greenhouse: 'Greenhouse', lever: 'Lever', workable: 'Workable', recruitee: 'Recruitee',
  teamtailor: 'Teamtailor', pinpoint: 'Pinpoint', smartrecruiters: 'SmartRecruiters', workday: 'Workday', keka: 'Keka',
};

// CamelCase so screen readers say each word. Post 1 is for builders; the job
// posts pair tags job seekers follow with the day's own niches.
const BUILD_TAGS = '#BuildInPublic #IndieHackers #SideProject #SoloFounder #WebScraping #NodeJS #NextJS #PostgreSQL #WebDevelopment #JobSearch #TechJobs #Hiring';
const JOB_TAGS = ['#Hiring', '#NowHiring', '#JobOpenings', '#JobAlert', '#TechJobs', '#SoftwareJobs', '#SoftwareEngineering', '#SoftwareDeveloper', '#OpenToWork', '#JobSearch'];

function jobTags(jobs) {
  const count = {};
  for (const j of jobs) count[j.niche] = (count[j.niche] || 0) + 1;
  const niches = Object.keys(count).sort((a, b) => count[b] - count[a]).flatMap((n) => NICHE_LABELS[n].tags);
  const remote = jobs.some((j) => j.remote) ? ['#RemoteJobs'] : [];
  return [...new Set([...JOB_TAGS, ...remote, ...niches.slice(0, 6)])].join(' ');
}

// Each job with its link right under it. Titles are capped.
function jobList(jobs) {
  return jobs.flatMap((j, i) => {
    const title = j.title.length > 70 ? `${j.title.slice(0, 69)}…` : j.title;
    return [`${i + 1}. [${j.score}] ${NICHE_LABELS[j.niche].emoji} ${title} at ${j.company}${where(j) ? ` (${where(j)})` : ''}`, `Link: ${jobUrl(j)}`, ''];
  });
}

// Everything in a jobs post below its hook.
function jobsBody(data, jobs) {
  return [...jobList(jobs), `${fmt(data.run.new)} new jobs landed in the last 24 hours, straight from company career pages.`, '', jobTags(jobs)].join('\n');
}

// LinkedIn rejects posts over 3,000 characters, counted here after escaping.
const MAX_POST = 3000;
// The hooks are written after the jobs are picked: checkCopy caps a line at
// 160 characters, and escaping can at most double it.
const HOOK_ROOM = 2 * 160;

// Jobs come off the bottom until the whole escaped post fits with the longest
// possible hook. Always at least one.
function topJobs(data) {
  let jobs = pickTopJobs(data.candidates);
  while (jobs.length > 1 && littleText(`${'x'.repeat(HOOK_ROOM)}\n\n${jobsBody(data, jobs)}`).length > MAX_POST) jobs = jobs.slice(0, -1);
  return jobs;
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const jobUrl = (job) => `${SITE_URL}/jobs/${encodeURIComponent(job.jobId)}`;
const platforms = (sources) => joinAnd(sources.map((s) => SOURCE_NAMES[s] || s));

// A board that loaded within two days just broke: worth saying in public.
// One that hasn't loaded for longer usually moved to another job platform,
// which is cleanup for the email only.
function splitFailures(data) {
  const fresh = data.failures.filter((f) => f.last_ok && data.date - new Date(f.last_ok) <= 2 * DAY_MS);
  return { fresh, stale: data.failures.filter((f) => !fresh.includes(f)) };
}

function dayNumber(date) {
  return Math.floor((date.getTime() - LAUNCH_DATE) / DAY_MS) + 1;
}

function where(job) {
  if (job.remote) return 'Remote';
  const first = (job.location || '').split(/[;|•]/)[0].trim();
  return first.length > 32 ? `${first.slice(0, 31)}…` : first;
}

function listNames(names, max = 3) {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} +${fmt(names.length - max)} more` : shown;
}

function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// The jobs post: highest score first (candidates arrive sorted), software
// roles only, one entry per role (companies post the same title in several
// cities), and at most `perNiche` per niche so the post isn't ten AI roles.
// Tops up past the cap when there aren't enough niches to fill the list.
function pickTopJobs(candidates, limit = 10, perNiche = 3) {
  const seen = new Set();
  const pool = [];
  for (const job of candidates) {
    const niche = classifyNiche(job);
    const key = `${job.company}|${job.title}`.toLowerCase();
    if (!niche || seen.has(key)) continue;
    seen.add(key);
    pool.push({ ...job, niche });
  }

  const perNicheCount = {};
  const picked = [];
  for (const job of pool) {
    if (picked.length === limit) break;
    perNicheCount[job.niche] = (perNicheCount[job.niche] || 0) + 1;
    if (perNicheCount[job.niche] <= perNiche) picked.push(job);
  }
  for (const job of pool) {
    if (picked.length === limit) break;
    if (!picked.includes(job)) picked.push(job);
  }
  return picked.sort((a, b) => b.score - a.score);
}

// The hook when Groq's copy isn't available: still the day's sharpest fact.
function templateHook({ run }) {
  return run.removed > run.new
    ? `${fmt(run.removed)} jobs closed since yesterday. ${fmt(run.new)} new ones opened.`
    : `${fmt(run.new)} new jobs since yesterday, straight from company career pages.`;
}

// `copy` is Groq's wording (writer.js) and only ever words: every number
// here comes from the data.
function buildPost1(data, day) {
  const { run, newCompanies, totals, users, shipped, failures, copy } = data;
  const { fresh } = splitFailures(data);
  const lines = copy ? [copy.hook, ...(copy.hookLine2 ? [copy.hookLine2] : [])] : [templateHook(data)];
  lines.push('', `Day ${day} of building Ashby Jobs in public. Last 24 hours:`, `→ ${fmt(run.new)} new jobs`);
  if (newCompanies.length) {
    const noun = newCompanies.length === 1 ? 'company' : 'companies';
    lines.push(`→ ${fmt(newCompanies.length)} new ${noun} (${listNames(newCompanies.map((c) => c.name))})`);
  }
  if (run.removed) lines.push(`→ ${fmt(run.removed)} jobs closed or filled`);
  if (run.updated) lines.push(`→ ${fmt(run.updated)} listings updated`);
  lines.push('', `Now tracking ${fmt(totals.jobs)} live jobs from ${fmt(totals.companies)} companies across ${platforms(totals.sources)}.`);
  if (users) lines.push(`${fmt(users)} job seekers have signed up so far.`);
  // Groq returns '' for changes no job seeker would notice.
  const shippedLines = copy ? copy.shipped.filter(Boolean) : shipped.map((p) => p.title);
  const shippedAt = lines.length;
  lines.push('', 'What broke:');
  if (fresh.length) {
    const noun = fresh.length === 1 ? 'company job board' : 'company job boards';
    lines.push(`→ ${copy?.broke || `${fresh.length} ${noun} stopped loading: ${listNames(fresh.map((f) => f.company))}.`}`);
  } else {
    lines.push(failures.length ? '→ Nothing new. Every board that worked yesterday still works ✅' : '→ Nothing. Every job board loaded ✅');
  }
  lines.push('', ...(copy ? [copy.closer] : []), `Free, no sign-up: ${SITE_URL}`, '', BUILD_TAGS);
  // Up to 30 merged PRs can make the post too long for LinkedIn: the shipped
  // list gives way first, from the bottom.
  for (let n = shippedLines.length; ; n--) {
    const more = shippedLines.length - n;
    const shippedPart = shippedLines.length
      ? ['', 'Shipped:', ...shippedLines.slice(0, n).map((s) => `→ ${s}`), ...(more ? [`→ …and ${more} more`] : [])]
      : [];
    const post = [...lines.slice(0, shippedAt), ...shippedPart, ...lines.slice(shippedAt)].join('\n');
    if (!n || littleText(post).length <= MAX_POST) return post;
  }
}

// Posts 2 and 3 are the same list under different hooks, rotating through the
// pool so consecutive days don't repeat.
const HOOKS = [
  (c) => `${c.n} software jobs went live in the last 24 hours. Early applicants get seen first 👇`,
  (c) => `Most people find a job post weeks after it opens. These ${c.n} opened yesterday:`,
  (c) => `${c.total} tech jobs were posted yesterday. These are the ${c.n} I'd apply to first:`,
  (c) => `Skip the stale listings. ${c.n} fresh engineering roles, all less than a day old:`,
  (c) => `${c.niches ? `${c.niches}: ` : ''}${c.n} new dev roles from the last 24 hours 👇`,
  (c) => `Your next role might have opened last night. ${c.n} new software jobs:`,
  (c) => `No reposts, no ghost jobs. ${c.n} roles straight from company career pages, posted yesterday:`,
  (c) => `Looking for a dev job? Here are ${c.n} that didn't exist yesterday:`,
];

function buildJobPosts(data, picked, day) {
  if (!picked.length) return [];
  // "Software" is the catch-all label, not a niche worth naming in a hook.
  const niches = joinAnd([...new Set(picked.filter((j) => j.niche !== 'software').map((j) => NICHE_LABELS[j.niche].name))].slice(0, 4));
  const ctx = { n: picked.length, total: fmt(data.run.new), niches };
  const body = jobsBody(data, picked);
  // Two posts, 6 hours apart. 3 is coprime with the pool size (8), so their
  // hooks are always distinct.
  const hooks = data.copy?.jobHooks || [0, 1].map((k) => HOOKS[(day + k * 3) % HOOKS.length](ctx));
  return hooks.map((hook) => `${hook}\n\n${body}`);
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildDigest(data) {
  const day = dayNumber(data.date);
  const picked = topJobs(data);
  const post1 = buildPost1(data, day);
  const jobPosts = buildJobPosts(data, picked, day);
  const { run, totals, newCompanies, shipped, users } = data;
  const { fresh, stale } = splitFailures(data);
  const dateLabel = data.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const subject = `Ashby Jobs daily · ${dateLabel} · +${fmt(run.new)} jobs · +${newCompanies.length} companies`;

  const numbers = [
    ['New jobs', fmt(run.new)],
    ['Updated', fmt(run.updated)],
    ['Closed or filled', fmt(run.removed)],
    ['New companies', String(newCompanies.length)],
    ['Live jobs', `${fmt(totals.jobs)} from ${fmt(totals.companies)} companies on ${platforms(totals.sources)}`],
    ['Boards scraped', `${fmt(run.scraped)} (${fresh.length} newly broken, ${stale.length} failing for 2+ days)`],
    ...(users ? [['Signed-up users', fmt(users)]] : []),
  ];
  // IST: the one person reading this is in India.
  const ist = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  // A late digest gets fewer slots than posts (postSlots).
  const when = (i) => (data.postAt ? (data.postAt[i] ? ` · posts itself at ${ist(data.postAt[i])} IST` : ' · not posted: its time today has passed') : '');
  const intro = data.postAt
    ? `these post themselves on LinkedIn at ${joinAnd(data.postAt.slice(0, 1 + jobPosts.length).map(ist))} IST`
    : 'posts below are ready to copy into LinkedIn';
  const posts = [
    [`Post 1: platform update${when(0)}`, post1],
    ...jobPosts.map((p, i) => [`Post ${i + 2}: today's jobs (hook ${'AB'[i]})${when(i + 1)}`, p]),
  ];
  const noJobsNote = picked.length ? '' : 'No new software jobs in this window, so skip the jobs posts today.';
  const jobLines = picked.map((j, i) => `${i + 1}. [${j.score}] ${NICHE_LABELS[j.niche].name} · ${j.title} at ${j.company}${where(j) ? ` · ${where(j)}` : ''} · ${jobUrl(j)}`);
  // Discovery can add hundreds of companies in one day; list the biggest.
  const companyLines = newCompanies.slice(0, 20).map((c) => `${c.name} (${c.source}, ${fmt(c.jobs)} live jobs)`);
  if (newCompanies.length > 20) companyLines.push(`…and ${fmt(newCompanies.length - 20)} more`);
  const shippedLines = shipped.map((p) => `#${p.number} ${p.title} · ${p.url}`);
  const failureLines = [
    ...fresh.map((f) => `${f.company}: ${f.error_message || 'unknown error'}`),
    ...(stale.length
      ? [`${stale.length} boards failing for 2+ days (a 404 usually means the company moved job platforms; remove or re-add them): ${listNames(stale.map((f) => f.company), 40)}`]
      : []),
    // LinkedIn tokens last 60 days; a 401 means it's time for a new one.
    ...(data.linkedinErrors || []).map((e) => `LinkedIn post due ${ist(new Date(e.post_at))} IST: ${e.error}${/HTTP 401/.test(e.error)
      ? ' (the token expired: make a new one at https://www.linkedin.com/developers/tools/oauth/token-generator and set LINKEDIN_ACCESS_TOKEN in the VM\'s .env)'
      : ''}`),
  ];

  const textSection = (title, lines) => (lines.length ? [`== ${title} ==`, ...lines, ''] : []);
  const text = [
    `Ashby Jobs daily digest · ${dateLabel} · day ${day}`,
    `${intro[0].toUpperCase()}${intro.slice(1)}. ${data.copyNote || ''}`.trim(),
    '',
    ...textSection('Numbers', numbers.map(([k, v]) => `${k}: ${v}`)),
    ...(noJobsNote ? [noJobsNote, ''] : []),
    ...posts.flatMap(([title, body]) => [`== ${title} (copy everything between the lines) ==`, '----------', body, '----------', '']),
    ...textSection('Top new jobs (score · niche · link)', jobLines),
    ...textSection('New companies', companyLines),
    ...textSection('Shipped in the last 24h', shippedLines),
    ...textSection('What broke', failureLines),
    `Feed: ${SITE_URL}`,
  ].join('\n');

  const h2 = (title) => `<h2 style="font-size:15px;margin:28px 0 8px;color:#0C0A09">${escapeHtml(title)}</h2>`;
  const list = (title, lines) => (lines.length
    ? `${h2(title)}<ul style="padding-left:18px;margin:0">${lines.map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join('')}</ul>`
    : '');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#292524;font-size:14px;line-height:1.5">
  <h1 style="font-size:20px;margin:0 0 4px">Ashby Jobs daily · ${escapeHtml(dateLabel)}</h1>
  <p style="margin:0 0 16px;color:#78716C">Day ${day} · ${escapeHtml(intro)}${data.copyNote ? `<br>${escapeHtml(data.copyNote)}` : ''}</p>
  <table style="border-collapse:collapse;width:100%">${numbers.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#78716C;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}</table>
  ${noJobsNote ? `<p style="margin:16px 0;color:#B45309">${escapeHtml(noJobsNote)}</p>` : ''}
  ${posts.map(([title, body]) => `${h2(title)}<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#F5F5F4;border-radius:8px;padding:12px;margin:0">${escapeHtml(body)}</pre>`).join('\n  ')}
  ${list('Top new jobs (score · niche · link)', jobLines)}
  ${list('New companies', companyLines)}
  ${list('Shipped in the last 24h', shippedLines)}
  ${list('What broke', failureLines)}
  <p style="margin:28px 0 0;font-size:12px;color:#A8A29E"><a href="${escapeHtml(SITE_URL)}" style="color:#473bce">${escapeHtml(SITE_URL)}</a></p>
</div>`;

  return { subject, text, html, posts: [post1, ...jobPosts] };
}

// What Groq may write about (writer.js): every number in its copy has to
// appear in here.
function copyFacts(data) {
  const picked = topJobs(data);
  const { fresh } = splitFailures(data);
  const { run, newCompanies, totals, users, shipped } = data;
  return {
    window: 'last 24 hours',
    newJobs: run.new,
    closedJobs: run.removed,
    moreJobsClosedThanOpened: run.removed > run.new,
    updatedListings: run.updated,
    newCompanies: newCompanies.length,
    newCompanyExamples: newCompanies.slice(0, 3).map((c) => c.name),
    liveJobs: totals.jobs,
    companies: totals.companies,
    platforms: totals.sources.map((s) => SOURCE_NAMES[s] || s),
    signedUpUsers: users,
    shipped: shipped.map((p) => p.title),
    broke: { boards: fresh.length, companies: fresh.slice(0, 3).map((f) => f.company) },
    jobsPost: {
      count: picked.length,
      niches: [...new Set(picked.map((j) => NICHE_LABELS[j.niche].name))],
      jobs: picked.map((j) => `${j.title} at ${j.company}${where(j) ? ` (${where(j)})` : ''}`),
    },
  };
}

module.exports = { buildDigest, pickTopJobs, copyFacts };
