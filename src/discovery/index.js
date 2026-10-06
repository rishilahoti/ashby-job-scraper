const { logger, delay } = require('../utils');
const { fetchJobBoard } = require('../fetch');
const { loadRegistry, isValidSlug } = require('../sources');
const store = require('../store');

// Domains here share one hosted job-board domain with a path-based company slug
// (jobs.ashbyhq.com/{slug}), which is what slugFromCrawledUrl()'s path-segment
// extraction assumes — confirmed indexed by Common Crawl and CCBot-permitted in
// robots.txt for all four. Lever explicitly blocks CCBot in robots.txt, so it has
// no free crawl index to query and isn't supported here (use search-engine
// `site:jobs.lever.co` queries for that one instead).
const CDX_DOMAINS = {
  ashby: 'jobs.ashbyhq.com',
  greenhouse: 'job-boards.greenhouse.io',
  workable: 'apply.workable.com',
  smartrecruiters: 'jobs.smartrecruiters.com',
};

// These give each company its own subdomain (acme.recruitee.com) instead of a
// path slug. Common Crawl indexes only 1-5 CDX pages per domain for them, so
// every page is read — full coverage, unlike the single capped request the
// path-based domains above get.
const CDX_SUBDOMAIN_DOMAINS = {
  recruitee: 'recruitee.com',
  teamtailor: 'teamtailor.com',
  pinpoint: 'pinpointhq.com',
  workday: 'myworkdayjobs.com',
  keka: 'keka.com',
};

// Bounds the requests per run if one of those indexes ever balloons.
const MAX_CDX_PAGES = 10;

// The providers' own sites on those domains, not company boards.
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'auth', 'blog', 'docs', 'help', 'jobs', 'status', 'support']);

// Paths on jobs.ashbyhq.com that are Ashby app routes, not company slugs (see its robots.txt).
const ASHBY_RESERVED_PATHS = new Set(['meeting', 'b', 'api']);

// SmartRecruiters company identifiers are case-sensitive (e.g. "BMWDealerCareers") —
// every other source's slug is lowercase-insensitive. Mirrors the same exception in
// web/app/api/companies/route.ts's manual "+Add" flow.
const CASE_SENSITIVE_SOURCES = new Set(['smartrecruiters']);

const VERIFY_CONCURRENCY = 5;
const VERIFY_DELAY_MS = 300;

