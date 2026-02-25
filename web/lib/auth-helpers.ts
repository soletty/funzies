import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { query } from "@/lib/db";

export async function getCurrentUser() {
  const session = await auth();
  if (session?.user) return session.user;

  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader?.startsWith("Bearer fz_")) return null;

  const token = authHeader.slice(7);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const rows = await query<{ id: string; email: string; name: string; token_id: string }>(
    `SELECT u.id, u.email, u.name, t.id as token_id
     FROM user_api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1`,
    [tokenHash]
  );
  if (!rows.length) return null;

  query("UPDATE user_api_tokens SET last_used_at = now() WHERE id = $1", [rows[0].token_id]).catch(() => {});

  return { id: rows[0].id, email: rows[0].email, name: rows[0].name };
}
