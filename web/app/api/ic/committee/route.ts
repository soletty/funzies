import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    id: string;
    profile_id: string;
    status: string;
    members: unknown[];
    avatar_mappings: Record<string, string>;
    raw_files: Record<string, string>;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT c.* FROM ic_committees c
     JOIN investor_profiles p ON c.profile_id = p.id
     WHERE p.user_id = $1`,
    [user.id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "No committee found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<{ id: string }>(
    "SELECT id FROM investor_profiles WHERE user_id = $1",
    [user.id]
  );

  if (profiles.length === 0) {
    return NextResponse.json(
      { error: "Complete your investor profile first" },
      { status: 400 }
    );
  }

  const existing = await query<{ id: string }>(
    `SELECT c.id FROM ic_committees c WHERE c.profile_id = $1`,
    [profiles[0].id]
  );

  if (existing.length > 0) {
    return NextResponse.json({ id: existing[0].id });
  }

  const rows = await query<{ id: string }>(
    `INSERT INTO ic_committees (profile_id, status)
     VALUES ($1, 'queued')
     RETURNING id`,
    [profiles[0].id]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
