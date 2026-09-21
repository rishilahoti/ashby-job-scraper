import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

interface StatusJobRow {
  job_id: string;
  status: string;
  title: string;
  company: string;
  is_active: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Deliberately not filtering is_active — removed jobs still show (title/company
  // only here; the job detail page shows "no longer available" on click-through).
  const { rows } = await query<StatusJobRow>(
    `SELECT s.job_id, s.status, j.title, j.company, j.is_active
     FROM user_job_status s
     JOIN jobs j ON j.job_id = s.job_id
     WHERE s."userId" = $1
     ORDER BY s.updated_at DESC`,
    [session.user.id]
  );

  const applied = rows.filter((r) => r.status === "applied");
  const ignored = rows.filter((r) => r.status === "ignored");
  const toSummary = (r: StatusJobRow) => ({ jobId: r.job_id, title: r.title, company: r.company, isActive: r.is_active });

  return NextResponse.json({ applied: applied.map(toSummary), ignored: ignored.map(toSummary) });
}
