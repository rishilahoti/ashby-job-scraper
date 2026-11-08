// Brands spending on Meta ads right now, from the public Ad Library via Apify.
// They're the warmest leads we can find, and how long an ad has run is the
// sharpest thing an email can say. Off until APIFY_TOKEN is set.
const { logger, timeLimit } = require('../utils');

const ACTOR = 'jmlp~meta-ad-library-scraper';
const ADS_PER_SEARCH = 150;
const SEARCHES_PER_DAY = 3;
// $0.00015 an ad, so a day's run is about 7 cents.
const MAX_CHARGE_USD = 0.25;
const MIN_DAYS_LIVE = 14;

// Words in the ads of the brands this product suits best.
const KEYWORDS = ['free shipping', 'dress', 'jewelry', 'skincare', 'necklace', 'handbag', 'activewear', 'sneakers', 'home decor', 'new arrivals', 'perfume', 'swimwear', 'kurta', 'candles', 'linen'];
const COUNTRIES = ['US', 'GB', 'AU', 'CA', 'IN', 'AE', 'NZ', 'SG', 'ZA'];

const NOT_STORES = /(^|\.)(google|apple|facebook|instagram|fb|onelink|temu|aliexpress|amazon|ebay|etsy|walmart|shein|tiktok|linktr|bit)\.[a-z.]+$/;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

// The ad's own landing page, whichever field the format keeps it in.
const landingUrl = (ad) => ad.snapshot?.link_url || ad.snapshot?.cards?.find((c) => c.link_url)?.link_url || null;

// A real headline; catalog ads hold a {{template}} instead.
const headlineOf = (ad) => {
  const title = (ad.snapshot?.title || '').replace(/\p{Extended_Pictographic}/gu, '').trim();
  return title && !title.includes('{{') && title.length <= 70 ? title : null;
};

// One record per store, describing its longest-running live ad.
function advertisers(ads, now = new Date()) {
  const byHost = new Map();
  for (const ad of ads) {
    const url = landingUrl(ad);
    const host = url && hostOf(url);
    if (!host || NOT_STORES.test(host) || !ad.start_date) continue;
    const daysLive = Math.floor((now.getTime() / 1000 - ad.start_date) / 86400);
    const seen = byHost.get(host) || { daysLive: -1, headline: null, adsSeen: 0 };
    seen.adsSeen++;
    if (daysLive > seen.daysLive) {
      seen.daysLive = daysLive;
      seen.headline = headlineOf(ad);
    }
    byHost.set(host, seen);
  }
  return byHost;
}

// What the email may say about their ads.
function adFacts(ad) {
  if (!ad || ad.daysLive < MIN_DAYS_LIVE) return null;
  return { daysLiveOnMeta: ad.daysLive, ...(ad.headline ? { headline: ad.headline } : {}) };
}

async function saveAdvertisers(pool, byHost) {
  for (const [host, ad] of byHost) {
    await pool.query(
      `INSERT INTO outreach_hosts (host, source, ad) VALUES ($1, 'meta-ads', $2)
       ON CONFLICT (host) DO UPDATE SET ad = EXCLUDED.ad, source = 'meta-ads' WHERE outreach_hosts.checked_at IS NULL`,
      [host, ad]
    );
  }
}

// The day's searches, rotating through keywords and countries by day.
function todaysSearches(n) {
  return Array.from({ length: SEARCHES_PER_DAY }, (_, i) => ({
    keyword: KEYWORDS[(n + i) % KEYWORDS.length],
    country: COUNTRIES[(n + i * 3) % COUNTRIES.length],
  }));
}

async function addAdvertisers(pool, now = new Date()) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return 0;
  const n = Math.floor(now.getTime() / 86400000);
  let found = 0;
  for (const { keyword, country } of todaysSearches(n)) {
    const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240&maxTotalChargeUsd=${MAX_CHARGE_USD}`;
    const res = await timeLimit(fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: [keyword], searchType: 'keyword_unordered', activeStatus: 'active', country, maxAds: ADS_PER_SEARCH, maxConcurrency: 2 }),
      signal: AbortSignal.timeout(280000),
    }), 280000);
    if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
    const byHost = advertisers(await timeLimit(res.json(), 60000), now);
    await saveAdvertisers(pool, byHost);
    found += byHost.size;
    logger.info(`Outreach: ${byHost.size} advertisers for "${keyword}" in ${country}`);
  }
  return found;
}

module.exports = { advertisers, adFacts, addAdvertisers, saveAdvertisers, todaysSearches };
