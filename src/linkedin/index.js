// Publishes the WhatRunsIndia posts on the user's profile, with an image.
// Off until LINKEDIN_ACCESS_TOKEN is set: a 60-day token from LinkedIn's
// token generator for an app with "Share on LinkedIn" and "Sign In with
// LinkedIn using OpenID Connect" (scopes openid, profile, w_member_social).
const fs = require('fs');
const path = require('path');
const { logger, delay, timeLimit } = require('../utils');

// ponytail: LinkedIn retires each API version about a year after release.
// When posts fail with a version error, bump this to a recent YYYYMM.
const API_VERSION = '202609';
// 10:00 and 18:00 IST: studies put the best windows in the late morning and
// early evening, and two posts need 8 hours between them to not eat each other.
const SLOTS_UTC = [[4, 30], [12, 30]];
// A post this late (the scraper was down) is skipped rather than published
// minutes before the next one.
const MAX_LATE_MS = 60 * 60 * 1000;
const ASSETS = path.join(__dirname, '../../assets/social');
// LinkedIn processes an upload after accepting it, and a member token can't ask
// when it's done. A post made too early shows up without its image.
const IMAGE_READY_MS = 20000;
const IMAGE_ALT = 'A plain product photo beside the finished photoshoot image made from it';

const enabled = () => Boolean(process.env.LINKEDIN_ACCESS_TOKEN);

// Today's slots still ahead of `now`; weekends have none.
function postSlots(now = new Date()) {
  if ([0, 6].includes(now.getUTCDay())) return [];
  return SLOTS_UTC.map(([hour, minute]) => {
    const slot = new Date(now);
    slot.setUTCHours(hour, minute, 0, 0);
    return slot;
  }).filter((slot) => slot >= now);
}

// Post text is LinkedIn's "little" format, where these characters only show
// as plain text when escaped (and our posts are full of parentheses). A '#'
// that starts a word stays a hashtag.
function littleText(text) {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&').replace(/(^|\s)\\#(?=[A-Za-z])/g, '$1#');
}

// One set of posts per UTC day, so a second run can't double-post. All or
// nothing: the set goes in as one transaction, and the (day, position) key
// makes a concurrent run wait, then find the day taken.
// Queues one post per slot; false when the day's posts are already queued.
async function schedulePosts(pool, posts, slots) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, post] of posts.slice(0, slots.length).entries()) {
      const { rowCount } = await client.query(
        `INSERT INTO linkedin_posts (day, position, text, image, post_at)
         VALUES ((NOW() AT TIME ZONE 'UTC')::date, $1, $2, $3, $4)
         ON CONFLICT (day, position) DO NOTHING`,
        [i, post.text, post.image, slots[i]]
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

async function request(apiPath, body) {
  const res = await timeLimit(fetch(`https://api.linkedin.com${apiPath}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      ...(apiPath.startsWith('/rest/') ? { 'LinkedIn-Version': API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  }), 30000);
  if (!res.ok) throw new Error(`LinkedIn ${apiPath}: HTTP ${res.status} ${(await timeLimit(res.text(), 10000)).slice(0, 300)}`);
  return res;
}

// LinkedIn's API never reads a page's og:image, so the picture is uploaded.
async function uploadImage(file, owner) {
  const res = await request('/rest/images?action=initializeUpload', { initializeUploadRequest: { owner } });
  const { value } = await timeLimit(res.json(), 30000);
  const put = await timeLimit(fetch(value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
    body: fs.readFileSync(path.join(ASSETS, file)),
    signal: AbortSignal.timeout(60000),
  }), 60000);
  if (!put.ok) throw new Error(`LinkedIn image upload: HTTP ${put.status}`);
  await delay(IMAGE_READY_MS);
  return value.image;
}

async function publish(text, image, lifecycleState = 'PUBLISHED') {
  const me = await timeLimit((await request('/v2/userinfo')).json(), 30000);
  const author = `urn:li:person:${me.sub}`;
  let content;
  // A post without its picture beats no post at all.
  if (image) {
    try {
      content = { media: { id: await uploadImage(image, author), altText: IMAGE_ALT } };
    } catch (err) {
      logger.warn(`Posting without an image: ${err.message}`);
    }
  }
  const res = await request('/rest/posts', {
    author,
    commentary: littleText(text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState,
    isReshareDisabledByAuthor: false,
  });
  return res.headers.get('x-restli-id');
}

// Runs every 10 minutes: publishes the next post whose time has come.
// ponytail: no retries; a duplicate post on someone's profile is worse than a
// missed one, and the next morning email lists the failure.
async function postDue(pool) {
  // Claimed before publishing: if the result can't be recorded, the post keeps
  // this error, so it's never published twice and the next email lists it.
  const { rows } = await pool.query(
    `UPDATE linkedin_posts SET error = 'publishing, result not recorded: check LinkedIn before posting it again'
     WHERE id = (SELECT id FROM linkedin_posts
                 WHERE posted_at IS NULL AND error IS NULL AND post_at <= NOW()
                 ORDER BY post_at LIMIT 1)
     RETURNING id, text, image, post_at`
  );
  const post = rows[0];
  if (!post) return;
  if (Date.now() - post.post_at > MAX_LATE_MS) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, 'skipped: more than an hour late (the scraper was down)']);
    return;
  }
  let urn;
  try {
    urn = await publish(post.text, post.image);
  } catch (err) {
    await pool.query('UPDATE linkedin_posts SET error = $2 WHERE id = $1', [post.id, err.message]);
    logger.error(`LinkedIn post ${post.id} failed: ${err.message}`);
    return;
  }
  await pool.query('UPDATE linkedin_posts SET posted_at = NOW(), post_urn = $2, error = NULL WHERE id = $1', [post.id, urn]);
  logger.info(`Posted to LinkedIn: ${urn}`);
}

module.exports = { enabled, postSlots, littleText, schedulePosts, postDue, publish, ASSETS };
