const { logger, delay } = require('../utils');
const { fetchJobBoard } = require('../fetch');
const { loadRegistry } = require('../sources');
const store = require('../store');

// Domains here share one hosted job-board domain with a path-based company slug
// (jobs.ashbyhq.com/{slug}), which is what fetchCandidateSlugs()'s path-segment
// extraction assumes — confirmed indexed by Common Crawl and CCBot-permitted in
// robots.txt for all four. Lever explicitly blocks CCBot in robots.txt, so it has
// no free crawl index to query and isn't supported here (use search-engine
// `site:jobs.lever.co` queries for that one instead). Recruitee/Teamtailor/Pinpoint
// use a per-company SUBDOMAIN instead of a path slug (company.recruitee.com) —
// that needs hostname-based extraction, not the path-based logic below, so they
// aren't wired into auto-discovery yet even though manual "+Add" already works
// for them.
const CDX_DOMAINS = {
  ashby: 'jobs.ashbyhq.com',
  greenhouse: 'job-boards.greenhouse.io',
  workable: 'apply.workable.com',
  smartrecruiters: 'jobs.smartrecruiters.com',
};

// Paths on jobs.ashbyhq.com that are Ashby app routes, not company slugs (see its robots.txt).
const ASHBY_RESERVED_PATHS = new Set(['meeting', 'b', 'api']);

// Same rule the registry itself enforces (src/sources/index.js isValidSlug) — real board
// tokens are alphanumeric/hyphen/underscore only. Common Crawl URLs occasionally decode
// into garbage (stray punctuation from a query string bleeding into the path); reject
// those before ever hitting the live API with them.
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

// SmartRecruiters company identifiers are case-sensitive (e.g. "BMWDealerCareers") —
// every other source's slug is lowercase-insensitive. Mirrors the same exception in
// web/app/api/companies/route.ts's manual "+Add" flow.
const CASE_SENSITIVE_SOURCES = new Set(['smartrecruiters']);

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
    if (!CASE_SENSITIVE_SOURCES.has(source)) slug = slug.toLowerCase();
    if (!SLUG_REGEX.test(slug)) continue;
    if (source === 'ashby' && ASHBY_RESERVED_PATHS.has(slug)) continue;
    slugs.add(slug);
  }
  return [...slugs];
}

async function getKnownSlugs(source) {
  const caseSensitive = CASE_SENSITIVE_SOURCES.has(source);
  const norm = (s) => (caseSensitive ? s : s.toLowerCase());
  const known = new Set();
  for (const c of loadRegistry()) {
    if ((c.source || 'ashby') === source) known.add(norm(c.slug));
  }
  const pool = store.getPool();
  const { rows } = await pool.query('SELECT slug FROM companies WHERE source = $1', [source]);
  for (const row of rows) known.add(norm(row.slug));
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
