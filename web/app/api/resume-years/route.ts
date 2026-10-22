import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readJson } from "@/lib/read-json";
import { MAX_RESUME_CHARS } from "@/lib/resume-terms";

export const dynamic = "force-dynamic";

// Tried in order, the next one when a call fails: a free tier ran out (429), 5xx,
// timeout, or an answer that isn't years. Both speak OpenAI's API. A provider
// whose key isn't set is skipped.
const PROVIDERS = [
  // Same model as the LinkedIn digest (src/digest/writer.js).
  { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", env: "GROQ_API_KEY", model: "openai/gpt-oss-120b" },
  { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", env: "GEMINI_API_KEY", model: "gemini-2.5-flash" },
];

const system = () => `You read a resume and return JSON {"years": number}: the person's total years of paid
professional work experience. Full-time jobs, part-time jobs, contracts and internships count. Add up
each job's start and end month ("Present" means today, ${new Date().toISOString().slice(0, 7)}),
counting overlapping months once. Education, degrees, courses and personal or open-source projects
don't count. One decimal place. 0 if there is no work experience.`;

async function readYears(provider: (typeof PROVIDERS)[number], key: string, text: string): Promise<number> {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: system() },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // A number, not Number(...): that turns null and "" into 0, a junior's filter.
  const years = JSON.parse(data.choices[0].message.content).years;
  if (typeof years !== "number" || !Number.isFinite(years) || years < 0 || years > 50) {
    // The type only: a string could be the resume's own words.
    throw new Error(`years of type ${typeof years}${typeof years === "number" ? ` (${years})` : ""}`);
  }
  return Math.round(years * 10) / 10;
}

// Reads a pasted resume's years of work experience with an LLM, for /match's
// experience filter. Dates are the one thing a keyword match can't read:
// education and project dates look the same as job dates. The resume isn't
// stored or logged here.
export async function POST(request: NextRequest) {
  const providers = PROVIDERS.filter((p) => process.env[p.env]);
  if (!providers.length) return NextResponse.json({ error: "Not available." }, { status: 503 });
  // Each call spends free-tier tokens, Groq's from the key the LinkedIn digest
  // uses too: per IP, plus a daily cap so many IPs can't drain them. The IP is
  // cf-connecting-ip, which clients can't forge: the Tunnel is the only way in.
  if (
    (await isRateLimited("resume-years", getClientIp(request), 10, 60)) ||
    (await isRateLimited("resume-years-all", "all", 500, 1440))
  ) {
    return NextResponse.json({ error: "Too many tries. Pick your experience instead." }, { status: 429 });
  }
  // MAX_RESUME_CHARS of non-Latin text is up to 3 bytes a character, over the usual 16 KB.
  const [body, failed] = await readJson<{ text?: unknown }>(request, 64 * 1024);
  if (failed) return failed;
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "No resume text." }, { status: 400 });
  }

  for (const provider of providers) {
    try {
      const years = await readYears(provider, process.env[provider.env]!, body.text.slice(0, MAX_RESUME_CHARS));
      return NextResponse.json({ years });
    } catch (err) {
      console.error(`resume-years ${provider.name}:`, err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ error: "Couldn't read your experience. Pick it instead." }, { status: 502 });
}
