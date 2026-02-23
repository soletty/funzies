import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

function generateShareCode(): string {
  return randomBytes(4).toString("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

  const ownerRows = await query<{ share_code: string | null }>(
    "SELECT share_code FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );
  if (!ownerRows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { role } = await request.json();
  if (!role || !["read", "write"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let shareCode = ownerRows[0].share_code;
  if (!shareCode) {
    shareCode = generateShareCode();
  }

  await query(
    "UPDATE assemblies SET share_code = $1, share_role = $2 WHERE id = $3",
    [shareCode, role, assemblyId]
  );

  const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://localhost:3000";
  const baseUrl = process.env.NEXTAUTH_URL || origin;
  const shareUrl = `${baseUrl}/invite/${shareCode}`;

  return NextResponse.json({ shareCode, shareUrl, role });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

  const ownerRows = await query<{ share_code: string | null; share_role: string | null }>(
    "SELECT share_code, share_role FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );
  if (!ownerRows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const users = await query(
    `SELECT s.id, s.role, s.joined_at, u.id as user_id, u.name, u.email
     FROM assembly_shares s
     JOIN users u ON s.user_id = u.id
     WHERE s.assembly_id = $1
     ORDER BY s.joined_at DESC`,
    [assemblyId]
  );

  return NextResponse.json({
    shareCode: ownerRows[0].share_code,
    shareRole: ownerRows[0].share_role,
    users,
  });
}
