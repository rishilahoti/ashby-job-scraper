const test = require('node:test');
const assert = require('node:assert/strict');

const { getPool, closeDb } = require('../src/store/db');

test('getPool().query executes a simple query against the configured database', async () => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT 1 AS one');
  assert.equal(rows[0].one, 1);
});

test('getPool().query surfaces real SQL errors (does not swallow them as connection failures)', async () => {
  const pool = getPool();
  await assert.rejects(() => pool.query('SELECT * FROM this_table_does_not_exist'));
});

test.after(async () => {
  await closeDb();
});
