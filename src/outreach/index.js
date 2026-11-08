// Cold outreach to Shopify brands from the owner's own mailbox: one email
// every few minutes, landing in the reader's office hours, stopped for good by
// any reply or bounce. Off until OUTREACH_ENABLED=1.
const { ImapFlow } = require('imapflow');
const { smtpTransport } = require('../digest');
const { writeOpener, buildEmail } = require('./email');
const { logger } = require('../utils');

const enabled = () => process.env.OUTREACH_ENABLED === '1';

const MAX_PER_DAY = 100;
// Days after the sequence's first email. Three emails in all.
const FOLLOW_UP_DAYS = [3, 4];
const STEPS = FOLLOW_UP_DAYS.length + 1;
const PAUSE_KEY = 'outreach_paused_until';
const INBOX_KEY = 'outreach_inbox_uid';
const IST_MS = 330 * 60 * 1000;

// The mailbox's own waking hours, 10:00 to midnight IST. Which readers are
// eligible inside that depends on their own clock (nextContact).
function inSendWindow(now) {
  const ist = new Date(now.getTime() + IST_MS);
  return ist.getUTCHours() >= 10;
}

// A mailbox that goes from nothing to 100 a day looks hijacked: 15 on the
// first sending day, 5 more for each day it has actually sent on.
const dailyCap = (daysSent) => Math.min(MAX_PER_DAY, 15 + 5 * daysSent);

// Facts were read when the store was scraped and the email goes out later, so
// ages move on, and an ad seen more than a week ago may have stopped.
function currentFacts(contact, now) {
  const { scan, ...facts } = structuredClone(contact.facts);
  const age = Math.max(0, Math.floor((now - contact.created_at) / 86400000));
  if (facts.latestProduct?.addedDaysAgo !== undefined) {
    facts.latestProduct.addedDaysAgo += age;
    if (facts.latestProduct.addedDaysAgo > 45) delete facts.latestProduct.addedDaysAgo;
  }
  if (facts.metaAd) {
    if (age > 7) delete facts.metaAd;
    else facts.metaAd.daysLiveOnMeta += age;
  }
  return facts;
}

// 5 to 9 minutes, varied by send so the gaps aren't a metronome.
const gapMs = (lastId) => (5 + (lastId * 7919) % 5) * 60 * 1000;

async function pausedUntil(pool) {
  const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [PAUSE_KEY]);
  return rows[0] ? new Date(rows[0].value) : null;
}

async function pause(pool, hours, why) {
  const until = new Date(Date.now() + hours * 3600000).toISOString();
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [PAUSE_KEY, until]
  );
  logger.error(`Outreach paused until ${until}: ${why}`);
}

// Follow-ups go first, then the oldest new contact. A brand that replied is
// out, along with everyone else there. The email has to arrive on a weekday,
// 9 to 5 where the reader is. Commercial email to most of these countries must
// carry a postal address, so without one only Indian brands are written to.
async function nextContact(pool) {
  const { rows } = await pool.query(
    `SELECT c.*, b.name AS brand_name, b.domain, b.country, b.facts
     FROM outreach_contacts c JOIN outreach_brands b ON b.id = c.brand_id
     WHERE c.status = 'active' AND c.next_at <= NOW() AND b.replied_at IS NULL
       AND EXTRACT(HOUR FROM NOW() AT TIME ZONE b.tz) BETWEEN 9 AND 16
       AND EXTRACT(ISODOW FROM NOW() AT TIME ZONE b.tz) <= 5
       AND ($1 OR b.country = 'IN')
     ORDER BY c.step DESC, (b.facts ? 'metaAd') DESC, c.next_at, c.id LIMIT 1`,
    [Boolean(process.env.OUTREACH_POSTAL_ADDRESS)]
  );
  return rows[0];
}

let sending = false;

// Sends at most one email. Runs on a timer, in one process.
async function sendNext(pool, now = new Date()) {
  if (sending || !enabled() || !inSendWindow(now)) return;
  sending = true;
  try {
    await sendOne(pool, now);
  } finally {
    sending = false;
  }
}

