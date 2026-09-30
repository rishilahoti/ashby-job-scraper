import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getProfileData } from "@/lib/profile";
import { ensureUserResumeColumns, extractResumeTextFromPdf, isPdfBytes, requestWithinLimit } from "@/lib/resume-match";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_REQUEST_BYTES = MAX_RESUME_BYTES + 64 * 1024;
const MAX_RESUME_TEXT_LENGTH = 100_000;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!requestWithinLimit(request, MAX_RESUME_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Resume must be 5 MB or smaller" }, { status: 413 });
  }

  const formData = await request.formData();
  const resume = formData.get("resume");

  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "Resume PDF is required" }, { status: 400 });
  }

  if (resume.size === 0 || resume.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume must be between 1 byte and 5 MB" }, { status: 400 });
  }

  const bytes = new Uint8Array(await resume.arrayBuffer());
  if (!isPdfBytes(bytes)) {
    return NextResponse.json({ error: "Only PDF resumes are supported" }, { status: 400 });
  }

  let text: string;
  try {
    text = await extractResumeTextFromPdf(bytes);
  } catch {
    return NextResponse.json({ error: "Unable to process this resume PDF" }, { status: 400 });
  }

  if (text.length < 80) {
    return NextResponse.json({ error: "Could not extract enough text from this PDF" }, { status: 400 });
  }

  const storedText = text.slice(0, MAX_RESUME_TEXT_LENGTH);

  try {
    await ensureUserResumeColumns();
    await query(
      `UPDATE users SET resume_text = $1, resume_filename = $2, resume_uploaded_at = NOW() WHERE id = $3`,
      [storedText, resume.name.trim().slice(0, 255), session.user.id]
    );

    const data = await getProfileData(session.user.id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to save this resume right now" }, { status: 500 });
  }
}