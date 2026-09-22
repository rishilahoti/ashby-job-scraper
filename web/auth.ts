import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import { getDbPool, query } from "@/lib/db";
import { verifyCode } from "@/lib/otp";
import { generatedAvatarUrl } from "@/lib/avatar";
import { sendWelcomeEmail, notifyAdminOfNewSignup } from "@/lib/mailer";

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
          void sendWelcomeEmail(user.email, user.name);
          void notifyAdminOfNewSignup(user.email);
        }

        return { id: String(user.id), name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    // allowDangerousEmailAccountLinking (above) trusts the OAuth profile's
    // email as proof of ownership — true for Google/GitHub's own verified
    // emails, but Google can return email_verified:false for some Workspace/
    // SSO configurations. Reject those explicitly rather than silently
    // linking on an unverified claim.
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as { email_verified?: boolean } | undefined;
        if (googleProfile?.email_verified === false) return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      } else if (token.id) {
        // The JWT's picture is only set at sign-in, so it goes stale after
        // linkAccount (or any other DB change) updates the user's image.
        // Re-read it on every request so session.user.image stays current.
        const { rows } = await query<{ image: string | null }>(`SELECT image FROM users WHERE id = $1`, [token.id as string]);
        if (rows[0]) token.picture = rows[0].image;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    // Fires once when the adapter creates a brand-new user row — i.e. a real
    // OAuth signup, not a returning user logging back in.
    async createUser({ user }) {
      if (!user.email) return;
      void sendWelcomeEmail(user.email, user.name ?? null);
      void notifyAdminOfNewSignup(user.email);
    },
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
