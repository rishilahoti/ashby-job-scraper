#!/usr/bin/env node
// One-time: fills base_score/matched_keywords for rows written before those
// columns existed. New rows get them via upsertJob going forward.
const { getPool, closeDb } = require('../src/store/db');
const config = require('../src/config');
const { computeStoredScore } = require('../src/intelligence/rules-engine');

const CHUNK = 200;

async function main() {
  const pool = getPool();
  const rules = config.intelligence.rules;
  const { rows } = await pool.query(
    'SELECT id, title, description, location, remote, department FROM jobs'
  );

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(chunk.map((job) => {
      const { baseScore, matchedKeywords } = computeStoredScore(job, rules);
      return pool.query(
        'UPDATE jobs SET base_score = $1, matched_keywords = $2 WHERE id = $3',
        [baseScore, matchedKeywords, job.id]
      );
    }));
    console.log(`Backfilled ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
