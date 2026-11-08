const test = require('node:test');
const assert = require('node:assert/strict');

const { isPlainHostname, isPrivateAddress, extractEmails, publishedName, pickContacts, storeFacts } = require('../src/outreach/stores');
const { advertisers, adFacts } = require('../src/outreach/ads');
const { openerProblem, buildEmail, CAL } = require('../src/outreach/email');
const { dailyCap, currentFacts, gapMs, inSendWindow } = require('../src/outreach');
const { postProblem } = require('../src/marketing/posts');

test('extractEmails finds real addresses and drops page noise', () => {
  const enc = (s) => `2a${[...s].map((c) => (c.charCodeAt(0) ^ 0x2a).toString(16).padStart(2, '0')).join('')}`;
  assert.deepEqual(extractEmails('<p>care&#64;brand.in</p>'), ['care@brand.in']);
  assert.deepEqual(extractEmails(`<a data-cfemail="${enc('hello@brand.in')}"></a>`), ['hello@brand.in']);
  assert.deepEqual(extractEmails('<a href="mailto:a@brand.in?subject=x">m</a>'), ['a@brand.in']);
  assert.deepEqual(extractEmails('<p>logo@2x.png you@example.com x@shopify.com</p>'), []);
  assert.deepEqual(extractEmails('<script>"a@brand.in"</script>'), []);
});

test('extractEmails stays fast on hostile pages', () => {
  assert.deepEqual(extractEmails('<script>"a@brand.in"</script ><p>b@brand.in</p>'), ['b@brand.in']);
  const started = Date.now();
  extractEmails('<script'.repeat(200000));
  extractEmails('<'.repeat(1000000));
  extractEmails(`${'a.'.repeat(500000)}@`);
  assert.ok(Date.now() - started < 3000);
});

test('only public hostnames are fetched', () => {
  for (const host of ['brand.com', 'shop.brand.co.in', 'x-y.myshopify.com']) assert.equal(isPlainHostname(host), true, host);
  for (const host of ['localhost', 'db', '127.0.0.1', '169.254.169.254', 'brand.com:5432', 'a@brand.com', 'brand.com/x', '[::1]']) assert.equal(isPlainHostname(host), false, host);
  assert.equal(isPrivateAddress({ address: '169.254.169.254', family: 4 }), true);
  assert.equal(isPrivateAddress({ address: '10.0.0.8', family: 4 }), true);
  assert.equal(isPrivateAddress({ address: '::1', family: 6 }), true);
  assert.equal(isPrivateAddress({ address: '::ffff:127.0.0.1', family: 6 }), true);
  assert.equal(isPrivateAddress({ address: '23.227.38.65', family: 4 }), false);
});

test('publishedName needs a label or an honorific, and rejects page words', () => {
  assert.equal(publishedName('Grievance Officer Name: Asha Verma, email'), 'Asha Verma');
  assert.equal(publishedName('Grievance Officer: Mr. Rohan Gupta'), 'Rohan Gupta');
  assert.equal(publishedName('Grievance Officer Name: Customer Support'), null);
  assert.equal(publishedName('Contact our team today'), null);
});

test('pickContacts prefers people, skips compliance inboxes, names only their owner', () => {
  const picked = pickContacts(['support@brand.in', 'grievance@brand.in', 'hello@brand.in', 'asha@brand.in', 'orders@brand.in'], 'brand.in', 'Asha Verma');
  assert.deepEqual(picked, [{ email: 'asha@brand.in', name: 'Asha Verma' }, { email: 'hello@brand.in', name: null }]);
  // "priya" must not be read as the role word "pr".
  assert.equal(pickContacts(['priya@brand.in'], 'brand.in', null).length, 1);
  assert.deepEqual(pickContacts(['x@agency.com'], 'brand.in', null), []);
  assert.deepEqual(pickContacts(['grievanceofficer@brand.in', 'no_reply@brand.in', 'hello@brand.in'], 'brand.in', null).map((c) => c.email), ['hello@brand.in']);
  // A name goes only on an address that is visibly that person's.
  assert.equal(pickContacts(['instagram@brand.in'], 'brand.in', 'Ram Kumar')[0].name, null);
});

