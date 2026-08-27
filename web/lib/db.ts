import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function getDbPool(): Pool {
  if (pool) return pool;
  const url = (process.env.DATABASE_URL || "").trim();
  pool = new Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  });
  pool.on("error", () => {});
  return pool;
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

// Retries transient connection failures (Neon cold-start / quota blips) —
// not a query retry, `isConnectionFailure` re-throws real query errors immediately.
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: (string | number | boolean | null | string[])[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const maxRetries = 2;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getDbPool().query<T>(text, params);
    } catch (err) {
      lastErr = err;
      if (!isConnectionFailure(err)) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastErr;
}
