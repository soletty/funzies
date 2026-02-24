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
    `SELECT p.* FROM clo_panels p
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE pr.user_id = $1`,
    [user.id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "No panel found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<{ id: string }>(
    "SELECT id FROM clo_profiles WHERE user_id = $1",
    [user.id]
  );

  if (profiles.length === 0) {
    return NextResponse.json(
      { error: "Complete your CLO profile first" },
      { status: 400 }
    );
  }

  const rows = await query<{ id: string }>(
    `INSERT INTO clo_panels (profile_id, status)
     VALUES ($1, 'queued')
     ON CONFLICT (profile_id) DO UPDATE SET status = 'queued', error_message = NULL, raw_files = '{}', members = '[]', updated_at = now()
     RETURNING id`,
    [profiles[0].id]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
