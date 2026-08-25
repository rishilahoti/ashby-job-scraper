const fs = require('fs');
const path = require('path');
const { logger } = require('../utils');

const REGISTRY_PATH = path.resolve(__dirname, 'registry.json');
const VALID_SOURCES = new Set(['ashby', 'lever', 'greenhouse']);

function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  return JSON.parse(raw);
}

function getEnabledCompanies() {
  const all = loadRegistry();
  const enabled = all.filter(c => c.enabled);
  logger.debug(`Loaded ${enabled.length}/${all.length} enabled companies`);
  return enabled;
}

async function getEnabledCompaniesWithDb(pool) {
  const allRegistry = loadRegistry();
  const enabled = allRegistry.filter(c => c.enabled);

  const key = c => `${c.source || 'ashby'}:${c.slug.toLowerCase()}`;
  const enabledKeys = new Set(enabled.map(key));
  const disabledKeys = new Set(allRegistry.filter(c => !c.enabled).map(key));

  try {
    const { rows } = await pool.query(
      'SELECT name, slug, source FROM companies'
    );

    let dbOnlyCount = 0;
    for (const row of rows) {
      const source = row.source || 'ashby';
      const rowKey = `${source}:${row.slug.toLowerCase()}`;
      if (!enabledKeys.has(rowKey) && !disabledKeys.has(rowKey)) {
        enabled.push({
          company: row.name,
          slug: row.slug,
          source,
          enabled: true,
          frequencyHours: 12,
        });
        enabledKeys.add(rowKey);
        dbOnlyCount++;
      }
    }

    if (dbOnlyCount > 0) {
      logger.info(`Discovered ${dbOnlyCount} companies from DB not in registry`);
    }
  } catch (err) {
    logger.warn(`Could not read companies from DB, using registry only: ${err.message}`);
  }

  return enabled;
}

const SLUG_MAX_LEN = 128;
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= SLUG_MAX_LEN &&
    SLUG_REGEX.test(slug)
  );
}

function addCompany(slug, name, source = 'ashby') {
  if (!isValidSlug(slug)) {
    logger.warn(`Invalid slug rejected: "${slug}" (alphanumeric, hyphen, underscore only; max ${SLUG_MAX_LEN} chars)`);
    return false;
  }
  if (!VALID_SOURCES.has(source)) {
    logger.warn(`Invalid source rejected: "${source}" (expected one of ${[...VALID_SOURCES].join(', ')})`);
    return false;
  }

  const normalizedSlug = slug.toLowerCase();
  const registry = loadRegistry();
  const exists = registry.find(c => c.slug.toLowerCase() === normalizedSlug && (c.source || 'ashby') === source);
  if (exists) {
    logger.warn(`Company with slug "${slug}" already exists for source "${source}"`);
    return false;
  }

  registry.push({
    company: name || slug,
    slug: normalizedSlug,
    source,
    enabled: true,
    frequencyHours: 12,
  });

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  logger.info(`Added company "${name || slug}" (${normalizedSlug}, ${source}) to registry`);
  return true;
}

function getDueCompanies(companiesLastScraped, allCompanies) {
  const enabled = allCompanies || getEnabledCompanies();
  const now = Date.now();

  return enabled.filter(company => {
    const key = `${company.source || 'ashby'}:${company.slug.toLowerCase()}`;
    const lastScraped = companiesLastScraped[key];
    if (!lastScraped) return true;
    const elapsed = (now - new Date(lastScraped).getTime()) / (1000 * 60 * 60);
    return elapsed >= company.frequencyHours;
  });
}

module.exports = { loadRegistry, getEnabledCompanies, getEnabledCompaniesWithDb, addCompany, getDueCompanies };
