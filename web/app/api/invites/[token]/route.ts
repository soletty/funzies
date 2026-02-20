import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  const shares = await query<{
    id: string;
    assembly_id: string;
    shared_with_email: string;
  }>(
    "SELECT id, assembly_id, shared_with_email FROM assembly_shares WHERE invite_token = $1",
    [token]
  );

  if (!shares.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const share = shares[0];

  if (share.shared_with_email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invite was sent to a different email address" },
      { status: 403 }
    );
  }

  await query(
    "UPDATE assembly_shares SET shared_with_user_id = $1, accepted_at = now(), invite_token = NULL WHERE id = $2",
    [user.id, share.id]
  );

  const assemblies = await query<{ slug: string }>(
    "SELECT slug FROM assemblies WHERE id = $1",
    [share.assembly_id]
  );

  const slug = assemblies.length > 0 ? assemblies[0].slug : null;

  return NextResponse.json({ slug });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const shares = await query<{
    id: string;
    shared_with_email: string;
    role: string;
    assembly_id: string;
  }>(
    "SELECT s.id, s.shared_with_email, s.role, s.assembly_id FROM assembly_shares s WHERE s.invite_token = $1",
    [token]
  );

  if (!shares.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const share = shares[0];

  const assemblies = await query<{ topic_input: string; user_id: string }>(
    "SELECT topic_input, user_id FROM assemblies WHERE id = $1",
    [share.assembly_id]
  );

  let inviterName: string | null = null;
  if (assemblies.length > 0) {
    const users = await query<{ name: string | null; email: string }>(
      "SELECT name, email FROM users WHERE id = $1",
      [assemblies[0].user_id]
    );
    inviterName = users[0]?.name || users[0]?.email || null;
  }

  return NextResponse.json({
    email: share.shared_with_email,
    role: share.role,
    topic: assemblies[0]?.topic_input || "Unknown",
    inviterName,
  });
}
