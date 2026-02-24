import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getPanelForUser } from "@/lib/clo/access";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const panel = await getPanelForUser(user.id);
  if (!panel) {
    return NextResponse.json({ error: "No panel found" }, { status: 404 });
  }

  const screenings = await query(
    `SELECT id, focus_area, status, current_phase, created_at, completed_at
     FROM clo_screenings
     WHERE panel_id = $1
     ORDER BY created_at DESC`,
    [panel.id]
  );

  return NextResponse.json(screenings);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const panel = await getPanelForUser(user.id);
  if (!panel) {
    return NextResponse.json({ error: "No panel found" }, { status: 404 });
  }

  if (panel.status !== "active") {
    return NextResponse.json(
      { error: "Panel must be active to generate screenings" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const focusArea = body.focusArea?.trim() || "";

  const rows = await query<{ id: string }>(
    `INSERT INTO clo_screenings (panel_id, focus_area, status)
     VALUES ($1, $2, 'queued')
     RETURNING id`,
    [panel.id, focusArea]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
