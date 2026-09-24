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

  // Same shape as web/lib/query.ts: match via job_search_ids, rank by title_tsv.
  const { rows } = await pool.query(
    `SELECT job_id FROM jobs
     WHERE company = 'SearchTestCo' AND id IN (SELECT job_search_ids(websearch_to_tsquery('english', $1)))
     ORDER BY ts_rank(title_tsv, websearch_to_tsquery('english', $1)) DESC`,
    ['remote python']
  );
  assert.deepEqual(rows.map((r) => r.job_id), ['fts-2', 'fts-1']);

  const inTitle = async () =>
    (await pool.query(
      `SELECT title_tsv @@ to_tsquery('english', 'python') AS hit FROM jobs WHERE company = 'SearchTestCo' AND job_id = 'fts-1'`
    )).rows[0].hit;
  assert.equal(await inTitle(), false);
  await pool.query(`UPDATE jobs SET title = 'Python Office Manager' WHERE company = 'SearchTestCo' AND job_id = 'fts-1'`);
  assert.equal(await inTitle(), true, 'title_tsv must follow title changes');
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

test('job_search_ids reaches rows only through the search index', async () => {
  // Evaluating search_tsv @@ on a row reads its ~2.6KB tsvector from TOAST;
  // the planner doesn't cost that, and in production chose seq/index-walk
  // plans doing it for all ~75k rows (7-15s searches). The function pins the
  // GIN index. On CI's tiny table the planner would otherwise seq-scan —
  // the control query below shows it — so this is a real check.
  const client = await getPool().connect();
  const scans = async () =>
    (await client.query(
      `SELECT coalesce(sum(seq_scan), 0)::int AS seq FROM pg_stat_xact_user_tables WHERE relname = 'jobs'`
    )).rows[0].seq;
  try {
    await client.query('BEGIN');
    const q = `websearch_to_tsquery('english', 'engineer')`;
    let before = await scans();
    await client.query(`SELECT count(*) FROM jobs WHERE search_tsv @@ ${q}`);
    assert.ok((await scans()) > before, 'control: a plain query seq-scans this small table');
    before = await scans();
    await client.query(`SELECT count(*) FROM job_search_ids(${q})`);
    assert.equal(await scans(), before, 'job_search_ids must not seq-scan jobs');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('a scrape query survives the Node process stalling past 30s', { timeout: 120000 }, async () => {
  // Production incident: the scraper's event loop stalled ~40s on CPU-heavy
  // parsing, and the pool's client-side query_timeout (a wall-clock timer)
  // then failed queries the server had long since answered.
  const client = await getPool().connect();
  try {
    const query = client.query('SELECT 1 AS one'); // any client-side timer starts here
    query.catch(() => {}); // awaited below; don't let an early rejection go unhandled
    const until = Date.now() + 31000;
    while (Date.now() < until) {
      // Busy-wait: block the event loop like the scraper's stall did.
    }
    const { rows } = await query;
    assert.equal(rows[0].one, 1);
  } finally {
    client.release();
  }
});

test.after(async () => {
  await closeDb();
});
