const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../config');
const { logger, timeLimit } = require('../utils');
const { buildDigest, copyFacts } = require('./content');
const { writeCopy } = require('./writer');
const linkedin = require('../linkedin');

const REPO = 'rishilahoti/ashby-job-scraper';

// What shipped, for the build-in-public post. Public repo, so no token needed;
// dependabot bumps aren't news. Best effort: the digest goes out without it.
async function fetchShipped(since) {
  try {
    const res = await timeLimit(fetch(
      `https://api.github.com/repos/${REPO}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=30`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ashby-jobs-digest' }, signal: AbortSignal.timeout(10000) }
    ), 10000);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const pulls = await timeLimit(res.json(), 10000);
    return pulls
      .filter((p) => p.merged_at && new Date(p.merged_at) >= since && !p.user?.login?.endsWith('[bot]'))
      .map((p) => ({ number: p.number, title: p.title, url: p.html_url }));
  } catch (err) {
    logger.warn(`Digest: couldn't list merged PRs (${err.message})`);
    return [];
  }
}

// `since` scopes this digest's window (its scrape_runs rows and the jobs
// inserted). `companiesSince` can be set wider for companies and shipped PRs;
// runDigest uses the same window for both.
async function collectDigestData(pool, { since, companiesSince }) {
  // Same score as web/lib/query.ts SCORE_EXPR, so "highest score" means what the feed shows.
  const { freshnessBoostHours, freshnessBoost } = config.intelligence.rules;
  const hours = Number(freshnessBoostHours) || 0;
  const boost = Number(freshnessBoost) || 0;
  const score = hours && boost
    ? `base_score + CASE WHEN published_at >= date_trunc('day', NOW()) - INTERVAL '${hours} hours' THEN ${boost} ELSE 0 END`
    : 'base_score';

  const [candidates, run, failures, newCompanies, totals, users, shipped, linkedinErrors] = await Promise.all([
    // Only jobs that newly appeared on a board we already tracked. A company
    // added in this window brings its whole backlog, months-old postings that
    // are new to us but not to job seekers, and Workday and Pinpoint give no
    // posting date (the adapters stamp the scrape time), so the date check
    // alone can't catch those. Day-truncated because several ATSs give only a
    // posting date, which lands on midnight UTC.
    pool.query(
      `SELECT job_id, company, title, location, remote, team, department, (${score})::int AS score
       FROM jobs
       WHERE is_active = TRUE AND created_at >= $1
         AND (published_at IS NULL OR published_at >= date_trunc('day', $1::timestamptz))
         AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = jobs.company AND c.created_at >= $1)
       ORDER BY score DESC, published_at DESC NULLS LAST
       LIMIT 500`,
      [since]
    ),
    // A window can hold several runs (each scraper restart runs one), so
    // companies are counted once. Job counts can be summed: each change
    // happens in exactly one run. "New" skips boards added in this window,
    // for the same backlog reason as above: the posts call these jobs "posted
    // yesterday".
    pool.query(
      `SELECT COUNT(DISTINCT company)::int AS scraped,
              COALESCE(SUM(jobs_inserted) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM companies c WHERE c.name = scrape_runs.company AND c.created_at >= $1
              )), 0)::int AS new,
              COALESCE(SUM(jobs_updated), 0)::int AS updated,
              COALESCE(SUM(jobs_removed), 0)::int AS removed
       FROM scrape_runs WHERE started_at >= $1`,
      [since]
    ),
    // Companies whose latest attempt failed. last_ok (last_scraped_at only
    // moves on success) separates boards that just broke from long-dead ones.
    pool.query(
      `SELECT l.company, l.error_message,
              (SELECT MAX(c.last_scraped_at) FROM companies c WHERE c.name = l.company) AS last_ok
       FROM (
         SELECT DISTINCT ON (company) company, status, error_message
         FROM scrape_runs WHERE started_at >= $1
         ORDER BY company, started_at DESC
       ) l
       WHERE l.status = 'error'
       ORDER BY last_ok DESC NULLS LAST, l.company`,
      [since]
    ),
    pool.query(
      `SELECT c.name, c.source,
              (SELECT COUNT(*) FROM jobs j WHERE j.company = c.name AND j.is_active = TRUE)::int AS jobs
       FROM companies c WHERE c.created_at >= $1 ORDER BY jobs DESC, c.name`,
      [companiesSince]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS jobs,
              COUNT(DISTINCT LOWER(TRIM(company)))::int AS companies,
              ARRAY_AGG(DISTINCT source ORDER BY source) AS sources
       FROM jobs WHERE is_active = TRUE`
    ),
    // The web app's auth table; absent in a scraper-only database.
    pool.query('SELECT COUNT(*)::int AS count FROM users').then((r) => r.rows[0].count, () => null),
    fetchShipped(companiesSince),
    // Posts that failed or were skipped since the last digest (src/linkedin).
    pool.query('SELECT post_at, error FROM linkedin_posts WHERE error IS NOT NULL AND post_at >= $1 ORDER BY post_at', [since])
      .then((r) => r.rows, () => []),
  ]);

  return {
    date: new Date(),
    run: { ...run.rows[0], failed: failures.rows.length },
    failures: failures.rows,
    newCompanies: newCompanies.rows,
    totals: totals.rows[0],
    users,
    shipped,
    linkedinErrors,
    candidates: candidates.rows.map((r) => ({
      jobId: r.job_id,
      company: r.company,
      title: r.title,
      location: r.location,
      remote: r.remote,
      team: r.team,
      department: r.department,
      score: r.score,
    })),
  };
}

// Same env vars as the web app's mailer (web/lib/mailer.ts).
function smtpTransport() {
  const host = process.env.EMAIL_SERVER_HOST;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.EMAIL_SERVER_PORT || 587);
  // Bounded waits: the scrape keeps its run lock until the digest is sent.
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 30000, greetingTimeout: 30000, socketTimeout: 60000,
  });
}

const SENT_KEY = 'digest_sent_at';

// When the previous digest went out, or null before the first one.
async function lastDigestAt(pool) {
  const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [SENT_KEY]);
  return rows[0] ? new Date(rows[0].value) : null;
}

// Each digest covers everything since the previous one was sent: nothing
// shows up twice, and jobs a restart run found during the day aren't missed.
// Without a previous send, it covers the last 23 hours.
async function runDigest(pool, { since, dryRun = false } = {}) {
  const until = new Date();
  if (!since) since = (await lastDigestAt(pool)) || new Date(until - 23 * 60 * 60 * 1000);
  const data = await collectDigestData(pool, { since, companiesSince: since });
  const { copy, note } = await writeCopy(copyFacts(data));
  // Four slots; a day without new software jobs uses only the first.
  const postAt = linkedin.enabled() ? linkedin.postSlots(4) : null;
  const email = buildDigest({ ...data, copy, copyNote: note, postAt });

  if (dryRun) {
    fs.mkdirSync(config.notify.reportsDir, { recursive: true });
    const base = path.join(config.notify.reportsDir, `digest-${new Date().toISOString().slice(0, 10)}`);
    fs.writeFileSync(`${base}.html`, email.html);
    fs.writeFileSync(`${base}.txt`, email.text);
    logger.info(`Digest preview written to ${base}.html and ${base}.txt`);
    return email;
  }

  const transport = smtpTransport();
  if (!transport) {
    logger.warn('Daily digest not sent: set EMAIL_SERVER_HOST, EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD');
    return email;
  }
  const from = process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER;
  const to = process.env.DIGEST_EMAIL_TO || 'rishilahoti99@gmail.com';
  await transport.sendMail({ from: `Ashby Jobs <${from}>`, to, subject: email.subject, text: email.text, html: email.html });
  logger.info(`Daily digest sent to ${to}`);
  // Best effort: the email already has every post to copy by hand.
  if (postAt) {
    try {
      if (await linkedin.schedulePosts(pool, email.posts, postAt)) logger.info(`Queued ${email.posts.length} LinkedIn posts`);
    } catch (err) {
      logger.error(`Queueing LinkedIn posts failed: ${err.message}`);
    }
  }
  // Where the next digest starts. `until` is when this one began collecting,
  // so nothing that arrived while it was being built is skipped.
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SENT_KEY, until.toISOString()]
  );
  return email;
}

module.exports = { runDigest, collectDigestData, lastDigestAt };
