import { query } from "./db";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Sliding-window log in Postgres, one round trip: count this key's recent
// hits, record this one only if it's allowed (a flood of blocked requests
// adds no rows, so the table stays bounded), and prune day-old rows — same
// opportunistic cleanup as email_otp_codes.
// ponytail: two requests racing at the edge can both get in (max + 1); fine
// for abuse throttling, lock the key's rows if it ever has to be exact.
export async function isRateLimited(
  bucket: string,
  key: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const { rows } = await query<{ limited: boolean }>(
    `WITH recent AS (
       SELECT COUNT(*) AS n FROM rate_limit_hits
       WHERE bucket = $1 AND key = $2 AND created_at > NOW() - make_interval(mins => $3)
     ), hit AS (
       INSERT INTO rate_limit_hits (bucket, key) SELECT $1, $2 FROM recent WHERE n < $4
     ), prune AS (
       DELETE FROM rate_limit_hits WHERE created_at < NOW() - INTERVAL '1 day'
     )
     SELECT n >= $4 AS limited FROM recent`,
    [bucket, key, windowMinutes, max]
  );
  return rows[0].limited;
}
