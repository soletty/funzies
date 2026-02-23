import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  const assemblies = await query<{
    id: string;
    slug: string;
    share_role: string;
    user_id: string;
  }>(
    "SELECT id, slug, share_role, user_id FROM assemblies WHERE share_code = $1",
    [token]
  );

  if (!assemblies.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const assembly = assemblies[0];

  if (assembly.user_id === user.id) {
    return NextResponse.json({ slug: assembly.slug });
  }

  await query(
    `INSERT INTO assembly_shares (assembly_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (assembly_id, user_id) DO UPDATE SET role = $3`,
    [assembly.id, user.id, assembly.share_role]
  );

  return NextResponse.json({ slug: assembly.slug });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const assemblies = await query<{
    topic_input: string;
    share_role: string;
    user_id: string;
  }>(
    "SELECT topic_input, share_role, user_id FROM assemblies WHERE share_code = $1",
    [token]
  );

  if (!assemblies.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const assembly = assemblies[0];

  const users = await query<{ name: string | null; email: string }>(
    "SELECT name, email FROM users WHERE id = $1",
    [assembly.user_id]
  );
  const ownerName = users[0]?.name || users[0]?.email || null;

  return NextResponse.json({
    role: assembly.share_role,
    topic: assembly.topic_input,
    ownerName,
  });
}
