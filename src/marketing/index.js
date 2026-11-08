// The morning job: writes the day's posts, queues the LinkedIn ones and emails
// them to the owner with the X posts and the outreach numbers.
const fs = require('fs');
const linkedin = require('../linkedin');
const outreach = require('../outreach');
const { smtpTransport } = require('../digest');
const { writePost, blogSource, storySource } = require('./posts');
const { logger } = require('../utils');

const SITE = 'https://whatrunsindia.com';
const DAY_KEY = 'marketing_day';
const IST_MS = 330 * 60 * 1000;
const START_HOUR_IST = 7;
let running = false;
let lastTry = 0;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Numbers from the daily store scan, once there are enough stores to mean
// something. All of them are worked out here, so the post can only repeat them.
async function scanSource(pool) {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*)::int AS brands,
            COALESCE(SUM((facts->'scan'->>'sampled')::int), 0)::int AS products,
            COALESCE(SUM((facts->'scan'->>'thin')::int), 0)::int AS thin,
            COALESCE(SUM((facts->'scan'->>'single')::int), 0)::int AS single
     FROM outreach_brands`
  );
  if (r.brands < 50 || !r.products) return null;
  const percent = (n) => Math.round((n / r.products) * 100);
  return {
    kind: 'data',
    link: SITE,
    allowProduct: false,
    text: `I checked the product pages of ${r.brands} Shopify brands. Out of ${r.products} products, ${r.thin} have 2 photos or fewer, which is ${percent(r.thin)}%, and ${r.single} have just 1 photo, which is ${percent(r.single)}%.`,
  };
}

async function todaysSources(pool, n) {
  const sources = [await blogSource(n), n % 2 ? storySource(n) : (await scanSource(pool)) || storySource(n), storySource(n + 3)];
  return sources;
}

const ist = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function buildMorningEmail({ date, linkedinPosts, xPosts, numbers, problems }) {
  const replies = numbers.replies.length;
  const subject = `WhatRunsIndia today · ${date} · ${numbers.sent24h} emails sent · ${replies} ${replies === 1 ? 'reply' : 'replies'}`;
  const status = numbers.pausedUntil
    ? `Sending is PAUSED until ${numbers.pausedUntil.toISOString()}`
    : numbers.enabled ? 'Sending is on' : 'Sending is off (OUTREACH_ENABLED isn\'t 1)';
  const stats = [
    ['Sent, last 24 hours', numbers.sent24h],
    ['Sent, all time', numbers.sentTotal],
    ['Brands found', numbers.brands],
    ['Brands that replied', numbers.replied],
    ['Waiting for a first email', numbers.waiting],
    ['Bounced addresses', numbers.bounced],
  ];
  const replyLines = numbers.replies.map((r) => `${r.name} (${r.domain}): ${r.reply_from}, "${r.reply_subject}"`);

  const text = [
    `WhatRunsIndia today · ${date}`,
    status,
    '',
    ...(replyLines.length ? ['== REPLIES: answer these first ==', ...replyLines, ''] : []),
    ...linkedinPosts.flatMap((p, i) => [`== LinkedIn ${i + 1}${p.at ? ` · posts itself at ${ist(p.at)} IST` : ' · not auto-posted today'} ==`, p.text, '']),
    '== For X (copy and post) ==',
    ...xPosts.flatMap((x) => [x, '']),
    '== Outreach ==',
    ...stats.map(([k, v]) => `${k}: ${v}`),
    ...(problems.length ? ['', '== Problems ==', ...problems] : []),
  ].join('\n');

  const h2 = (t) => `<h2 style="font-size:15px;margin:26px 0 8px;color:#0C0A09">${escapeHtml(t)}</h2>`;
  const block = (t) => `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#F5F5F4;border-radius:8px;padding:12px;margin:0 0 10px">${escapeHtml(t)}</pre>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#292524;font-size:14px;line-height:1.5">
  <h1 style="font-size:20px;margin:0 0 4px">WhatRunsIndia today · ${escapeHtml(date)}</h1>
  <p style="margin:0 0 12px;color:#78716C">${escapeHtml(status)}</p>
  ${replyLines.length ? `${h2('Replies: answer these first')}<ul style="padding-left:18px;margin:0">${replyLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
  ${linkedinPosts.map((p, i) => `${h2(`LinkedIn ${i + 1}${p.at ? ` · posts itself at ${ist(p.at)} IST` : ' · not auto-posted today'}`)}${block(p.text)}`).join('\n  ')}
  ${h2('For X: copy and post')}
  ${xPosts.map(block).join('\n  ')}
  ${h2('Outreach')}
  <table style="border-collapse:collapse">${stats.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#78716C">${escapeHtml(k)}</td><td style="font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}</table>
  ${problems.length ? `${h2('Problems')}<ul style="padding-left:18px;margin:0">${problems.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
</div>`;
  return { subject, text, html };
}

async function buildDay(pool, now, { queue = true } = {}) {
  const n = Math.floor(now.getTime() / 86400000);
  const images = fs.readdirSync(linkedin.ASSETS).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  const problems = [];
  const sources = await todaysSources(pool, n);
  const drafts = [];
  for (const source of sources) {
    const draft = await writePost(source);
    if (draft.problem) problems.push(`${source.kind} post dropped: ${draft.problem}`);
    drafts.push({ ...draft, source });
  }

  const written = drafts.slice(0, 2).filter((d) => d.post);
  const slots = queue && linkedin.enabled() ? linkedin.postSlots(now) : [];
  const posts = written.map((d, i) => ({ text: `${d.post} ${d.source.link}`, image: images.length ? images[(n + i) % images.length] : null }));
  let linkedinPosts = posts.map((p, i) => ({ text: p.text, at: slots[i] || null }));
  if (slots.length && posts.length) {
    try {
      if (!(await linkedin.schedulePosts(pool, posts, slots))) {
        // A retry after a failed email: what will actually go out is what's queued.
        const { rows } = await pool.query(`SELECT text, post_at FROM linkedin_posts WHERE day = (NOW() AT TIME ZONE 'UTC')::date ORDER BY position`);
        linkedinPosts = rows.map((r) => ({ text: r.text, at: new Date(r.post_at) }));
      }
    } catch (err) {
      problems.push(`Queueing LinkedIn posts failed: ${err.message}`);
      linkedinPosts = posts.map((p) => ({ text: p.text, at: null }));
    }
  }
  const failures = await pool.query(`SELECT post_at, error FROM linkedin_posts WHERE error IS NOT NULL AND post_at >= NOW() - INTERVAL '24 hours' ORDER BY post_at`);
  for (const f of failures.rows) {
    problems.push(`LinkedIn post due ${ist(new Date(f.post_at))} IST: ${f.error}${/HTTP 401/.test(f.error) ? ' (the token expired: make a new one at https://www.linkedin.com/developers/tools/oauth/token-generator and set LINKEDIN_ACCESS_TOKEN in the VM\'s .env)' : ''}`);
  }
  return { linkedinPosts, xPosts: drafts.filter((d) => d.x).map((d) => d.x), problems };
}

// Runs every 10 minutes and does the day's work once, from 07:00 IST.
async function morning(pool, now = new Date()) {
  if (running) return;
  const local = new Date(now.getTime() + IST_MS);
  if (local.getUTCHours() < START_HOUR_IST) return;
  const date = local.toISOString().slice(0, 10);
  const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [DAY_KEY]);
  if (rows[0]?.value === date) return;
  // A refused email shouldn't mean another try every 10 minutes all day.
  if (now.getTime() - lastTry < 3600000) return;
  lastTry = now.getTime();

  running = true;
  try {
    const day = await buildDay(pool, now);
    const numbers = await outreach.report(pool);
    const email = buildMorningEmail({ date, ...day, numbers });
    const from = process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER;
    await smtpTransport().sendMail({ from: `WhatRunsIndia <${from}>`, to: process.env.DIGEST_EMAIL_TO || from, subject: email.subject, text: email.text, html: email.html });
    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [DAY_KEY, date]
    );
    logger.info(`Marketing email sent for ${date}`);
  } finally {
    running = false;
  }
}

module.exports = { morning, buildDay, buildMorningEmail };
