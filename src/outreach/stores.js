// Finds Shopify brands worldwide and the addresses they publish on their own
// sites. Public pages only, one request at a time.
const dns = require('dns').promises;
const net = require('net');
const { logger, delay, timeLimit } = require('../utils');
const { fetchCdx, getLatestCdxIndexId } = require('../discovery');
const { adFacts, addAdvertisers } = require('./ads');
const SEED = require('./seed-hosts.json');

const UA = 'Mozilla/5.0 (compatible; WhatRunsIndia-store-check/1.0; +https://whatrunsindia.com)';
const PAGES = ['/', '/pages/contact', '/pages/contact-us', '/pages/about', '/pages/about-us', '/policies/privacy-policy', '/policies/terms-of-service', '/policies/refund-policy', '/policies/shipping-policy'];
const CURSOR_KEY = 'outreach_cdx_cursor';
// Hundreds of unknown sites feed this: a page past this size is skipped.
const MAX_PAGE_BYTES = 8 * 1048576;
const MAX_REDIRECTS = 5;
const MIN_PRODUCTS = 5;
// Past this they have an in-house studio and won't read a cold email.
const MAX_PRODUCTS = 2500;
const MAX_CONTACTS = 2;
const PHOTOS_PER_STYLE = 6;
// India's rate is the published estimate at whatrunsindia.com/blog/catalog-photoshoot-cost-india;
// elsewhere the email states its own assumption.
const RUPEES_PER_PHOTO = 400;
const DOLLARS_PER_PHOTO = 40;
// Where an English cold email can land and be read, with the time zone it
// should arrive in. The EU is out: cold email there is the riskiest legally.
const MARKETS = { US: 'America/Chicago', GB: 'Europe/London', CA: 'America/Toronto', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', AE: 'Asia/Dubai', SG: 'Asia/Singapore', IN: 'Asia/Kolkata', ZA: 'Africa/Johannesburg' };

const EMAIL = /\b[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|rediffmail|hotmail|outlook|live|icloud|aol|proton|protonmail|gmx|zohomail)\./;
const NOT_A_LETTER = '(?![a-z])';
// Prefix matches catch "grievanceofficer"; the short words need a boundary so
// "pr" doesn't catch "priya".
const SKIP_LOCAL = new RegExp(`^(?:(?:hr|pr|jobs|dpo)${NOT_A_LETTER}|grievance|customer[-_.]?grievance|nodal|legal|privacy|compliance|complaint|returns?|refunds?|exchange|careers?|accounts?|billing|finance|wholesale|bulk|press|no[-_.]?reply|do[-_.]?not[-_.]?reply|orders?|abuse|postmaster|webmaster|shipping|delivery|tracking)`);
const GOOD_LOCAL = new RegExp(`^(founders?|ceo|hello|hi|hey|contact|info|connect|team|marketing|brand|business|partnerships?)${NOT_A_LETTER}`);
const ROLE_LOCAL = new RegExp(`^(support|care|customer[._-]?(care|support|service)|help|helpdesk|service|services|sales|shop|enquir(y|ies)|inquir(y|ies)|feedback|admin|mail|office|wecare|cs)${NOT_A_LETTER}`);
const NAME_STOP = /^(Grievance|Officer|Nodal|Founder|Director|Contact|Email|Address|Name|Company|Private|Limited|Pvt|Ltd|Customer|Support|India|The|Our|Your|Team|Details|Phone|Mobile|Number|Designation)$/;

function decode(s) {
  return s.replace(/&#64;|&#x40;|&commat;|%40|\\u0040/gi, '@').replace(/&#46;|&#x2e;|&period;/gi, '.').replace(/&amp;/g, '&')
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@').replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');
}

// Cloudflare's scrape shield XORs the address with the first byte.
function cloudflareEmail(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function isJunk(email) {
  const [local, domain] = email.split('@');
  return /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|eot|mp4|pdf)$/.test(email) || /@\d+x\./.test(email)
    || /sentry/.test(domain) || /^[0-9a-f]{24,}$/.test(local)
    || /^(example|domain|yourdomain|your-domain|email|test|sample|mysite|company|mail|website|store)\.(com|org|net|in)$/.test(domain)
    || /^(you|your|name|user|yourname|your-email|youremail|email|john|jane|john\.doe|jane\.doe|test)$/.test(local)
    || /(^|\.)(shopify\.com|myshopify\.com|shopifypreview\.com|w3\.org|schema\.org|wixpress\.com|cloudflare\.com|googleusercontent\.com|klaviyo\.com|judge\.me)$/.test(domain);
}

// A plain scan, because a lazy regex here goes quadratic on a page full of
// unclosed <script> tags.
function withoutBlock(html, tag) {
  const lower = html.toLowerCase();
  let out = '';
  let at = 0;
  for (;;) {
    const open = lower.indexOf(`<${tag}`, at);
    if (open < 0) return out + html.slice(at);
    out += `${html.slice(at, open)} `;
    const close = lower.indexOf(`</${tag}`, open);
    const end = close < 0 ? -1 : lower.indexOf('>', close);
    if (end < 0) return out;
    at = end + 1;
  }
}

// One space between words first, so nothing below backtracks on long runs.
const withoutScripts = (html) => withoutBlock(withoutBlock(html, 'script'), 'style').replace(/\s+/g, ' ');
const withoutTags = (text) => text.replace(/<[^<>]*>/g, ' ');

function extractEmails(html) {
  const clean = withoutScripts(html);
  const found = new Set();
  for (const m of clean.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) found.add(cloudflareEmail(m[1]).toLowerCase());
  const text = decode(clean);
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    let target = m[1];
    try { target = decodeURIComponent(target); } catch { /* a stray % in a mailto */ }
    for (const x of target.slice(0, 320).matchAll(EMAIL)) found.add(x[0].toLowerCase());
  }
  // No address is this long, and the email pattern is slow on endless tokens.
  for (const x of withoutTags(text).replace(/\S{320,}/g, ' ').matchAll(EMAIL)) found.add(x[0].toLowerCase());
  return [...found].filter((e) => !isJunk(e));
}

