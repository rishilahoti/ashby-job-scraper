import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import { getDbPool, query } from "@/lib/db";
import { verifyCode } from "@/lib/otp";
import { generatedAvatarUrl } from "@/lib/avatar";

interface DbUser {
  id: number;
  name: string | null;
  email: string;
  image: string | null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(getDbPool()),
  // Credentials (the email-OTP provider below) doesn't support Auth.js's
  // "database" session strategy — required whenever Credentials is mixed
  // with an adapter. The adapter is still used for user/account storage.
  session: { strategy: "jwt" },
  providers: [
    Google({
      // Same email across providers should link to one account, not fail
      // sign-in — this is what makes "started with email, later connected
      // Google" work.
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      id: "email-otp",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const code = String(credentials?.code || "").trim();
        if (!email || !code) return null;

        const valid = await verifyCode(email, code);
        if (!valid) return null;

        const { rows } = await query<DbUser>(`SELECT id, name, email, image FROM users WHERE email = $1`, [email]);
        let user = rows[0];
        if (!user) {
          const avatar = generatedAvatarUrl(email);
          const inserted = await query<DbUser>(
            `INSERT INTO users (email, image, avatar_source, "emailVerified")
             VALUES ($1, $2, 'generated', NOW())
             RETURNING id, name, email, image`,
            [email, avatar]
          );
          user = inserted.rows[0];
        }

        return { id: String(user.id), name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    // Fires for every OAuth account association — a brand-new OAuth signup
    // (right after the adapter creates the user row) and an existing user
    // connecting an additional provider both go through here. Only adopts
    // the new provider's avatar if nothing has "locked in" a real one yet,
    // so e.g. Google-connected-first keeps its avatar even after GitHub
    // connects later.
    async linkAccount({ account, profile, user }) {
      const newImage = (profile as { image?: string | null })?.image;
      if (!newImage || !user.id) return;
      await query(
        `UPDATE users SET image = $1, avatar_source = $2
         WHERE id = $3 AND (avatar_source IS NULL OR avatar_source = 'generated')`,
        [newImage, account.provider, user.id]
      );
    },
  },
});
