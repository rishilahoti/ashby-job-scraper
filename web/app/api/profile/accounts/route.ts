import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

// Disconnecting an OAuth provider is always safe here — email-OTP sign-in
// only depends on users.email, never on an accounts row, so there's no
// "last auth method" lockout to guard against.
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const provider = String(body?.provider || "");
  if (provider !== "google" && provider !== "github") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  await query(`DELETE FROM accounts WHERE "userId" = $1 AND provider = $2`, [session.user.id, provider]);
  return NextResponse.json({ success: true });
}
