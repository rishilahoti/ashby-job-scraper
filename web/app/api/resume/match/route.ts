import { NextRequest, NextResponse } from "next/server";
import { extractResumeTextFromPdf, getResumeInsights, requestWithinLimit } from "@/lib/resume-match";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_REQUEST_BYTES = MAX_RESUME_BYTES + 64 * 1024;
const MIN_EXTRACTED_TEXT_LENGTH = 20;
const RESUME_MATCH_BUCKET = "resume-match";
const RESUME_MATCH_LIMIT = 6;
const RESUME_MATCH_WINDOW_MINUTES = 10;

function isPdfBytes(data: Uint8Array): boolean {
  return data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d;
}

export async function POST(request: NextRequest) {
  if (!requestWithinLimit(request, MAX_RESUME_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Resume must be 5 MB or smaller" }, { status: 413 });
  }

  const ip = getClientIp(request);
  if (await isRateLimited(RESUME_MATCH_BUCKET, ip, RESUME_MATCH_LIMIT, RESUME_MATCH_WINDOW_MINUTES)) {
    return NextResponse.json({ error: "Too many resume requests. Please try again later." }, { status: 429 });
  }

  const formData = await request.formData();
  const resume = formData.get("resume");
  const roleValue = formData.get("role");
  const role = typeof roleValue === "string" ? roleValue.trim().slice(0, 255) : null;

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
    return NextResponse.json(
      { error: "Could not process this resume PDF. It may be scanned or image-based." },
      { status: 400 }
    );
  }

  if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
    return NextResponse.json(
      { error: "Could not extract enough text from this PDF. It may be scanned or image-based." },
      { status: 400 }
    );
  }

  try {
    const insights = await getResumeInsights(text, role);
    return NextResponse.json(insights, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("resume-match failed", error);
    return NextResponse.json({ error: "Unable to match this resume right now" }, { status: 500 });
  }
}