// A cold email is a line about the reader's store plus copy we know is true.
// The model only writes the subject and that first line, from numbers we read
// off the store; the pitch, offer and link are fixed below.
const { writeJson } = require('../marketing/llm');
const { voiceProblem, inventedNumber } = require('../marketing/voice');
const { logger } = require('../utils');

const CAL = 'https://cal.com/whatrunsindia/15min';
const SITE = 'https://whatrunsindia.com';
const IMAGE = `${SITE}/og-image.png`;

const SYSTEM = `You write the subject and first line of a cold email to someone who runs a Shopify brand. They delete these on sight, so the first line must show a true, specific thing about their store and make them feel it.

Return JSON: {"subject": "...", "opener": "..."}

subject: 2 to 4 words, all lowercase, no punctuation, about their product or their photos, like a note from a colleague. No brand name and no person's name.

opener: 1 or 2 short sentences, 12 to 32 words in total. Take the sharpest fact in FACTS and say it plainly. If FACTS has metaAd, use it, because an ad left running for months is the sharpest thing you can say: give the number of days and the headline if there is one, then say in a few plain words that people stop noticing an ad they keep seeing. Otherwise name their product the way a person would say it out loud (shorten long catalog titles) and say what the fact costs them.

Rules a program enforces:
- Every number must appear in FACTS, exactly as given.
- No compliments. No "I noticed", "I came across", "I was looking at", "I saw".
- Don't mention AI, tools, or what is being sold. The next paragraph does that.
- No questions, links, emojis, long dashes or exclamation marks.

Examples of the feel, from other trades. Never borrow their content:
{"subject": "the blue menu", "opener": "Your blue menu still lists 2 dishes you stopped serving. Anyone ordering them online gets a refund and a reason not to come back."}
{"subject": "gym photos", "opener": "4 of your 6 class pages have the same stock photo of a treadmill. People picking a gym can't tell what yours looks like."}`;

function openerProblem(draft, facts) {
  if (typeof draft?.subject !== 'string' || typeof draft?.opener !== 'string') return 'missing subject or opener';
  const subject = draft.subject.trim();
  const opener = draft.opener.trim();
  if (!/^[a-z0-9 ]+$/.test(subject)) return 'subject must be lowercase words';
  const subjectWords = subject.split(/\s+/).length;
  if (subjectWords < 2 || subjectWords > 4) return 'subject must be 2 to 4 words';
  if (facts.brand && subject.includes(facts.brand.toLowerCase())) return 'subject has the brand name';
  const words = opener.split(/\s+/).length;
  if (words < 8 || words > 36) return `opener is ${words} words`;
  if (/[?!\n]|https?:/.test(opener)) return 'question, exclamation, link or line break in opener';
  if (/\b(i noticed|i saw|i came across|i was looking|love your|great (brand|products?|store)|\bai\b|tool|software|platform)\b/i.test(opener)) return 'banned opener wording';
  const voice = voiceProblem(`${subject}. ${opener}`);
  if (voice) return voice;
  const invented = inventedNumber(`${subject} ${opener}`, JSON.stringify(facts));
  if (invented) return `${invented} isn't in the facts`;
  // A real number on the wrong noun still lies about their store.
  for (const m of opener.matchAll(/(\d+)\s+(day|photo)s?\b(?!\s+(?:each|or)\b)/gi)) {
    const n = Number(m[1]);
    const ok = /day/i.test(m[2]) ? [facts.metaAd?.daysLiveOnMeta, facts.latestProduct?.addedDaysAgo].includes(n) : n === facts.latestProduct?.photos;
    if (!ok) return `"${m[0]}" doesn't match the facts`;
  }
  if (/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(photos?|days?|weeks?|months?|years?)\b/i.test(opener)) return 'a count spelled out in words';
  return null;
}

// { subject, opener }, or null when both attempts fail: better a late email
// than a template that reads like one.
async function writeOpener(facts) {
  let problem;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retry = problem ? `\n\nYour last draft was rejected for this: ${problem}.` : '';
    try {
      const draft = await writeJson(SYSTEM, `FACTS:\n${JSON.stringify(facts, null, 1)}${retry}`);
      problem = openerProblem(draft, facts);
      if (!problem) return { subject: draft.subject.trim(), opener: draft.opener.trim() };
    } catch (err) {
      problem = err.message;
    }
    logger.warn(`Cold email opener, attempt ${attempt}: ${problem}`);
  }
  return null;
}

