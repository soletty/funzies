import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<{
    id: string;
    documents: Array<{ name: string; type: string; size: number; base64: string }>;
  }>(
    "SELECT id, documents FROM clo_profiles WHERE user_id = $1",
    [user.id]
  );

  if (profiles.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = profiles[0];
  const documents = profile.documents || [];

  if (documents.length === 0) {
    return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
  }

  const userRows = await query<{ encrypted_api_key: Buffer }>(
    "SELECT encrypted_api_key FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  await query(
    `UPDATE clo_profiles
     SET portfolio_extraction_status = 'queued',
         portfolio_extraction_error = NULL,
         updated_at = now()
     WHERE id = $1`,
    [profile.id]
  );

  return NextResponse.json({ status: "queued", profileId: profile.id });
}
