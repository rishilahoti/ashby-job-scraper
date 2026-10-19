import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { notifyAdminOfSurveyResponse } from "@/lib/mailer";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readJson } from "@/lib/read-json";

export const dynamic = "force-dynamic";

// Stop asking once this many people have answered.
const MAX_RESPONSES = 100;

async function countResponses(): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM survey_responses`);
  return rows[0].n;
}

// Who is asking, without IPs (shared and changing IPs made them unreliable):
// the account if signed in (follows the person to any device), plus a random
// cookie id for this browser (survives a changed IP or a cleared localStorage).
const COOKIE = "survey_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function whoIs(request: NextRequest) {
  const session = await auth();
  const saved = request.cookies.get(COOKIE)?.value;
  return {
    userId: session?.user?.id ? Number(session.user.id) : null,
    email: session?.user?.email ?? null,
    device: saved && UUID.test(saved) ? saved : randomUUID(),
    hasCookie: !!saved && UUID.test(saved),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId, device, hasCookie } = await whoIs(request);
    // Signing in after answering anonymously: tie that answer to the account.
    if (userId && hasCookie) {
      await query(
        `UPDATE survey_responses SET user_id = $1
         WHERE device = $2 AND user_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM survey_responses WHERE user_id = $1)`,
        [userId, device]
      );
    }
    const { rows } = await query(`SELECT 1 FROM survey_responses WHERE device = $1 OR user_id = $2`, [device, userId]);
    return NextResponse.json({ open: rows.length === 0 && (await countResponses()) < MAX_RESPONSES });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ open: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    // A cleared cookie can answer again; this caps how fast anyone can stuff it.
    if (await isRateLimited("survey-ip", getClientIp(request), 5, 60)) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const [body, error] = await readJson<{ score?: unknown }>(request);
    if (error) return error;
    const score = body.score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: "Score must be 1 to 5." }, { status: 400 });
    }
    const { userId, email, device } = await whoIs(request);
    // A conflict on either unique column means this person already answered.
    const { rowCount } = await query(
      `INSERT INTO survey_responses (device, user_id, score) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [device, userId, score]
    );
    if (rowCount) void notifyAdminOfSurveyResponse(score, await countResponses(), email);
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
