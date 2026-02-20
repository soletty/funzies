import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getAssemblyAccessBySlug } from "@/lib/assembly-access";
import { query } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const { access, assemblyId } = await getAssemblyAccessBySlug(slug, user.id);
  if (!access || !assemblyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await query(
    "SELECT id, status FROM assemblies WHERE id = $1 LIMIT 1",
    [assemblyId]
  );

  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
