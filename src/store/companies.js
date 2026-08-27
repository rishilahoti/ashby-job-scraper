const { getPool } = require('./db');

async function upsertCompany(name, slug, source = 'ashby') {
  const pool = getPool();
  const normalizedSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : slug;
  await pool.query(
    `INSERT INTO companies (name, slug, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug, source) DO UPDATE SET name = EXCLUDED.name`,
    [name, normalizedSlug, source]
  );
}

async function updateLastScraped(slug, source = 'ashby') {
  const pool = getPool();
  const normalizedSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : slug;
  await pool.query(
    `UPDATE companies SET last_scraped_at = NOW() WHERE LOWER(slug) = LOWER($1) AND source = $2`,
    [normalizedSlug, source]
  );
}

// Keyed by "source:slug" — same slug string can exist under different ATSes.
async function getAllCompaniesLastScraped() {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT slug, source, last_scraped_at FROM companies ORDER BY last_scraped_at DESC NULLS LAST'
  );
  const map = {};
  for (const row of rows) {
    const key = `${row.source}:${row.slug.toLowerCase()}`;
    const next = row.last_scraped_at ? row.last_scraped_at.toISOString() : null;
    const prev = map[key];
    if (
      !(key in map) ||
      (next !== null &&
        (prev == null || new Date(next).getTime() > new Date(prev).getTime()))
    ) {
      map[key] = next;
    }
  }
  return map;
}

module.exports = { upsertCompany, updateLastScraped, getAllCompaniesLastScraped };
