import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { randomBytes, createHash } from "crypto";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Token name is required" }, { status: 400 });
  }

  const rawToken = "fz_" + randomBytes(20).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenPrefix = rawToken.slice(0, 11);

  const rows = await query<{ id: string; created_at: string }>(
    `INSERT INTO user_api_tokens (user_id, name, token_hash, token_prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [session.user.id, name, tokenHash, tokenPrefix]
  );

  return NextResponse.json({
    id: rows[0].id,
    name,
    token: rawToken,
    prefix: tokenPrefix,
    created_at: rows[0].created_at,
  }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await query(
    `SELECT id, name, token_prefix, last_used_at, created_at
     FROM user_api_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [session.user.id]
  );

  return NextResponse.json(tokens);
}
