const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../config');
const { logger } = require('../utils');
const { buildDigest } = require('./content');

const REPO = 'rishilahoti/ashby-job-scraper';

// What shipped, for the build-in-public post. Public repo, so no token needed;
// dependabot bumps aren't news. Best effort: the digest goes out without it.
async function fetchShipped(since) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=30`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ashby-jobs-digest' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const pulls = await res.json();
    return pulls
      .filter((p) => p.merged_at && new Date(p.merged_at) >= since && !p.user?.login?.endsWith('[bot]'))
      .map((p) => ({ number: p.number, title: p.title, url: p.html_url }));
  } catch (err) {
    logger.warn(`Digest: couldn't list merged PRs (${err.message})`);
    return [];
  }
}

// `since` scopes this scrape cycle (its scrape_runs rows and the jobs it
// inserted). `companiesSince` is wider: discovery adds companies at 03:00 UTC,
// hours before the nightly scrape.
async function collectDigestData(pool, { since, companiesSince }) {
  // Same score as web/lib/query.ts SCORE_EXPR, so "highest score" means what the feed shows.
  const { freshnessBoostHours, freshnessBoost } = config.intelligence.rules;
  const hours = Number(freshnessBoostHours) || 0;
  const boost = Number(freshnessBoost) || 0;
  const score = hours && boost
    ? `base_score + CASE WHEN published_at >= date_trunc('day', NOW()) - INTERVAL '${hours} hours' THEN ${boost} ELSE 0 END`
    : 'base_score';

  const [candidates, run, failures, newCompanies, totals, users, shipped] = await Promise.all([
    // A company added today also brings its months-old postings, which are
    // new to us but not to job seekers.
    pool.query(
      `SELECT job_id, company, title, location, remote, team, department, (${score})::int AS score
       FROM jobs
       WHERE is_active = TRUE AND created_at >= $1
         AND (published_at IS NULL OR published_at >= $1::timestamptz - INTERVAL '3 days')
       ORDER BY score DESC, published_at DESC NULLS LAST
       LIMIT 500`,
      [since]
    ),
    // A window can hold several runs (each scraper restart runs one), so
    // companies are counted once. Job counts can be summed: each change
    // happens in exactly one run.
    pool.query(
      `SELECT COUNT(DISTINCT company)::int AS scraped,
              COALESCE(SUM(jobs_inserted), 0)::int AS new,
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
  ]);

  return {
    date: new Date(),
    run: { ...run.rows[0], failed: failures.rows.length },
    failures: failures.rows,
    newCompanies: newCompanies.rows,
    totals: totals.rows[0],
    users,
    shipped,
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
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function runDigest(pool, { since, companiesSince = since, dryRun = false }) {
  const email = buildDigest(await collectDigestData(pool, { since, companiesSince }));

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
  return email;
}

module.exports = { runDigest };