async function sendOne(pool, now) {
  const until = await pausedUntil(pool);
  if (until && until > now) return;

  const { rows: [sent] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE (sent_at + INTERVAL '330 minutes')::date = ($1::timestamptz + INTERVAL '330 minutes')::date)::int AS today,
            COUNT(DISTINCT (sent_at + INTERVAL '330 minutes')::date) FILTER (WHERE error IS NULL AND (sent_at + INTERVAL '330 minutes')::date < ($1::timestamptz + INTERVAL '330 minutes')::date)::int AS days_sent,
            MAX(sent_at) AS last, MAX(id)::int AS last_id
     FROM outreach_sends`,
    [now]
  );
  if (sent.today >= dailyCap(sent.days_sent)) return;
  if (sent.last && now - sent.last < gapMs(sent.last_id)) return;

  // Never send blind: a reply or bounce we haven't read must still stop the
  // next email, so a failing inbox scan stops sending too.
  const { rows: [scan] } = await pool.query('SELECT updated_at FROM app_state WHERE key = $1', [INBOX_KEY]);
  if (!scan || now - scan.updated_at > 45 * 60000) return;

  const contact = await nextContact(pool);
  if (!contact) return;

  let { subject } = contact;
  let opener = null;
  if (contact.step === 0) {
    const draft = await writeOpener(currentFacts(contact, now));
    if (!draft) {
      await pool.query(`UPDATE outreach_contacts SET next_at = NOW() + INTERVAL '1 day' WHERE id = $1`, [contact.id]);
      return;
    }
    ({ subject, opener } = draft);
  }
  const email = buildEmail({ contact, brandName: contact.brand_name, country: contact.country, step: contact.step, subject, opener });

  // Claimed before sending: if the result can't be recorded the row keeps this
  // error, and (contact, step) being unique means it never goes out twice.
  const { rows: claim } = await pool.query(
    `INSERT INTO outreach_sends (contact_id, step, subject, body, error)
     VALUES ($1, $2, $3, $4, 'sending, result not recorded')
     ON CONFLICT (contact_id, step) DO NOTHING RETURNING id`,
    [contact.id, contact.step, email.subject, email.text]
  );
  if (!claim.length) {
    await pool.query(`UPDATE outreach_contacts SET status = 'error' WHERE id = $1`, [contact.id]);
    return;
  }

  const from = process.env.EMAIL_SERVER_USER;
  let info;
  try {
    info = await smtpTransport().sendMail({
      from: `Rishi Lahoti <${from}>`,
      to: contact.name ? `${contact.name} <${contact.email}>` : contact.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>` },
      ...(contact.thread_id ? { inReplyTo: contact.thread_id, references: contact.thread_id } : {}),
    });
  } catch (err) {
    await pool.query('UPDATE outreach_sends SET error = $2 WHERE id = $1', [claim[0].id, err.message.slice(0, 300)]);
    if (/\b5\.1\.\d/.test(err.message)) {
      await pool.query(`UPDATE outreach_contacts SET status = 'bounced' WHERE id = $1`, [contact.id]);
    } else {
      // Anything else (a sending limit, a blocked login) won't get better by
      // retrying every few minutes, and pushing on is how accounts get locked.
      await pool.query(`UPDATE outreach_contacts SET status = 'error' WHERE id = $1`, [contact.id]);
      await pause(pool, 24, err.message);
    }
    return;
  }

  // Outside the try: the email has gone, so a database hiccup here must not be
  // mistaken for a send failure. The claim row keeps it from going twice.
  const step = contact.step + 1;
  await pool.query('UPDATE outreach_sends SET error = NULL, message_id = $2, sent_at = NOW() WHERE id = $1', [claim[0].id, info.messageId]);
  await pool.query(
    `UPDATE outreach_contacts
     SET step = $2, status = $3, thread_id = COALESCE(thread_id, $4), subject = COALESCE(subject, $5),
         next_at = NOW() + make_interval(days => $6)
     WHERE id = $1`,
    [contact.id, step, step >= STEPS ? 'done' : 'active', info.messageId, subject, FOLLOW_UP_DAYS[contact.step] || 0]
  );
}

const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com', 'rediffmail.com', 'icloud.com', 'proton.me', 'live.com']);

const header = (m, name) => {
  const line = m.headers?.toString().split(/\r?\n(?! )/).find((l) => l.toLowerCase().startsWith(`${name}:`));
  return line ? line.slice(name.length + 1).trim() : '';
};

// A person's reply stops the brand for good and shows in the morning email;
// a bounce stops that address. Out-of-office and ticket auto-replies don't count.
async function handleMessage(pool, m) {
  const fromAddress = m.envelope.from?.[0]?.address?.toLowerCase();
  if (!fromAddress) return;
  if (/^(mailer-daemon|postmaster)@/.test(fromAddress)) {
    // Gmail names the address in a header; other servers only in the report.
    const failed = (header(m, 'x-failed-recipients') || m.source?.toString().match(/^Final-Recipient:\s*rfc822;\s*(\S+)/im)?.[1] || '').toLowerCase();
    if (failed) await pool.query(`UPDATE outreach_contacts SET status = 'bounced' WHERE email = ANY($1)`, [failed.split(/[,\s]+/)]);
    return;
  }
  if (/auto-replied|auto-generated/i.test(header(m, 'auto-submitted')) || header(m, 'x-autoreply') || /auto_reply|bulk/i.test(header(m, 'precedence'))) return;

  const domain = fromAddress.split('@')[1];
  const { rows } = await pool.query(
    `SELECT DISTINCT c.brand_id FROM outreach_contacts c
     WHERE (EXISTS (SELECT 1 FROM outreach_sends s WHERE s.contact_id = c.id)
            AND (c.email = $1 OR ($3 AND split_part(c.email, '@', 2) = $2)))
        OR c.id IN (SELECT contact_id FROM outreach_sends WHERE message_id = $4)`,
    [fromAddress, domain, !FREE_MAIL.has(domain), m.envelope.inReplyTo || null]
  );
  for (const { brand_id: id } of rows) {
    await pool.query(
      `UPDATE outreach_brands SET replied_at = NOW(), reply_from = $2, reply_subject = $3 WHERE id = $1 AND replied_at IS NULL`,
      [id, fromAddress, (m.envelope.subject || '').slice(0, 200)]
    );
  }
}

