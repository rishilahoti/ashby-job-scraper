const { logger, delay } = require('../utils');
const { fetchJobBoard } = require('../fetch');
const { loadRegistry } = require('../sources');
const store = require('../store');

// Ashby and Greenhouse's hosted job-board domains are indexed by Common Crawl
// (free, no API key) — Lever explicitly blocks CCBot in robots.txt, so it has
// no free crawl index to query and isn't supported here. Use search-engine
// `site:jobs.lever.co` queries for that one instead.
const CDX_DOMAINS = {
  ashby: 'jobs.ashbyhq.com',
  greenhouse: 'job-boards.greenhouse.io',
};

// Paths on jobs.ashbyhq.com that are Ashby app routes, not company slugs (see its robots.txt).
const ASHBY_RESERVED_PATHS = new Set(['meeting', 'b', 'api']);

// Same rule the registry itself enforces (src/sources/index.js isValidSlug) — real board
// tokens are alphanumeric/hyphen/underscore only. Common Crawl URLs occasionally decode
// into garbage (stray punctuation from a query string bleeding into the path); reject
// those before ever hitting the live API with them.
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

const VERIFY_CONCURRENCY = 5;
const VERIFY_DELAY_MS = 300;

async function getLatestCdxIndexId() {
  const res = await fetch('https://index.commoncrawl.org/collinfo.json');
  const data = await res.json();
  return data[0].id;
}

// Common Crawl's CDX API returns newline-delimited JSON, one crawled URL per line.
async function fetchCandidateSlugs(source, cdxLimit) {
  const domain = CDX_DOMAINS[source];
  const indexId = await getLatestCdxIndexId();

  const url = new URL(`https://index.commoncrawl.org/${indexId}-index`);
  url.searchParams.set('url', `${domain}/*`);
  url.searchParams.set('output', 'json');
  url.searchParams.set('limit', cdxLimit);
  const res = await fetch(url);
  const data = await res.text();

  const slugs = new Set();
  for (const line of data.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    let slug;
    try {
      slug = new URL(entry.url).pathname.split('/').filter(Boolean)[0];
    } catch {
      continue;
    }
    if (!slug) continue;
    slug = slug.toLowerCase();
    if (!SLUG_REGEX.test(slug)) continue;
    if (source === 'ashby' && ASHBY_RESERVED_PATHS.has(slug)) continue;
    slugs.add(slug);
  }
  return [...slugs];
}

async function getKnownSlugs(source) {
  const known = new Set();
  for (const c of loadRegistry()) {
    if ((c.source || 'ashby') === source) known.add(c.slug.toLowerCase());
  }
  const pool = store.getPool();
  const { rows } = await pool.query('SELECT slug FROM companies WHERE source = $1', [source]);
  for (const row of rows) known.add(row.slug.toLowerCase());
  return known;
}

function titleCase(slug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

// Verifies each unverified slug against the live posting API and, if it has
// open jobs, records it — either printed (--dry-run) or upserted into the
// companies table, which getEnabledCompaniesWithDb() already picks up on the
// next scrape run without any registry.json edit.
async function verifyAndAdd(slugs, source, { dryRun }) {
  let added = 0;
  let checked = 0;

  for (let i = 0; i < slugs.length; i += VERIFY_CONCURRENCY) {
    const batch = slugs.slice(i, i + VERIFY_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        const data = await fetchJobBoard(slug, source);
        return { slug, jobCount: data.jobs.length };
      })
    );

    for (const r of results) {
      checked++;
      if (r.status !== 'fulfilled' || r.value.jobCount === 0) continue;
      const { slug, jobCount } = r.value;
      if (dryRun) {
        logger.info(`[dry-run] would add "${slug}" (${source}, ${jobCount} jobs)`);
      } else {
        await store.upsertCompany(titleCase(slug), slug, source);
        logger.info(`Added "${slug}" (${source}, ${jobCount} jobs)`);
      }
      added++;
    }

    if (i + VERIFY_CONCURRENCY < slugs.length) await delay(VERIFY_DELAY_MS);
  }

  return { checked, added };
}

async function discoverCompanies({ source, cdxLimit = 3000, verifyLimit = 300, dryRun = false }) {
  if (!CDX_DOMAINS[source]) {
    throw new Error(`Unsupported source "${source}" — must be one of: ${Object.keys(CDX_DOMAINS).join(', ')}`);
  }

  logger.info(`Fetching crawled URLs for ${CDX_DOMAINS[source]} from Common Crawl...`);
  const candidates = await fetchCandidateSlugs(source, cdxLimit);
  logger.info(`${candidates.length} unique candidate slugs found`);

  await store.initDb();
  const known = await getKnownSlugs(source);
  const unknown = candidates.filter((s) => !known.has(s));
  logger.info(`${unknown.length} are not already tracked — verifying up to ${verifyLimit} of them live`);

  const toVerify = unknown.slice(0, verifyLimit);
  const { checked, added } = await verifyAndAdd(toVerify, source, { dryRun });

  logger.info(`Checked ${checked} candidates — ${added} confirmed active and ${dryRun ? 'would be added' : 'added'}`);
  return { candidates: candidates.length, unknown: unknown.length, checked, added };
}

module.exports = { discoverCompanies };
