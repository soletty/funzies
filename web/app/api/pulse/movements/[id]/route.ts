import { NextRequest, NextResponse } from "next/server";
import { getMovementById, getSignalsForMovement } from "@/lib/pulse/access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const movement = await getMovementById(id);
  if (!movement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signals = await getSignalsForMovement(id);

  return NextResponse.json({ movement, signals });
}
