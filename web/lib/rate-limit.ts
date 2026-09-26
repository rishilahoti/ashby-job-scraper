import { query } from "./db";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Fixed-window counter in Postgres, one round trip: the upsert row-locks this
// key's counter, so concurrent requests increment it one at a time and each
// sees its own count — a burst can't all read the same "under the limit" count
// and slip through. One row per key per window, day-old windows pruned — same
// opportunistic cleanup as email_otp_codes.
// ponytail: fixed window allows up to 2x max across a window boundary; fine
// for abuse throttling, switch to a sliding window if it ever has to be exact.
export async function isRateLimited(
  bucket: string,
  key: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const { rows } = await query<{ limited: boolean }>(
    `WITH hit AS (
       INSERT INTO rate_limit_counters (bucket, key, window_start)
       VALUES ($1, $2, date_bin(make_interval(mins => $3), NOW(), TIMESTAMPTZ 'epoch'))
       ON CONFLICT (bucket, key, window_start) DO UPDATE SET hits = rate_limit_counters.hits + 1
       RETURNING hits
     ), prune AS (
       DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '1 day'
     )
     SELECT hits > $4 AS limited FROM hit`,
    [bucket, key, windowMinutes, max]
  );
  return rows[0].limited;
}
