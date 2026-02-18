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

  const rows = await query<{ api_key_prefix: string; api_key_valid: boolean }>(
    `SELECT api_key_prefix, api_key_valid FROM users WHERE id = $1`,
    [user.id]
  );

  if (!rows.length || !rows[0].api_key_prefix) {
    return NextResponse.json({ error: "No API key stored" }, { status: 404 });
  }

  return NextResponse.json({
    prefix: rows[0].api_key_prefix,
    valid: rows[0].api_key_valid,
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
