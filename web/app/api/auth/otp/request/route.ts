import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { generateCode, storeCode } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mailer";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The per-email cooldown below only stops spamming one address — nothing
// stopped one IP from requesting codes for unlimited different emails.
const IP_MAX_REQUESTS = 10;
const IP_WINDOW_MINUTES = 60;

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimited("otp-request-ip", getClientIp(request), IP_MAX_REQUESTS, IP_WINDOW_MINUTES)) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const body = await request.json();
    const email = String(body?.email || "").toLowerCase().trim();
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const { rows } = await query<{ created_at: string }>(
      `SELECT created_at FROM email_otp_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [email]
    );
    const last = rows[0];
    if (last) {
      const elapsedSeconds = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds)}s before requesting another code.` },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    await storeCode(email, code);
    await sendOtpEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
