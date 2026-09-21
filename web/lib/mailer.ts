// Pinned to next-auth's peer range (^7||^8), not latest — newer majors fix a
// handful of CVEs (SSRF via the `raw` option, disableFileAccess bypass, IDN
// domain-spoofing) that don't apply here: we never use `raw`, and `to` is
// always our own validated address, never attacker-influenced.
import nodemailer from "nodemailer";

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

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER;
  await getTransport().sendMail({
    from: `Ashby Jobs <${from}>`,
    to,
    subject: `${code} is your Ashby Jobs sign-in code`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your sign-in code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
