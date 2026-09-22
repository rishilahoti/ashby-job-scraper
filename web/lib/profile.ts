import { query } from "./db";

export interface ProfileData {
  name: string | null;
  role: string | null;
  email: string;
  image: string | null;
  connectedProviders: string[];
}

export async function getProfileData(userId: string): Promise<ProfileData | null> {
  const [{ rows: userRows }, { rows: accountRows }] = await Promise.all([
    query<{ name: string | null; role: string | null; email: string; image: string | null }>(
      `SELECT name, role, email, image FROM users WHERE id = $1`,
      [userId]
    ),
    query<{ provider: string }>(`SELECT provider FROM accounts WHERE "userId" = $1`, [userId]),
  ]);

  const user = userRows[0];
  if (!user) return null;

  return {
    name: user.name,
    role: user.role,
    email: user.email,
    image: user.image,
    connectedProviders: accountRows.map((r) => r.provider),
  };
}
