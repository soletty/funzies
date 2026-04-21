import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { detectSdfFileType } from "@/lib/clo/sdf/detect";
import { ingestSdfFiles } from "@/lib/clo/sdf/ingest";
import type { SdfFileType } from "@/lib/clo/sdf/types";

const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50MB

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

  // Verify user has access to this deal
  const dealCheck = await query(
    `SELECT d.id FROM clo_deals d
     JOIN clo_profiles p ON p.id = d.profile_id
     WHERE d.id = $1 AND p.user_id = $2`,
    [dealId, user.id]
  );
  if (dealCheck.length === 0) {
    return NextResponse.json({ error: "Deal not found or access denied" }, { status: 403 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Size check
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "Total file size exceeds 50MB" }, { status: 400 });
  }

  // Read and detect each file (server-side re-detection — don't trust client labels)
  const detectedFiles: Array<{ fileType: SdfFileType; csvText: string; fileName: string }> = [];
  const skipped: Array<{ fileName: string; reason: string }> = [];

  for (const file of files) {
    if (!file.name.endsWith(".csv")) {
      skipped.push({ fileName: file.name, reason: "Not a CSV file" });
      continue;
    }

    const csvText = await file.text();
    const fileType = detectSdfFileType(csvText);

    if (!fileType) {
      skipped.push({ fileName: file.name, reason: "Unrecognized SDF format" });
      continue;
    }

    detectedFiles.push({ fileType, csvText, fileName: file.name });
  }

  if (detectedFiles.length === 0) {
    return NextResponse.json(
      { error: "No recognized SDF files found", skipped },
      { status: 400 }
    );
  }

  try {
    const result = await ingestSdfFiles(dealId, detectedFiles);
    result.skipped.push(...skipped);
    return NextResponse.json(result);
  } catch (err) {
    console.error("SDF ingestion failed:", err);
    return NextResponse.json(
      { error: "Ingestion failed", detail: err instanceof Error ? err.message : String(err), skipped },
      { status: 500 }
    );
  }
}
