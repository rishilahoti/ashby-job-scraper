const test = require('node:test');
const assert = require('node:assert/strict');

const { getPool, initDb, closeDb } = require('../src/store/db');

test('getPool().query executes a simple query against the configured database', async () => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT 1 AS one');
  assert.equal(rows[0].one, 1);
});

test('getPool().query surfaces real SQL errors (does not swallow them as connection failures)', async () => {
  const pool = getPool();
  await assert.rejects(() => pool.query('SELECT * FROM this_table_does_not_exist'));
});

test('search_tsv: words match in any order, title hits rank first, unrelated updates keep it', async () => {
  await initDb();
  const pool = getPool();
  const insert = (jobId, title, description) =>
    pool.query(
      `INSERT INTO jobs (job_id, company, title, description, scraped_at, content_hash)
       VALUES ($1, 'SearchTestCo', $2, $3, NOW(), 'h')`,
      [jobId, title, description]
    );
  await pool.query(`DELETE FROM jobs WHERE company = 'SearchTestCo'`);
  await insert('fts-1', 'Office Manager', 'Some remote work, we also use Python.');
  await insert('fts-2', 'Senior Python Developer', 'Fully remote role.');
  // Mirrors upsertJob: every column rewritten, searchable text unchanged.
  await pool.query(`UPDATE jobs SET scraped_at = NOW(), updated_at = NOW() WHERE job_id = 'fts-1'`);

  const { rows } = await pool.query(
    `SELECT job_id FROM jobs
     WHERE company = 'SearchTestCo' AND search_tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY ts_rank(search_tsv, websearch_to_tsquery('english', $1)) DESC`,
    ['remote python']
  );
  assert.deepEqual(rows.map((r) => r.job_id), ['fts-2', 'fts-1']);
  await pool.query(`DELETE FROM jobs WHERE company = 'SearchTestCo'`);
});

test.after(async () => {
  await closeDb();
});
