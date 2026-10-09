// Publishes the digest's LinkedIn posts on the user's profile, 4 hours apart.
// Off until LINKEDIN_ACCESS_TOKEN is set: a 60-day token from LinkedIn's
// token generator for an app with "Share on LinkedIn" and "Sign In with
// LinkedIn using OpenID Connect" (scopes openid, profile, w_member_social).
const { logger, timeLimit } = require('../utils');

// ponytail: LinkedIn retires each API version about a year after release.
// When posts fail with a version error, bump this to a recent YYYYMM.
const API_VERSION = '202609';
// 09:00 IST, then 13:00, 17:00 and 21:00 (the last one is the US morning).
const FIRST_SLOT_UTC = [3, 30];
const GAP_MS = 4 * 60 * 60 * 1000;
// A post this late (the scraper was down) is skipped rather than published
// minutes before the next one.
const MAX_LATE_MS = 60 * 60 * 1000;

const enabled = () => Boolean(process.env.LINKEDIN_ACCESS_TOKEN);

// The day's first slot, or now when the digest is later than that.
function postSlots(count, now = new Date()) {
  const first = new Date(now);
  first.setUTCHours(FIRST_SLOT_UTC[0], FIRST_SLOT_UTC[1], 0, 0);
  const start = Math.max(first.getTime(), now.getTime());
  return Array.from({ length: count }, (_, i) => new Date(start + i * GAP_MS));
}

// Post text is LinkedIn's "little" format, where these characters only show
// as plain text when escaped (and our posts are full of parentheses). A '#'
// that starts a word stays a hashtag.
function littleText(text) {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&').replace(/(^|\s)\\#(?=[A-Za-z])/g, '$1#');
}

// One set of posts per UTC day, so a second digest (a manual send) can't
// double-post.
async function schedulePosts(pool, texts, slots) {
  const { rows } = await pool.query(
    `SELECT 1 FROM linkedin_posts WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' LIMIT 1`
  );
  if (rows.length) return false;
  for (const [i, text] of texts.entries()) {
    await pool.query('INSERT INTO linkedin_posts (text, post_at) VALUES ($1, $2)', [text, slots[i]]);
  }
  return true;
}

async function request(path, body) {
  const res = await timeLimit(fetch(`https://api.linkedin.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      ...(path.startsWith('/rest/') ? { 'LinkedIn-Version': API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  }), 30000);
  if (!res.ok) throw new Error(`LinkedIn ${path}: HTTP ${res.status} ${(await timeLimit(res.text(), 10000)).slice(0, 300)}`);
  return res;
}

async function publish(text) {
  const me = await timeLimit((await request('/v2/userinfo')).json(), 30000);
  const res = await request('/rest/posts', {
    author: `urn:li:person:${me.sub}`,
    commentary: littleText(text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  return res.headers.get('x-restli-id');
}

// Runs every 10 minutes: publishes the next post whose time has come.
// ponytail: no retries; a duplicate post on someone's profile is worse than a
// missed one, and the next digest lists the failure.
async function postDue(pool) {
  const { rows } = await pool.query(
    `SELECT id, text, post_at FROM linkedin_posts
     WHERE posted_at IS NULL AND error IS NULL AND post_at <= NOW()
     ORDER BY post_at LIMIT 1`
  );
  const post = rows[0];
  if (!post) return;
  if (Date.now() - post.post_at > MAX_LATE_MS) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, 'skipped: more than an hour late (the scraper was down)']);
    return;
  }
  try {
    const urn = await publish(post.text);
    await pool.query('UPDATE linkedin_posts SET posted_at = NOW(), post_urn = $2 WHERE id = $1', [post.id, urn]);
    logger.info(`Posted to LinkedIn: ${urn}`);
  } catch (err) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, err.message]);
    logger.error(`LinkedIn post ${post.id} failed: ${err.message}`);
  }
}

module.exports = { enabled, postSlots, littleText, schedulePosts, postDue };
