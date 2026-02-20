import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

  const ownerRows = await query(
    "SELECT id FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );
  if (!ownerRows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email, role } = await request.json();
  if (!email || !role || !["read", "write"].includes(role)) {
    return NextResponse.json({ error: "Invalid email or role" }, { status: 400 });
  }

  const inviteToken = randomBytes(32).toString("hex");

  const existingUser = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  const sharedWithUserId = existingUser.length > 0 ? existingUser[0].id : null;

  const rows = await query<{ id: string }>(
    `INSERT INTO assembly_shares (assembly_id, shared_with_email, shared_with_user_id, role, invite_token)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (assembly_id, shared_with_email) DO UPDATE SET role = $4, invite_token = $5, accepted_at = NULL
     RETURNING id`,
    [assemblyId, email, sharedWithUserId, role, inviteToken]
  );

  const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://localhost:3000";
  const baseUrl = process.env.NEXTAUTH_URL || origin;
  const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

  return NextResponse.json({ id: rows[0].id, inviteUrl });
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

  const ownerRows = await query(
    "SELECT id FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );
  if (!ownerRows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shares = await query(
    `SELECT s.id, s.shared_with_email, s.role, s.accepted_at, s.invite_token, s.created_at,
            u.name as user_name
     FROM assembly_shares s
     LEFT JOIN users u ON s.shared_with_user_id = u.id
     WHERE s.assembly_id = $1
     ORDER BY s.created_at DESC`,
    [assemblyId]
  );

  return NextResponse.json(shares);
}
