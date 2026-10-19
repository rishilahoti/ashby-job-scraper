// Latest nodemailer (patches known CVEs), not next-auth's declared peer range
// (^7||^8) — safe to override because next-auth's own Email provider (the only
// thing that actually depends on that range) is never used here; we only call
// nodemailer directly, ourselves, for the custom email-OTP flow below.
import nodemailer from "nodemailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ashbyhq-scraper.vercel.app";

// Plain SMTP — works with a Gmail account + App Password (no new third-party
// signup needed) or any other SMTP provider (e.g. Resend's SMTP relay) by
// just changing these env vars, no code change.
function getTransport() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT || 587);
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error(
      "Email OTP is not configured — set EMAIL_SERVER_HOST, EMAIL_SERVER_USER, and EMAIL_SERVER_PASSWORD."
    );
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// Throws on failure; callers that must not fail catch it themselves.
async function send(to: string, message: { subject: string; text: string; html: string }): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER;
  await getTransport().sendMail({ from: `Ashby Jobs <${from}>`, to, ...message });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!process.env.EMAIL_SERVER_HOST && process.env.NODE_ENV !== "production") {
    // No SMTP configured locally — print the code instead of failing, so sign-in is testable without a real inbox.
    console.log(`[dev] OTP code for ${to}: ${code}`);
    return;
  }
  await send(to, {
    subject: `${code} is your Ashby Jobs sign-in code`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your sign-in code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}

// Pure content builder — kept separate from the network call so it's
// testable without a real SMTP connection.
export function buildWelcomeEmail(name: string | null): { subject: string; text: string; html: string } {
  const greeting = name ? `Hi ${name}` : "Hi there";
  const subject = "Welcome to Ashby Jobs";
  const text = `${greeting},\n\nThanks for signing up for Ashby Jobs. You can now track applied and ignored jobs across every device.\n\nStart browsing: ${SITE_URL}\n\nSee what else is new: ${SITE_URL}/changelog`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto">
      <h1 style="font-size:20px;color:#0C0A09;margin-bottom:4px">Welcome to Ashby Jobs 👋</h1>
      <p style="font-size:14px;color:#57534E;line-height:1.6">${greeting},</p>
      <p style="font-size:14px;color:#57534E;line-height:1.6">
        Thanks for signing up. Your account now syncs applied and ignored jobs across every device you sign in on.
      </p>
      <p style="margin:24px 0">
        <a href="${SITE_URL}" style="background:#473bce;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Browse jobs →</a>
      </p>
      <p style="font-size:12px;color:#A8A29E">
        Curious what's new? Check the <a href="${SITE_URL}/changelog" style="color:#473bce">changelog</a>.
      </p>
    </div>`;
  return { subject, text, html };
}

export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  try {
    await send(to, buildWelcomeEmail(name));
  } catch (err) {
    // Never let a mail-delivery failure (or missing SMTP config, e.g. in
    // local dev) break sign-up — this is a best-effort notification.
    console.error("sendWelcomeEmail failed", err);
  }
}

export async function notifyAdminOfSurveyResponse(score: number, total: number, email: string | null): Promise<void> {
  try {
    const admin = process.env.SIGNUP_NOTIFY_EMAIL || "rishilahoti99@gmail.com";
    const text = `${email ?? "Someone not signed in"} answered the pay survey: ${score}/5 (response ${total} of 100).`;
    await send(admin, { subject: `Survey: ${score}/5`, text, html: `<p>${text}</p>` });
  } catch (err) {
    console.error("notifyAdminOfSurveyResponse failed", err);
  }
}

export async function notifyAdminOfNewSignup(email: string): Promise<void> {
  try {
    const admin = process.env.SIGNUP_NOTIFY_EMAIL || "rishilahoti99@gmail.com";
    await send(admin, {
      subject: `New signup: ${email}`,
      text: `${email} just signed up for Ashby Jobs.`,
      html: `<p>${email} just signed up for Ashby Jobs.</p>`,
    });
  } catch (err) {
    console.error("notifyAdminOfNewSignup failed", err);
  }
}
