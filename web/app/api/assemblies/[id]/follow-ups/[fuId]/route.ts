import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fuId: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fuId } = await params;

  await query("DELETE FROM follow_ups WHERE id = $1 AND user_id = $2", [fuId, user.id]);

  return NextResponse.json({ success: true });
}
