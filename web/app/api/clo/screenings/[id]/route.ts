import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { verifyScreeningAccess } from "@/lib/clo/access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await verifyScreeningAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await query(
    "SELECT * FROM clo_screenings WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
