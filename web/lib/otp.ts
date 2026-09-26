import crypto from "crypto";
import { query } from "./db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string, email: string): string {
  return crypto.createHash("sha256").update(`${email.toLowerCase().trim()}:${code}`).digest("hex");
}

export function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function storeCode(email: string, code: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashCode(code, normalizedEmail);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  // Invalidate any earlier unconsumed codes for this email before issuing a new one.
  await query(`UPDATE email_otp_codes SET consumed_at = NOW() WHERE email = $1 AND consumed_at IS NULL`, [normalizedEmail]);
  await query(
    `INSERT INTO email_otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [normalizedEmail, codeHash, expiresAt.toISOString()]
  );
  // No cron for this table — piggyback cleanup of long-expired rows onto the
  // same write path that grows it, so it never accumulates unbounded.
  await query(`DELETE FROM email_otp_codes WHERE expires_at < NOW() - INTERVAL '1 day'`);
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashCode(code, normalizedEmail);

  // Count the attempt and consume on a match in one statement: the WHERE
  // re-evaluates under the row lock, so concurrent guesses serialize instead
  // of all reading attempts=0 and sneaking past MAX_ATTEMPTS, and only the
  // first of two parallel correct guesses sees consumed_at IS NULL.
  const { rows } = await query<{ ok: boolean }>(
    `UPDATE email_otp_codes
     SET attempts = attempts + 1,
         consumed_at = CASE WHEN code_hash = $3 THEN NOW() END
     WHERE id = (
       SELECT id FROM email_otp_codes
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1
     ) AND attempts < $2 AND consumed_at IS NULL
     RETURNING consumed_at IS NOT NULL AS ok`,
    [normalizedEmail, MAX_ATTEMPTS, codeHash]
  );
  return rows[0]?.ok === true;
}
