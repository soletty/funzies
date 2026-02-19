import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    github_username: string;
    github_avatar_url: string | null;
  }>(
    "SELECT github_username, github_avatar_url FROM github_connections WHERE user_id = $1",
    [user.id]
  );

  if (!rows[0]) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    username: rows[0].github_username,
    avatarUrl: rows[0].github_avatar_url,
  });
}
