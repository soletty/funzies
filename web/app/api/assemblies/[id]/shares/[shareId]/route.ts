import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId, shareId } = await params;

  const ownerRows = await query(
    "SELECT id FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );
  if (!ownerRows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    "DELETE FROM assembly_shares WHERE id = $1 AND assembly_id = $2",
    [shareId, assemblyId]
  );

  return NextResponse.json({ success: true });
}
