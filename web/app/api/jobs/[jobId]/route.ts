import { NextRequest, NextResponse } from "next/server";
import { getJobById } from "@/lib/query";
import { getPool } from "@/lib/db";

const JOB_ID_MAX_LEN = 64;
const JOB_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_STATUSES = new Set(["new", "applied", "ignored"]);

function isValidJobId(id: string): boolean {
  return id.length > 0 && id.length <= JOB_ID_MAX_LEN && JOB_ID_REGEX.test(id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!isValidJobId(jobId)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }
    const job = await getJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!isValidJobId(jobId)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const body = await request.json();
    const status: string = body.status ?? "";
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'new', 'applied', or 'ignored'" },
        { status: 400 }
      );
    }

    const pool = getPool();
    const { rowCount } = await pool.query(
      "UPDATE jobs SET status = $1, updated_at = NOW() WHERE job_id = $2",
      [status, jobId]
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, jobId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
