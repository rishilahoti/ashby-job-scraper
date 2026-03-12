/**
 * One-time cleanup: prune job_snapshots to MAX_KEEP entries per (company, job_id).
 *
 * Usage:
 *   node scripts/cleanup-snapshots.js
 *
 * This script is safe to re-run. It will report how many rows were deleted.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const MAX_KEEP = 3; // Keep only the 3 most-recent snapshots per job

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  try {
    // Count before
    const { rows: before } = await pool.query('SELECT COUNT(*)::int AS cnt FROM job_snapshots');
    console.log(`job_snapshots before cleanup: ${before[0].cnt} rows`);

    // Prune: delete all but the MAX_KEEP most recent snapshots per (company, job_id)
    const { rowCount } = await pool.query(`
      DELETE FROM job_snapshots
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY company, job_id
              ORDER BY captured_at DESC
            ) AS rn
          FROM job_snapshots
        ) ranked
        WHERE rn > $1
      )
    `, [MAX_KEEP]);

    console.log(`Deleted ${rowCount ?? 0} old snapshot rows.`);

    // Count after
    const { rows: after } = await pool.query('SELECT COUNT(*)::int AS cnt FROM job_snapshots');
    console.log(`job_snapshots after cleanup: ${after[0].cnt} rows`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
