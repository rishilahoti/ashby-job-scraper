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

  const { rows } = await query<{ id: number; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM email_otp_codes
     WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail]
  );
  const row = rows[0];
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;

  if (row.code_hash !== codeHash) {
    await query(`UPDATE email_otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return false;
  }

  await query(`UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1`, [row.id]);
  return true;
}
