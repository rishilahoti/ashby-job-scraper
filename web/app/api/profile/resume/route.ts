import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getProfileData } from "@/lib/profile";
import { ensureUserResumeColumns, extractResumeTextFromPdf } from "@/lib/resume-match";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const formData = await request.formData();
  const resume = formData.get("resume");

  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "Resume PDF is required" }, { status: 400 });
  }

  if (!isPdfFile(resume)) {
    return NextResponse.json({ error: "Only PDF resumes are supported" }, { status: 400 });
  }

  if (resume.size === 0 || resume.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume must be between 1 byte and 5 MB" }, { status: 400 });
  }

  try {
    const text = await extractResumeTextFromPdf(new Uint8Array(await resume.arrayBuffer()));
    if (text.length < 80) {
      return NextResponse.json({ error: "Could not extract enough text from this PDF" }, { status: 400 });
    }

    await ensureUserResumeColumns();
    await query(
      `UPDATE users SET resume_text = $1, resume_filename = $2, resume_uploaded_at = NOW() WHERE id = $3`,
      [text, resume.name.trim().slice(0, 255), session.user.id]
    );

    const data = await getProfileData(session.user.id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}