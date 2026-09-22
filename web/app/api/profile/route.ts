import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getProfileData } from "@/lib/profile";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const data = await getProfileData(session.user.id);
  if (!data) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 255) : undefined;
  const role = typeof body?.role === "string" ? body.role.trim().slice(0, 255) : undefined;

  if (name === undefined && role === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const sets: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;
  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
  if (role !== undefined) { sets.push(`role = $${idx++}`); params.push(role); }
  params.push(session.user.id);

  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  return NextResponse.json({ success: true });
}