// Common Crawl's index server drops connections and returns 502s under load;
// one flaky response shouldn't cost a source its whole run.
async function fetchCdx(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      lastError = new Error(`Common Crawl returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < 3) await delay(5000 * attempt);
  }
  throw lastError;
}

async function getLatestCdxIndexId() {
  const data = JSON.parse(await fetchCdx('https://index.commoncrawl.org/collinfo.json'));
  return data[0].id;
}

// The company identifier a crawled URL points at, in the form fetchJobBoard
// expects, or null if it isn't a company board.
function slugFromCrawledUrl(source, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  let slug;
  const subdomainDomain = CDX_SUBDOMAIN_DOMAINS[source];
  if (!subdomainDomain) {
    slug = url.pathname.split('/').filter(Boolean)[0];
  } else {
    if (!url.hostname.endsWith(`.${subdomainDomain}`)) return null;
    const labels = url.hostname.slice(0, -subdomainDomain.length - 1).split('.');
    if (source === 'workday') {
      // acme.wd5.myworkdayjobs.com/en-US/Careers/job/... — the site is the
      // first path segment after an optional locale.
      const segments = url.pathname.split('/').filter(Boolean);
      const site = /^[a-z]{2}(-[a-z]{2})?$/i.test(segments[0] ?? '') ? segments[1] : segments[0];
      if (labels.length !== 2 || !/^wd\d+$/.test(labels[1]) || !site) return null;
      slug = `${labels[0]}/${labels[1]}/${site}`;
    } else if (source === 'teamtailor' && labels.length === 2 && labels[1] === 'na') {
      slug = labels.join('.');
    } else {
      if (labels.length !== 1 || RESERVED_SUBDOMAINS.has(labels[0])) return null;
      // Every Keka customer has acme.keka.com (its HR app); only /careers is a job board.
      if (source === 'keka' && !url.pathname.toLowerCase().startsWith('/careers')) return null;
      slug = labels[0];
    }
  }

  if (!slug) return null;
  if (!CASE_SENSITIVE_SOURCES.has(source)) slug = slug.toLowerCase();
  if (source === 'ashby' && ASHBY_RESERVED_PATHS.has(slug)) return null;
  // Common Crawl URLs occasionally decode into garbage (stray punctuation from a
  // query string bleeding into the path) — the registry's own slug rule rejects
  // those before they ever hit the live API.
  return isValidSlug(slug, source) ? slug : null;
}

// Common Crawl's CDX API returns newline-delimited JSON, one crawled URL per line.
async function fetchCandidateSlugs(source, cdxLimit) {
  const indexId = await getLatestCdxIndexId();
  const endpoint = `https://index.commoncrawl.org/${indexId}-index`;
  const responses = [];

  const subdomainDomain = CDX_SUBDOMAIN_DOMAINS[source];
  if (subdomainDomain) {
    const query = new URLSearchParams({ url: `*.${subdomainDomain}`, output: 'json', fl: 'url' });
    const { pages } = JSON.parse(await fetchCdx(`${endpoint}?${query}&showNumPages=true`));
    if (pages > MAX_CDX_PAGES) logger.warn(`Reading ${MAX_CDX_PAGES} of ${pages} Common Crawl pages for ${subdomainDomain}`);
    for (let page = 0; page < Math.min(pages, MAX_CDX_PAGES); page++) {
      // A page that still fails after retries (Workday's are several MB and
      // time out) costs only its own candidates, not the whole run's.
      try {
        responses.push(await fetchCdx(`${endpoint}?${query}&page=${page}`));
      } catch (err) {
        logger.warn(`Skipping Common Crawl page ${page + 1}/${pages} for ${subdomainDomain}: ${err.message}`);
      }
    }
  } else {
    const url = new URL(endpoint);
    url.searchParams.set('url', `${CDX_DOMAINS[source]}/*`);
    url.searchParams.set('output', 'json');
    url.searchParams.set('limit', cdxLimit);
    responses.push(await fetchCdx(url));
  }

  const slugs = new Set();
  for (const line of responses.join('\n').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const slug = slugFromCrawledUrl(source, entry.url);
    if (slug) slugs.add(slug);
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

// The slug, capitalized — minus Workday's wdHost/site segments and
// Teamtailor's region suffix, which aren't part of the company's name.
function companyName(slug, source) {
  const name = source === 'workday' ? slug.split('/')[0] : slug.replace(/\.na$/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
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
        await store.upsertCompany(companyName(slug, source), slug, source);
        logger.info(`Added "${slug}" (${source}, ${jobCount} jobs)`);
      }
      added++;
    }

    if (i + VERIFY_CONCURRENCY < slugs.length) await delay(VERIFY_DELAY_MS);
  }

  return { checked, added };
}

async function discoverCompanies({ source, cdxLimit = 3000, verifyLimit = 300, dryRun = false }) {
  const crawled = CDX_DOMAINS[source] ?? (CDX_SUBDOMAIN_DOMAINS[source] && `*.${CDX_SUBDOMAIN_DOMAINS[source]}`);
  if (!crawled) {
    const supported = [...Object.keys(CDX_DOMAINS), ...Object.keys(CDX_SUBDOMAIN_DOMAINS)];
    throw new Error(`Unsupported source "${source}" — must be one of: ${supported.join(', ')}`);
  }

  logger.info(`Fetching crawled URLs for ${crawled} from Common Crawl...`);
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

module.exports = { discoverCompanies, slugFromCrawledUrl };