function registrable(domain) {
  const parts = domain.toLowerCase().replace(/^www\./, '').split('.');
  const twoLevel = parts.length > 2 && parts.at(-1).length === 2 && /^(co|com|net|org|ac|gov|edu)$/.test(parts.at(-2));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

function isOwnDomain(emailDomain, storeDomain) {
  const a = registrable(emailDomain);
  const b = registrable(storeDomain);
  const [x, y] = [a.split('.')[0], b.split('.')[0]];
  return a === b || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)));
}

// The grievance officer's name, only when the page labels it or gives an
// honorific. Indian e-commerce rules make sellers publish it.
function publishedName(plain) {
  const m = plain.match(/(?:[Gg]rievance\s+(?:[Rr]edressal\s+)?|[Nn]odal\s+)[Oo]fficer[\s\S]{0,60}?(?:[Nn]ame\s*[:-]\s*(?:(?:Mr|Ms|Mrs|Dr|Shri|Smt)\.?\s+)?|(?:Mr|Ms|Mrs|Dr|Shri|Smt)\.?\s+)([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){0,2})/);
  if (!m) return null;
  return m[1].split(/\s+/).some((t) => NAME_STOP.test(t)) ? null : m[1];
}

// Best first, at most two: a person's address, then a general one, then
// support. Compliance and order inboxes never get sales email.
function pickContacts(emails, storeDomain, person) {
  const rank = (email) => {
    const [local, domain] = email.split('@');
    const place = isOwnDomain(domain, storeDomain) ? 0 : FREE_MAIL.test(domain) ? 10 : 100;
    return place + (ROLE_LOCAL.test(local) ? 2 : GOOD_LOCAL.test(local) ? 1 : 0);
  };
  const first = person?.split(/\s+/)[0].toLowerCase();
  return emails
    .filter((e) => !SKIP_LOCAL.test(e.split('@')[0]) && rank(e) < 100)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, MAX_CONTACTS)
    // A name goes on an address only when the address is visibly theirs.
    .map((email) => {
      const local = email.split('@')[0];
      const theirs = first && first.length >= 3 && (local.split(/[._-]/).includes(first) || local === person.toLowerCase().replace(/\s+/g, ''));
      return { email, name: theirs ? person : null };
    });
}

