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
  await pool.query(`UPDATE jobs SET scraped_at = NOW(), updated_at = NOW() WHERE company = 'SearchTestCo' AND job_id = 'fts-1'`);

  const { rows } = await pool.query(
    `SELECT job_id FROM jobs
     WHERE company = 'SearchTestCo' AND search_tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY ts_rank(search_tsv, websearch_to_tsquery('english', $1)) DESC`,
    ['remote python']
  );
  assert.deepEqual(rows.map((r) => r.job_id), ['fts-2', 'fts-1']);
  await pool.query(`DELETE FROM jobs WHERE company = 'SearchTestCo'`);
});

test('initDb survives a schema statement that runs longer than the pool timeout', { timeout: 120000 }, async () => {
  // Production incident: the search GIN index build ran for minutes and was
  // cancelled by the pool's 30s statement timeout, failing every pipeline run.
  // Reproduce a long-running (not lock-waiting) statement: make initDb's
  // search backfill UPDATE hit one row whose trigger sleeps 31s.
  const pool = getPool();
  await initDb();
  await pool.query(`DELETE FROM jobs WHERE company = 'SlowTestCo'`);
  await pool.query(`ALTER TABLE jobs DISABLE TRIGGER jobs_search_tsv`);
  await pool.query(
    `INSERT INTO jobs (job_id, company, title, scraped_at, content_hash)
     VALUES ('slow-1', 'SlowTestCo', 'Slow', NOW(), 'h')`
  );
  await pool.query(`ALTER TABLE jobs ENABLE TRIGGER jobs_search_tsv`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION slow_test_sleep() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.company = 'SlowTestCo' THEN PERFORM pg_sleep(31); END IF;
      RETURN NEW;
    END $$
  `);
  await pool.query(
    `CREATE OR REPLACE TRIGGER slow_test_sleep BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION slow_test_sleep()`
  );
  try {
    await initDb();
    const { rows } = await pool.query(`SELECT search_tsv IS NOT NULL AS filled FROM jobs WHERE job_id = 'slow-1'`);
    assert.equal(rows[0].filled, true);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS slow_test_sleep ON jobs`);
    await pool.query(`DROP FUNCTION IF EXISTS slow_test_sleep()`);
    await pool.query(`DELETE FROM jobs WHERE company = 'SlowTestCo'`);
  }
});

test.after(async () => {
  await closeDb();
});