test('storeFacts prices a reshoot in the right currency', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const products = [
    { title: 'Indigo Kurta', published_at: '2026-11-02T00:00:00Z', images: [{}] },
    ...Array.from({ length: 9 }, (_, i) => ({ title: `P${i}`, published_at: '2026-01-01T00:00:00Z', images: [{}, {}, {}, {}] })),
  ];
  const india = storeFacts({ name: 'B', country: 'IN', published_products_count: 100 }, products, now);
  assert.equal(india.reshootEverything.cost, '₹2.4 lakh');
  assert.deepEqual(india.latestProduct, { name: 'Indigo Kurta', photos: 1, addedDaysAgo: 6 });
  assert.deepEqual(india.scan, { sampled: 10, thin: 1, single: 1 });
  assert.equal(storeFacts({ name: 'B', country: 'US', published_products_count: 100 }, products, now).reshootEverything.cost, '$24,000');
});

test('advertisers keeps each store\'s longest-running ad and skips marketplaces', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const day = 86400;
  const start = (d) => now.getTime() / 1000 - d * day;
  const byHost = advertisers([
    { start_date: start(5), snapshot: { link_url: 'https://www.brand.com/products/a', title: 'New' } },
    { start_date: start(90), snapshot: { link_url: 'https://brand.com/', title: 'Old 🚀' } },
    { start_date: start(200), snapshot: { link_url: 'https://www.aliexpress.com/', title: 'X' } },
    { start_date: start(30), snapshot: { cards: [{ link_url: 'https://cards.co/x' }], title: '{{product.name}}' } },
  ], now);
  assert.deepEqual(byHost.get('brand.com'), { daysLive: 90, headline: 'Old', adsSeen: 2 });
  // A catalog ad's age is never paired with a younger ad's headline.
  const mixed = advertisers([
    { start_date: start(5), snapshot: { link_url: 'https://m.com/', title: 'Festive Sale' } },
    { start_date: start(200), snapshot: { link_url: 'https://m.com/', title: '{{product.name}}' } },
  ], now);
  assert.equal(mixed.get('m.com').headline, null);
  assert.equal(byHost.has('aliexpress.com'), false);
  assert.deepEqual(adFacts(byHost.get('cards.co')), { daysLiveOnMeta: 30 });
  assert.equal(adFacts({ daysLive: 3 }), null);
});

