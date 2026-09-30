import { NextRequest, NextResponse } from "next/server";
import { extractResumeTextFromPdf, getResumeInsights } from "@/lib/resume-match";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MIN_EXTRACTED_TEXT_LENGTH = 20;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const resume = formData.get("resume");
  const roleValue = formData.get("role");
  const role = typeof roleValue === "string" ? roleValue.trim().slice(0, 255) : null;

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
    if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Could not extract enough text from this PDF. It may be scanned or image-based." },
        { status: 400 }
      );
    }

    const insights = await getResumeInsights(text, role);
    return NextResponse.json(insights, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    console.error("resume-match failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}