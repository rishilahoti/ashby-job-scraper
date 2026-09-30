import { query } from "./db";
import { ensureUserResumeColumns, getResumeInsights } from "./resume-match";
import type { ResumeJobMatch, ResumeRoleMatch } from "./resume-types";

export interface ProfileData {
  name: string | null;
  role: string | null;
  email: string;
  image: string | null;
  connectedProviders: string[];
  resumeFilename: string | null;
  resumeUploadedAt: string | null;
  resumeKeywords: string[];
  resumeMatchedRoles: ResumeRoleMatch[];
  resumeMatchedJobs: ResumeJobMatch[];
}

export async function getProfileData(userId: string): Promise<ProfileData | null> {
  await ensureUserResumeColumns();

  const [{ rows: userRows }, { rows: accountRows }] = await Promise.all([
    query<{
      name: string | null;
      role: string | null;
      email: string;
      image: string | null;
      resume_text: string | null;
      resume_filename: string | null;
      resume_uploaded_at: string | null;
    }>(
      `SELECT name, role, email, image, resume_text, resume_filename, resume_uploaded_at FROM users WHERE id = $1`,
      [userId]
    ),
    query<{ provider: string }>(`SELECT provider FROM accounts WHERE "userId" = $1`, [userId]),
  ]);

  const user = userRows[0];
  if (!user) return null;

  const resumeInsights = user.resume_text ? await getResumeInsights(user.resume_text, user.role) : null;

  return {
    name: user.name,
    role: user.role,
    email: user.email,
    image: user.image,
    connectedProviders: accountRows.map((r) => r.provider),
    resumeFilename: user.resume_filename,
    resumeUploadedAt: user.resume_uploaded_at ? new Date(user.resume_uploaded_at).toISOString() : null,
    resumeKeywords: resumeInsights?.keywords ?? [],
    resumeMatchedRoles: resumeInsights?.roles ?? [],
    resumeMatchedJobs: resumeInsights?.jobs ?? [],
  };
}