// Reads what's new in the inbox since the last look. The first run only
// records where the inbox is now.
async function scanInbox(pool) {
  if (!enabled()) return;
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
    socketTimeout: 60000,
  });
  // Without a listener a dropped connection takes the whole process down.
  client.on('error', (err) => logger.warn(`Inbox connection: ${err.message}`));
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [INBOX_KEY]);
      let last = rows[0] ? Number(rows[0].value) : client.mailbox.uidNext - 1;
      if (client.mailbox.uidNext - 1 > last) {
        const seen = last;
        for await (const m of client.fetch(`${seen + 1}:*`, {
          uid: true, envelope: true, headers: ['auto-submitted', 'x-autoreply', 'precedence', 'x-failed-recipients'], source: { maxLength: 65536 },
        }, { uid: true })) {
          if (m.uid <= seen) continue;
          await handleMessage(pool, m);
          last = Math.max(last, m.uid);
        }
      }
      await pool.query(
        `INSERT INTO app_state (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [INBOX_KEY, String(last)]
      );
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  await checkBounces(pool);
}

// Too many bounces means the list has gone bad, and Gmail notices that before
// we do: stop for two days and say so in the morning email.
async function checkBounces(pool) {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(DISTINCT s.contact_id)::int AS sent,
            COUNT(DISTINCT s.contact_id) FILTER (WHERE c.status = 'bounced')::int AS bounced
     FROM outreach_sends s JOIN outreach_contacts c ON c.id = s.contact_id
     WHERE s.sent_at >= NOW() - INTERVAL '3 days' AND s.step = 0`
  );
  if (r.sent >= 30 && r.bounced / r.sent > 0.08) {
    const until = await pausedUntil(pool);
    if (!until || until < new Date()) await pause(pool, 48, `${r.bounced} of the last ${r.sent} first emails bounced`);
  }
}

// Numbers and replies for the morning email.
async function report(pool) {
  const [today, replies, pipeline, paused] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '24 hours')::int AS last_day, COUNT(*)::int AS total FROM outreach_sends WHERE error IS NULL`),
    pool.query(`SELECT name, domain, reply_from, reply_subject, replied_at FROM outreach_brands WHERE replied_at >= NOW() - INTERVAL '24 hours' ORDER BY replied_at DESC`),
    pool.query(`SELECT
        (SELECT COUNT(*)::int FROM outreach_brands) AS brands,
        (SELECT COUNT(*)::int FROM outreach_brands WHERE replied_at IS NOT NULL) AS replied,
        (SELECT COUNT(*)::int FROM outreach_contacts WHERE status = 'active' AND step = 0) AS waiting,
        (SELECT COUNT(*)::int FROM outreach_contacts WHERE status = 'bounced') AS bounced`),
    pausedUntil(pool),
  ]);
  return {
    enabled: enabled(),
    sent24h: today.rows[0].last_day,
    sentTotal: today.rows[0].total,
    ...pipeline.rows[0],
    replies: replies.rows,
    pausedUntil: paused && paused > new Date() ? paused : null,
  };
}

// Sends the owner what the top brands would get, recording nothing.
async function previewTo(pool, to, count) {
  const { rows } = await pool.query(
    `SELECT c.*, b.name AS brand_name, b.country, b.facts
     FROM outreach_contacts c JOIN outreach_brands b ON b.id = c.brand_id
     WHERE c.step = 0 ORDER BY (b.facts ? 'metaAd') DESC, c.id LIMIT $1`,
    [count]
  );
  for (const contact of rows) {
    const draft = await writeOpener(currentFacts(contact, new Date()));
    if (!draft) {
      logger.warn(`No opener for ${contact.brand_name}`);
      continue;
    }
    for (let step = 0; step < STEPS; step++) {
      const email = buildEmail({ contact, brandName: contact.brand_name, country: contact.country, step, ...draft });
      await smtpTransport().sendMail({
        from: `Rishi Lahoti <${process.env.EMAIL_SERVER_USER}>`, to,
        subject: `[preview: ${contact.brand_name}, would go to ${contact.email}] ${email.subject}`,
        text: email.text, html: email.html,
      });
    }
    logger.info(`Previewed ${contact.brand_name}: ${draft.subject} / ${draft.opener}`);
  }
}

module.exports = { enabled, inSendWindow, dailyCap, currentFacts, gapMs, sendNext, scanInbox, report, handleMessage, previewTo };
