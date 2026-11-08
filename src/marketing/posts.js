// Groq writes WhatRunsIndia's LinkedIn and X posts from real material only: a
// published blog post, something that really happened while building, or
// numbers from the store scan. A draft that fails postProblem() twice is
// dropped, so a robotic one never goes out.
const sanitizeHtml = require('sanitize-html');
const { askGroq } = require('../digest/writer');
const { writeJson } = require('./llm');
const { voiceProblem, inventedNumber } = require('./voice');
const { logger, delay, timeLimit } = require('../utils');

const SITE = 'https://whatrunsindia.com';

const SYSTEM = `You write LinkedIn posts in the first person as Rishi Lahoti, a developer in India building WhatRunsIndia alone. WhatRunsIndia takes the product photos already on a Shopify store and makes on-model photos and finished ads from them. The merchant approves every image.

Who reads this: founders and marketing leads at direct-to-consumer brands on Shopify around the world, mostly clothing, jewellery, beauty and home. Small teams. They run their own Meta ads, they've paid for a catalog shoot and winced at the bill, and they spot a sales pitch from the first line. They're reading between orders, so write the way one founder texts another.

Return JSON: {"post": "the LinkedIn post", "x": "one standalone post for X on the same idea"}

FORMAT
One paragraph, no line breaks. Two or three short sentences, 90 to 210 characters in total, so all of it shows in the feed without a "see more". Nobody reads long posts. If it can lose a word, it should.

THE FIRST SENTENCE IS THE WHOLE JOB
Under 90 characters, no question mark. Find the oddest, most specific or most painful detail in SOURCE and lead with it. The next sentence gives it a turn and the last one lands it: a dry joke, a blunt opinion, or one thing to go check on their own store. These are from other trades, to show the feel. Never borrow their content:
"My accountant found ₹40,000 in a folder called misc. I've renamed it savings."
"The intern's typo outsold the headline we paid for. We kept the typo."
"Our best-selling shirt has a photo I took in a parking lot. The studio version sold half as many."

Never open with: Most, Every brand, Did you know, Ever wondered, Are you, Imagine, Here's, Stop, Tired of, Struggling, Want to, Let's talk, Today I, Day.

STAY TRUE
Stay inside SOURCE. Say only what it says happened or states, in your own plain words. Don't add scenes, tests, products, tools, reactions, consequences or costs, and don't guess what the reader spends or feels.
Plain words. No trade jargon SOURCE doesn't use. Contractions. Say "I" for things you did. No summary and no moral.

PRODUCT
If ALLOW_PRODUCT is false, don't name WhatRunsIndia at all. If it's true, you may name it once, plainly.

HARD RULES (a program rejects the draft if you break one)
- Every number, brand, event and result must come from SOURCE, as given. Don't round, add or calculate.
- Nothing invented. There are no customers or case studies to quote, so never write "we helped", "our customers" or "clients".
- Never say it syncs to Meta, pushes to a catalog or writes back to Shopify.
- No hashtags, links, emojis, arrows, bold, bullet characters, en dashes or em dashes.
- Never use: leverage, utilize, robust, seamless, cutting-edge, game-changer, unlock, delve, landscape, journey, elevate, empower, streamline, revolutionize, testament, foster, pivotal, harness, supercharge, crucial, vital, stunning, effortless.
- Never use these shapes: "it's not X, it's Y", "not X but Y", "not just", "No X. No Y.", "The result?", "Here's why", "the best part", "let that sink in", "when it comes to", "nobody talks about".

x: under 240 characters. One thought in plain sentences that makes sense on its own. It can be blunter than the LinkedIn post.`;

// Things that really happened while building it. Keep this list true: Groq may
// only retell what's written here.
const STORIES = [
  'I gave my ad generator a photo of a snowboard. It returned an ad for a jar of hand cream with "MAXIMUM STRENGTH RELIEF" written on it. My image-similarity check passed it. I replaced that check with a vision model that compares the original product with the finished ad before anyone sees it.',
  'An ad style called Urgent Flash Deal took a product with two boards and merged them into one blended board. The check passed it. Now the system lists every item in the product photo first and the ad must have exactly that many items, or it is rejected and the credit is refunded.',
  'The image model kept filling ad backgrounds with invented words like "ASCEND" and "PIXEL_P". It looked fine in a thumbnail and absurd up close. Now the headline is written first, the model is told exactly which words to render, and ad styles without text are told to render no words at all.',
  'In one test the model put the headline in the top-right corner and then my code stamped the logo right on top of it. Now the system reads where the text and product sit in the finished ad and puts the logo in the first corner that is clear of all of them.',
  'Before an ad passes, code compares the price printed on it with the store price, digit for digit, in Indian number format. One wrong digit and the ad fails and the credit goes back, because a wrong price on an ad is worse than no ad.',
  'I used to crop one image into every ad size. The crops cut off text near the edges. Now every size is its own generation at its own shape, so a 1:1 and a 4:5 are composed separately.',
  'For a while my ads looked like plain product photos with a new background. The cause was embarrassing: each ad style had settings for composition, lighting, mood and text, and I had dropped them when importing the styles. Putting them back changed the output more than any model upgrade did.',
  'I spent about ₹57 generating 15 images for my own homepage. The serum and sneaker shots barely changed from the originals and none had a model or text, so I did not ship any of them. Lesson learned: test 1 image before paying for a batch.',
  'If a product photo fails to load, the run now stops and refunds the credit. It used to carry on with only the text prompt, which is how you get an invented product with invented claims marked as finished.',
  'Credits are held when a run starts and only charged when an ad finishes. If an ad fails for good the credit goes back, and if one ad in a batch fails, only that one is retried.',
];

