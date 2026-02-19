import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await query("DELETE FROM github_connections WHERE user_id = $1", [user.id]);
  return NextResponse.json({ ok: true });
}
