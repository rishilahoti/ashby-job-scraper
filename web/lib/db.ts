import { Pool, type QueryResultRow } from "pg";

// DATABASE_URLS: comma-separated, priority order (primary first). Falls back to
// single DATABASE_URL when unset — existing single-DB setups need no changes.
function getDbUrls(): string[] {
  return (process.env.DATABASE_URLS || process.env.DATABASE_URL || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

let pools: Pool[] | null = null;
let activeIndex = 0;

function getPools(): Pool[] {
  if (pools) return pools;
  pools = getDbUrls().map((url) => {
    const p = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
    });
    p.on("error", () => {});
    return p;
  });
  return pools;
}

function isConnectionFailure(err: unknown): boolean {
  const msg = (err as Error)?.message || "";
  return (
    msg.includes("timeout") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("Connection terminated") ||
    msg.includes("compute time") // Neon free-tier quota exhausted
  );
}

// ponytail: this is failover, not replication — no reconciliation between DBs.
// Rows written to a backup DB while the primary is down won't exist on the
// primary once it recovers and traffic moves back. See src/store/db.js for
// the scraper-side equivalent (same tradeoff, same reasoning).
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: (string | number | boolean | null)[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const list = getPools();
  const maxRetries = 2;
  let lastErr: unknown;

  const order = [
    ...Array.from({ length: list.length - activeIndex }, (_, i) => activeIndex + i),
    ...Array.from({ length: activeIndex }, (_, i) => i),
  ];

  for (const i of order) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await list[i].query<T>(text, params);
        activeIndex = i;
        return result;
      } catch (err) {
        lastErr = err;
        if (!isConnectionFailure(err)) throw err; // real query error — don't fail over or retry
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
  }

  throw lastErr;
}