// Trade words Groq reaches for to sound authentic; they have to come from the source.
const JARGON = /\b(RTO|COD|ROAS|CAC|CTR|lakh|crore|reshoot\w*|kurta\w*|saree\w*|jewell?ery|ads manager|diwali|festive|sku\w*)\b/gi;

const BAD_OPENER = /^(most\b|every (brand|founder)|did you know|ever wonder|are you|imagine|here'?s|stop\b|tired of|struggling|want to|let'?s talk|today i|day \d)/i;

// Why a draft can't go out, or null when it can.
function postProblem(draft, source) {
  if (typeof draft?.post !== 'string' || typeof draft?.x !== 'string') return 'missing post or x';
  const post = draft.post.trim();
  const x = draft.x.trim();
  if (post.includes('\n')) return 'more than one paragraph';
  if (post.length < 70 || post.length > 230) return `${post.length} characters, want 90 to 210`;
  const sentences = post.split(/(?<=[.!?])\s+/);
  if (sentences.length > 3) return `${sentences.length} sentences, want at most 3`;
  const first = sentences[0];
  if (first.length > 100) return 'first sentence over 100 characters';
  if (first.endsWith('?')) return 'first sentence is a question';
  if (BAD_OPENER.test(first)) return `weak opening: "${first.slice(0, 40)}"`;
  if (x.length < 40 || x.length > 260) return `x post is ${x.length} characters`;
  for (const text of [post, x]) {
    if (/https?:|www\.|(^|\s)#\w/.test(text)) return 'a link or hashtag';
    const voice = voiceProblem(text);
    if (voice) return voice;
    if (/\b(we helped|our (customers|clients|users)|clients|case stud)/i.test(text)) return 'claims customers';
    if (/\b(sync|meta catalog|commerce catalog|write[s]? back|pushes? to)/i.test(text)) return 'promises something not built';
  }
  if (!source.allowProduct && /what\s?runs\s?india/i.test(`${post} ${x}`)) return 'names the product';
  const invented = inventedNumber(`${post} ${x}`, source.text);
  if (invented) return `${invented} isn't in the source`;
  const jargon = `${post} ${x}`.match(JARGON)?.find((w) => !source.text.toLowerCase().includes(w.toLowerCase()));
  if (jargon) return `"${jargon}" isn't in the source`;
  return null;
}

const FACT_CHECK = `You check a social media post against its SOURCE. List every statement in POST that SOURCE doesn't support: events, tests, products, tools, reactions, results, costs, or what the reader does or feels. Opinions and advice that follow directly from SOURCE are fine. Return JSON: {"unsupported": ["short quote"]}, with an empty array when everything is supported.`;

// Models add small believable details that a regex can't see, so a different
// model compares the draft with what it was written from.
async function unsupported(text, source) {
  if (!process.env.GROQ_API_KEY) return null;
  const { unsupported: lines } = await askGroq(process.env.GROQ_API_KEY, FACT_CHECK, `SOURCE:\n${source.text}\n\nPOST:\n${text}`);
  return Array.isArray(lines) && lines.length ? `unsupported: "${String(lines[0]).slice(0, 80)}"` : null;
}

// Models use typographer's characters people don't type on a phone.
const tidy = (s) => String(s ?? '').trim().replace(/[\u2010\u2011]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u00A0\u202F]/g, ' ');

// The draft, or { problem } when both attempts failed.
async function writePost(source) {
  let problem;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retry = problem ? `\n\nYour last draft was rejected for this: ${problem}. Write a new one.` : '';
    try {
      const raw = await writeJson(SYSTEM, `ALLOW_PRODUCT: ${source.allowProduct}\n\nSOURCE:\n${source.text}${retry}`);
      const draft = { post: tidy(raw.post), x: tidy(raw.x) };
      problem = postProblem(draft, source) || await unsupported(`${draft.post}\n\n${draft.x}`, source);
      if (!problem) return draft;
    } catch (err) {
      problem = err.message;
      // Free tier: 8,000 tokens a minute.
      if (/HTTP 429/.test(problem)) await delay(65000);
    }
    logger.warn(`Groq post, attempt ${attempt}: ${problem}`);
  }
  return { problem };
}

async function fetchText(url) {
  const res = await timeLimit(fetch(url, { signal: AbortSignal.timeout(20000) }), 20000);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return timeLimit(res.text(), 20000);
}

// A published post from the site's feed, picked by `n` so the days rotate.
async function blogSource(n) {
  const rss = await fetchText(`${SITE}/blog/rss.xml`);
  const links = [...rss.matchAll(/<link>(https:[^<]+\/blog\/[^<]+)<\/link>/g)].map((m) => m[1]);
  if (!links.length) throw new Error('no posts in the blog feed');
  const link = links[n % links.length];
  const article = (await fetchText(link)).match(/<article[\s\S]*?<\/article>/)?.[0] || '';
  const text = sanitizeHtml(article, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  if (text.length < 500) throw new Error(`${link}: no article text`);
  return { kind: 'blog', text: text.slice(0, 3500), link, allowProduct: true };
}

const storySource = (n) => ({ kind: 'story', text: STORIES[n % STORIES.length], link: SITE, allowProduct: false });

module.exports = { SYSTEM, STORIES, postProblem, writePost, blogSource, storySource, fetchText };