test('openerProblem blocks invented numbers and sales voice', () => {
  const facts = { brand: 'Acme', metaAd: { daysLiveOnMeta: 94 } };
  const good = { subject: 'that ad', opener: 'Your Free Shipping ad has been live on Meta for 94 days. People stop noticing an ad they keep seeing.' };
  assert.equal(openerProblem(good, facts), null);
  assert.ok(openerProblem({ ...good, opener: 'Your ad has run for 120 days and people have stopped noticing it by now.' }, facts));
  assert.ok(openerProblem({ ...good, subject: 'Quick Question' }, facts));
  assert.ok(openerProblem({ ...good, subject: 'acme photos' }, facts));
  assert.ok(openerProblem({ ...good, opener: 'I noticed your ad has been live for 94 days and I wanted to say hello to you.' }, facts));
  const withPhotos = { brand: 'Acme', products: 120, latestProduct: { photos: 1 } };
  assert.match(openerProblem({ subject: 'one photo', opener: 'Your latest product has only 120 photos and shoppers cannot see how it fits.' }, withPhotos), /doesn't match/);
  assert.match(openerProblem({ subject: 'one photo', opener: 'Your latest product has just three photos and shoppers cannot see how it fits.' }, withPhotos), /spelled out/);
});

test('buildEmail has one link, an opt-out, and threads follow-ups', () => {
  const contact = { id: 1, name: null };
  const first = buildEmail({ contact, brandName: 'Acme', country: 'US', step: 0, subject: 'that ad', opener: 'Opener line.' });
  assert.equal(first.subject, 'that ad');
  assert.match(first.text, /^Hi Acme team,/);
  assert.equal(first.html.match(/href=/g).length, 1);
  assert.ok(first.html.includes(CAL));
  assert.match(first.text, /Reply "no"/);
  const follow = buildEmail({ contact, brandName: 'Acme', country: 'US', step: 1, subject: 'that ad' });
  assert.equal(follow.subject, 'Re: that ad');
  assert.doesNotMatch(follow.text, /₹/);
  assert.match(buildEmail({ contact, brandName: 'Acme', country: 'IN', step: 1, subject: 'that ad' }).text, /₹1 lakh/);
  assert.match(buildEmail({ contact, brandName: 'Kashmir Box | Handmade Gifts', country: 'US', step: 0, subject: 'x', opener: 'y' }).text, /^Hi Kashmir Box team,/);
  assert.match(buildEmail({ contact, brandName: 'XYZ Retail Private Limited', country: 'US', step: 0, subject: 'x', opener: 'y' }).text, /^Hi XYZ Retail team,/);
  assert.match(buildEmail({ contact, brandName: 'my-store-2', country: 'US', step: 0, subject: 'x', opener: 'y' }).text, /^Hi there,/);
});

test('currentFacts ages what was scraped and drops stale ads', () => {
  const created_at = new Date('2026-11-01T00:00:00Z');
  const facts = { scan: {}, latestProduct: { name: 'P', photos: 1, addedDaysAgo: 40 }, metaAd: { daysLiveOnMeta: 90 } };
  const soon = currentFacts({ facts, created_at }, new Date('2026-11-04T00:00:00Z'));
  assert.equal(soon.scan, undefined);
  assert.equal(soon.metaAd.daysLiveOnMeta, 93);
  assert.equal(soon.latestProduct.addedDaysAgo, 43);
  const late = currentFacts({ facts, created_at }, new Date('2026-11-15T00:00:00Z'));
  assert.equal(late.metaAd, undefined);
  assert.equal(late.latestProduct.addedDaysAgo, undefined);
  assert.equal(facts.metaAd.daysLiveOnMeta, 90);
});

test('sending ramps up, spaces itself out, and keeps to the mailbox\'s hours', () => {
  assert.equal(dailyCap(0), 15);
  assert.equal(dailyCap(1), 20);
  assert.equal(dailyCap(40), 100);
  for (const id of [1, 2, 3, 4, 5]) {
    const minutes = gapMs(id) / 60000;
    assert.ok(minutes >= 5 && minutes <= 9);
  }
  assert.equal(inSendWindow(new Date('2026-11-09T04:00:00Z')), false); // 09:30 IST
  assert.equal(inSendWindow(new Date('2026-11-09T04:45:00Z')), true); // 10:15 IST
  assert.equal(inSendWindow(new Date('2026-11-09T18:15:00Z')), true); // 23:45 IST
});

test('postProblem enforces one short paragraph from the source', () => {
  const source = { kind: 'story', allowProduct: false, text: 'I gave my ad generator a photo of a snowboard and got hand cream.' };
  const x = 'I gave my ad generator a snowboard and got hand cream back. Check what your tool compares against.';
  const post = 'My ad generator turned a snowboard into hand cream. I had given it one clean photo. Check what yours compares against.';
  assert.equal(postProblem({ post, x }, source), null);
  assert.equal(postProblem({ post: `${post}\n\nMore.`, x }, source), 'more than one paragraph');
  assert.match(postProblem({ post: `${post} ${post}`, x }, source), /characters|sentences/);
  assert.match(postProblem({ post: post.replace('a snowboard', 'a kurta'), x }, source), /isn't in the source/);
  assert.match(postProblem({ post: `${post.slice(0, -1)} at WhatRunsIndia.`, x }, source), /names the product/);
});