function rupees(amount) {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(1)} crore`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(1)} lakh`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// What the email may say about the store. Everything comes from its own
// catalog; `scan` is only for the aggregate numbers in posts.
function storeFacts(meta, products, now = new Date()) {
  const sorted = [...products].filter((p) => p.published_at).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  if (!sorted.length) return null;
  const latest = sorted[0];
  const daysAgo = Math.floor((now - Date.parse(latest.published_at)) / 86400000);
  const photos = (p) => (p.images || []).length;
  const thin = products.filter((p) => photos(p) <= 2).length;
  const count = meta.published_products_count;
  const india = meta.country === 'IN';
  const photoCount = count * PHOTOS_PER_STYLE;
  const facts = {
    brand: meta.name,
    products: count,
    latestProduct: { name: latest.title, photos: photos(latest), ...(daysAgo <= 45 ? { addedDaysAgo: daysAgo } : {}) },
    reshootEverything: india
      ? { cost: rupees(photoCount * RUPEES_PER_PHOTO), basis: `${count} products, ${PHOTOS_PER_STYLE} photos each, at usual Indian studio rates` }
      : { cost: `$${(photoCount * DOLLARS_PER_PHOTO).toLocaleString('en-US')}`, basis: `${count} products, ${PHOTOS_PER_STYLE} photos each, at a modest $${DOLLARS_PER_PHOTO} a photo` },
    scan: { sampled: products.length, thin, single: products.filter((p) => photos(p) <= 1).length },
  };
  if (thin >= 5 && thin / products.length >= 0.15) facts.productsWithTwoOrFewerPhotos = { count: thin, outOf: products.length };
  return facts;
}

const PRIVATE_RANGES = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]]) PRIVATE_RANGES.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::1', 128], ['fc00::', 7], ['fe80::', 10]]) PRIVATE_RANGES.addSubnet(address, prefix, 'ipv6');

const isPlainHostname = (host) => host.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host);
const isPrivateAddress = ({ address, family }) => PRIVATE_RANGES.check(address, family === 6 ? 'ipv6' : 'ipv4');

// Store domains and redirects come from the sites themselves, so each hop is
// checked before we connect. ponytail: checked, not pinned, so DNS rebinding
// could still slip through. Pin the address if this ever handles secrets.
async function isPublicHost(host) {
  if (!isPlainHostname(host)) return false;
  const addresses = await dns.lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && !addresses.some(isPrivateAddress);
}

async function readCapped(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_PAGE_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function get(firstUrl) {
  let url = firstUrl;
  let rateLimited = false;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    if (target.protocol !== 'https:' || target.port || target.username || !(await isPublicHost(target.hostname))) return null;
    await delay(1100);
    let res;
    try {
      res = await timeLimit(fetch(target, { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) }), 20000);
    } catch {
      return null;
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      try {
        url = new URL(location, target).href;
      } catch {
        return null;
      }
      continue;
    }
    if ((res.status === 429 || res.status === 430) && !rateLimited) {
      rateLimited = true;
      await res.body?.cancel();
      await delay(20000);
      hop--;
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      return null;
    }
    return timeLimit(readCapped(res), 20000).catch(() => null);
  }
  return null;
}

const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function targetStore(host) {
  const text = await get(`https://${host}/meta.json`);
  const meta = text && json(text);
  if (!meta?.name) return null;
  if (!meta.country && meta.currency === 'INR') meta.country = 'IN';
  return MARKETS[meta.country] && meta.published_products_count >= MIN_PRODUCTS && meta.published_products_count <= MAX_PRODUCTS ? meta : null;
}

const hasMail = (domain) => dns.resolveMx(domain).then((r) => r.length > 0, () => false);

// { domain, name, facts, contacts } or null when there's nobody to write to.
async function readStore(host, meta, ad) {
  const domain = (meta.domain && !meta.domain.endsWith('.myshopify.com') ? meta.domain : host).replace(/^www\./, '');
  const base = `https://${domain}`;
  const emails = new Set();
  let person = null;
  for (const page of PAGES) {
    const html = await get(base + page);
    if (!html) continue;
    extractEmails(html).forEach((e) => emails.add(e));
    if (!person) person = publishedName(withoutTags(decode(withoutScripts(html))));
  }
  const usable = [];
  for (const contact of pickContacts([...emails], domain, person)) {
    if (await hasMail(contact.email.split('@')[1])) usable.push(contact);
  }
  if (!usable.length) return null;
  const list = json((await get(`${base}/products.json?limit=250`)) || '');
  const facts = list?.products?.length ? storeFacts(meta, list.products) : null;
  if (facts && adFacts(ad)) facts.metaAd = adFacts(ad);
  return facts ? { domain, name: meta.name, country: meta.country, tz: MARKETS[meta.country], facts, contacts: usable } : null;
}

