import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ statuses: {} });

  const { rows } = await query<{ job_id: string; status: string }>(
    `SELECT job_id, status FROM user_job_status WHERE "userId" = $1`,
    [session.user.id]
  );
  const statuses: Record<string, string> = {};
  for (const row of rows) statuses[row.job_id] = row.status;
  return NextResponse.json({ statuses });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const jobId = String(body?.jobId || "");
  const status = body?.status;
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  if (status !== "applied" && status !== "ignored" && status !== "new") {
    return NextResponse.json({ error: "status must be 'applied', 'ignored', or 'new'" }, { status: 400 });
  }

  if (status === "new") {
    await query(`DELETE FROM user_job_status WHERE "userId" = $1 AND job_id = $2`, [session.user.id, jobId]);
  } else {
    await query(
      `INSERT INTO user_job_status ("userId", job_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT ("userId", job_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [session.user.id, jobId, status]
    );
  }

  return NextResponse.json({ success: true });
}
