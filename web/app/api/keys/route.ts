import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { encryptApiKey, getKeyPrefix } from "@/lib/crypto";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apiKey } = await request.json();
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  const { encrypted, iv } = encryptApiKey(apiKey);
  const prefix = getKeyPrefix(apiKey);

  await query(
    `UPDATE users
     SET encrypted_api_key = $1, api_key_iv = $2, api_key_prefix = $3, api_key_valid = true
     WHERE id = $4`,
    [encrypted, iv, prefix, user.id]
  );

  return NextResponse.json({ prefix, valid: true });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    api_key_prefix: string | null;
    api_key_valid: boolean | null;
    free_trial_used: boolean;
  }>(
    "SELECT api_key_prefix, api_key_valid, free_trial_used FROM users WHERE id = $1",
    [user.id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const row = rows[0];
  const hasApiKey = !!row.api_key_prefix;

  return NextResponse.json({
    prefix: row.api_key_prefix,
    valid: row.api_key_valid,
    hasApiKey,
    freeTrialAvailable: !hasApiKey && !row.free_trial_used,
    freeTrialUsed: row.free_trial_used,
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await query(
    `UPDATE users
     SET encrypted_api_key = NULL, api_key_iv = NULL, api_key_prefix = NULL, api_key_valid = NULL
     WHERE id = $1`,
    [user.id]
  );

  return NextResponse.json({ success: true });
}