async function saveBrand(pool, brand) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO outreach_brands (domain, name, country, tz, facts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (domain) DO NOTHING RETURNING id',
      [brand.domain, brand.name, brand.country, brand.tz, brand.facts]
    );
    if (rows[0]) {
      for (const [i, c] of brand.contacts.entries()) {
        // A second person at the brand hears two days after the first.
        await client.query(
          `INSERT INTO outreach_contacts (brand_id, email, name, next_at)
           VALUES ($1, $2, $3, NOW() + make_interval(days => $4)) ON CONFLICT (email) DO NOTHING`,
          [rows[0].id, c.email, c.name, i * 2]
        );
      }
    }
    await client.query('COMMIT');
    return Boolean(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Adds one more page of Common Crawl's myshopify.com hosts to the queue. Its
// index server often refuses, so a miss waits for tomorrow's run.
async function addCrawlHosts(pool) {
  const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [CURSOR_KEY]);
  const cursor = rows[0] ? JSON.parse(rows[0].value) : { index: await getLatestCdxIndexId(), page: 0 };
  const query = new URLSearchParams({ url: '*.myshopify.com', output: 'json', fl: 'url', page: String(cursor.page) });
  const text = await fetchCdx(`https://index.commoncrawl.org/${cursor.index}-index?${query}`);
  const hosts = new Set();
  for (const line of text.split('\n')) {
    try {
      const { hostname } = new URL(JSON.parse(line).url);
      if (hostname.endsWith('.myshopify.com')) hosts.add(hostname.toLowerCase());
    } catch { /* a truncated last line */ }
  }
  await pool.query(`INSERT INTO outreach_hosts (host, source) SELECT unnest($1::text[]), 'commoncrawl' ON CONFLICT DO NOTHING`, [[...hosts]]);
  // ponytail: one index is about 46k hosts. When they run out, point the
  // cursor at an older CC-MAIN index.
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CURSOR_KEY, JSON.stringify({ index: cursor.index, page: cursor.page + 1 })]
  );
  logger.info(`Outreach: ${hosts.size} hosts from ${cursor.index} page ${cursor.page}`);
}

// The daily scrape: works through unchecked hosts until it has `target` new
// brands or runs out of time.
async function collectBrands(pool, { target = 40, minutes = 25 } = {}) {
  await pool.query(`INSERT INTO outreach_hosts (host, source) SELECT unnest($1::text[]), 'seed' ON CONFLICT DO NOTHING`, [SEED]);
  const { rows: [{ waiting }] } = await pool.query('SELECT COUNT(*)::int AS waiting FROM outreach_hosts WHERE checked_at IS NULL');
  await addAdvertisers(pool).catch((err) => logger.warn(`Ad Library skipped: ${err.message}`));
  if (waiting < 1000) await addCrawlHosts(pool).catch((err) => logger.warn(`Common Crawl skipped: ${err.message}`));

  const stopAt = Date.now() + minutes * 60000;
  let added = 0;
  let checked = 0;
  while (added < target && Date.now() < stopAt) {
    // Advertisers first: they're already paying for attention.
    const { rows } = await pool.query(`SELECT host, ad FROM outreach_hosts WHERE checked_at IS NULL ORDER BY source = 'meta-ads' DESC, source = 'seed' DESC, host LIMIT 1`);
    if (!rows[0]) break;
    const { host, ad } = rows[0];
    // Marked first: a page that wedges the scrape is never picked up again.
    await pool.query(`UPDATE outreach_hosts SET checked_at = NOW(), outcome = 'started' WHERE host = $1`, [host]);
    let outcome = 'outside target markets';
    try {
      const meta = await targetStore(host);
      if (meta) {
        const brand = await readStore(host, meta, ad);
        outcome = brand ? 'no new brand' : 'nobody to write to';
        if (brand && await saveBrand(pool, brand)) {
          added++;
          outcome = 'added';
        }
      }
    } catch (err) {
      outcome = `error: ${err.message.slice(0, 120)}`;
    }
    await pool.query('UPDATE outreach_hosts SET checked_at = NOW(), outcome = $2 WHERE host = $1', [host, outcome]);
    checked++;
  }
  logger.info(`Outreach: checked ${checked} stores, added ${added} brands`);
  return { checked, added };
}

module.exports = { isPlainHostname, isPrivateAddress, extractEmails, publishedName, pickContacts, storeFacts, collectBrands, isOwnDomain, MARKETS };
