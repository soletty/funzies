import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { ingestIntexPastCashflows } from "@/lib/clo/intex/ingest";
import { IntexSchemaMismatchError } from "@/lib/clo/intex/parse-past-cashflows";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const dealId = formData.get("dealId") as string;
  if (!dealId) {
    return NextResponse.json({ error: "dealId is required" }, { status: 400 });
  }

  const dealCheck = await query(
    `SELECT d.id FROM clo_deals d
     JOIN clo_profiles p ON p.id = d.profile_id
     WHERE d.id = $1 AND p.user_id = $2`,
    [dealId, user.id]
  );
  if (dealCheck.length === 0) {
    return NextResponse.json({ error: "Deal not found or access denied" }, { status: 403 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 10MB" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Expected a .csv export of the Intex past-cashflows sheet" }, { status: 400 });
  }

  const csvText = await file.text();

  try {
    const result = await ingestIntexPastCashflows(dealId, csvText);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IntexSchemaMismatchError) {
      // Schema mismatch is a client-correctable condition (wrong CSV for
      // this deal, or deal tranches not yet ingested). Surface the
      // structured diff so the partner sees exactly what's wrong.
      return NextResponse.json(
        {
          error: "Intex CSV tranche structure does not match this deal",
          detail: err.message,
          diff: err.diff,
        },
        { status: 422 }
      );
    }
    console.error("Intex ingest failed:", err);
    return NextResponse.json(
      { error: "Ingestion failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
