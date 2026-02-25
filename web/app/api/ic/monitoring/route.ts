import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { Pool } from "pg";
import { getMonitoringStats } from "@/lib/ic/monitoring";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get("hours") || "24", 10);

  const stats = await getMonitoringStats(pool, Math.min(hours, 720));

  return NextResponse.json(stats);
}
