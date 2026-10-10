// Publishes the digest's LinkedIn posts on the user's profile, 6 hours apart.
// Off until LINKEDIN_ACCESS_TOKEN is set: a 60-day token from LinkedIn's
// token generator for an app with "Share on LinkedIn" and "Sign In with
// LinkedIn using OpenID Connect" (scopes openid, profile, w_member_social).
const { logger, timeLimit } = require('../utils');

// ponytail: LinkedIn retires each API version about a year after release.
// When posts fail with a version error, bump this to a recent YYYYMM.
const API_VERSION = '202609';
// 09:00 IST, then 15:00 and 21:00 (the last one is the US morning).
const FIRST_SLOT_UTC = [3, 30];
const GAP_MS = 6 * 60 * 60 * 1000;
// A post this late (the scraper was down) is skipped rather than published
// minutes before the next one.
const MAX_LATE_MS = 60 * 60 * 1000;

const enabled = () => Boolean(process.env.LINKEDIN_ACCESS_TOKEN);

// Today's fixed slots still ahead of `now`, at most `count`. A late digest
// keeps the times and drops the posts that missed theirs, last ones first
// (the second jobs post is a repeat).
function postSlots(count, now = new Date()) {
  const first = new Date(now);
  first.setUTCHours(FIRST_SLOT_UTC[0], FIRST_SLOT_UTC[1], 0, 0);
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * GAP_MS)).filter((slot) => slot >= now);
}

// Post text is LinkedIn's "little" format, where these characters only show
// as plain text when escaped (and our posts are full of parentheses). A '#'
// that starts a word stays a hashtag.
function littleText(text) {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&').replace(/(^|\s)\\#(?=[A-Za-z])/g, '$1#');
}

// One set of posts per UTC day, so a second digest (a manual send) can't
// double-post. All or nothing: the set goes in as one transaction, and the
// (day, position) key makes a concurrent digest wait, then find the day taken.
// Queues one post per slot; false when the day's posts are already queued.
async function schedulePosts(pool, texts, slots) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, text] of texts.slice(0, slots.length).entries()) {
      const { rowCount } = await client.query(
        `INSERT INTO linkedin_posts (day, position, text, post_at)
         VALUES ((NOW() AT TIME ZONE 'UTC')::date, $1, $2, $3)
         ON CONFLICT (day, position) DO NOTHING`,
        [i, text, slots[i]]
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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
  // Claimed before publishing: if the result can't be recorded, the post keeps
  // this error, so it's never published twice and the next digest lists it.
  const { rows } = await pool.query(
    `UPDATE linkedin_posts SET error = 'publishing, result not recorded: check LinkedIn before posting it again'
     WHERE id = (SELECT id FROM linkedin_posts
                 WHERE posted_at IS NULL AND error IS NULL AND post_at <= NOW()
                 ORDER BY post_at LIMIT 1)
     RETURNING id, text, post_at`
  );
  const post = rows[0];
  if (!post) return;
  if (Date.now() - post.post_at > MAX_LATE_MS) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, 'skipped: more than an hour late (the scraper was down)']);
    return;
  }
  let urn;
  try {
    urn = await publish(post.text);
  } catch (err) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, err.message]);
    logger.error(`LinkedIn post ${post.id} failed: ${err.message}`);
    return;
  }
  await pool.query('UPDATE linkedin_posts SET posted_at = NOW(), post_urn = $2, error = NULL WHERE id = $1', [post.id, urn]);
  logger.info(`Posted to LinkedIn: ${urn}`);
}

module.exports = { enabled, postSlots, littleText, schedulePosts, postDue };