// Rotated by contact so a hundred emails a day aren't word-for-word copies.
const PITCH = [
  'I built WhatRunsIndia for this. It turns the photos already on your store into on-model shots and ready-to-run ads the same day, and you approve each one.',
  'That\'s what I built WhatRunsIndia to fix. Give it the photos you already have and you get on-model shots and finished ads the same day. Nothing goes anywhere until you approve it.',
  'WhatRunsIndia is the thing I built for exactly this. It takes the product photos you already have and makes on-model shots and ads the same day, and you sign off on every one.',
];
const ASK = [
  'Grab 15 minutes and I\'ll run it live on your own product:',
  'Pick a slot and I\'ll do it live on one of your products:',
  'If you want to see it on your own product, take any 15 minutes here:',
];

// The two follow-ups stand alone, each with a new reason to care.
const FOLLOW_UPS = [
  (b) => `Hi ${b.greet},\n\n${b.india ? 'A 40-style catalog shoot in an Indian metro usually lands between ₹1 lakh and ₹1.5 lakh by the time the studio, models and reshoots are paid for, and it takes weeks.' : 'A proper catalog shoot usually takes weeks by the time the studio, models, retouching and reshoots are sorted, and the bill grows with every style.'}\n\nFinish setting up ${b.brand} on WhatRunsIndia and you get 10 free credits every month, which is 10 finished images. It's a cheap way to find out if the photos hold up.`,
  (b) => `Hi ${b.greet},\n\nLast note from me. If photos aren't a headache at ${b.brand} right now, ignore this and I won't write again.\n\nIf they are, the 15 minutes are still open.`,
];

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Store names carry taglines and legal suffixes no one says out loud.
const spokenBrand = (name) => name.split(/\s+[|:\u2013\u2014-]\s+/)[0].replace(/[\s,]+(?:(?:pvt|private)\.?\s+)?(?:ltd\.?|limited|llp|llc|inc\.?)$/i, '').trim();

function greeting(contact, brand) {
  const first = contact.name?.trim().split(/\s+/)[0];
  if (first) return first;
  return /^[a-z0-9]+(-[a-z0-9]+)+$/.test(brand) ? 'there' : `${brand} team`;
}

// step 0 needs the opener; steps 1 and 2 are the follow-ups.
function buildEmail({ contact, brandName, country, step, subject, opener }) {
  const pick = (list) => list[contact.id % list.length];
  const brand = spokenBrand(brandName);
  const greet = greeting(contact, brand);
  const main = step === 0
    ? `Hi ${greet},\n\n${opener}\n\n${pick(PITCH)}`
    : FOLLOW_UPS[step - 1]({ greet, brand, india: country === 'IN' });
  const ask = step === 0 ? pick(ASK) : 'Here\'s my calendar:';
  const optOut = 'Not useful? Reply "no" and I won\'t write again.';
  const signoff = 'Rishi Lahoti\nFounder, WhatRunsIndia\nwhatrunsindia.com';
  const address = process.env.OUTREACH_POSTAL_ADDRESS || '';

  const text = `${main}\n\n${ask} ${CAL}\n\n${signoff}\n\n${optOut}${address ? `\n${address}` : ''}`;

  const paragraphs = main.split('\n\n').map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('');
  // Only the first email carries the picture: the follow-ups are threaded notes.
  const picture = step === 0
    ? `<img src="${IMAGE}" width="520" alt="One product photo turned into a photoshoot and a ready ad" style="display:block;width:100%;max-width:520px;height:auto;border-radius:10px;border:0;margin:4px 0 18px">`
    : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1c1917;max-width:540px">
${paragraphs}${picture}<p style="margin:0 0 8px">${escapeHtml(ask)}</p>
<p style="margin:0 0 22px"><a href="${CAL}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:8px">Pick a 15-minute slot</a></p>
<p style="margin:0;font-weight:bold">Rishi Lahoti</p>
<p style="margin:0;color:#57534e">Founder, WhatRunsIndia &middot; whatrunsindia.com</p>
<p style="margin:22px 0 0;font-size:12px;color:#a8a29e">${escapeHtml(optOut)}${address ? `<br>${escapeHtml(address)}` : ''}</p>
</div>`;

  return { subject: step === 0 ? subject : `Re: ${subject}`, text, html };
}

module.exports = { openerProblem, writeOpener, buildEmail, CAL };
