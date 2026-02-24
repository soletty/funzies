import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getCommitteeForUser } from "@/lib/ic/access";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const committee = await getCommitteeForUser(user.id);
  if (!committee) {
    return NextResponse.json({ error: "No committee found" }, { status: 404 });
  }

  const ideas = await query(
    `SELECT id, focus_area, status, current_phase, created_at, completed_at
     FROM ic_ideas
     WHERE committee_id = $1
     ORDER BY created_at DESC`,
    [committee.id]
  );

  return NextResponse.json(ideas);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const committee = await getCommitteeForUser(user.id);
  if (!committee) {
    return NextResponse.json({ error: "No committee found" }, { status: 404 });
  }

  if (committee.status !== "active") {
    return NextResponse.json(
      { error: "Committee must be active to generate ideas" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const focusArea = body.focusArea?.trim() || "";

  const rows = await query<{ id: string }>(
    `INSERT INTO ic_ideas (committee_id, focus_area, status)
     VALUES ($1, $2, 'queued')
     RETURNING id`,
    [committee.id, focusArea]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
