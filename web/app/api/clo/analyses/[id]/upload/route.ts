import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp",
]);

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

async function verifyOwnership(analysisId: string, userId: string) {
  const rows = await query(
    `SELECT a.id FROM clo_analyses a
     JOIN clo_panels p ON a.panel_id = p.id
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE a.id = $1 AND pr.user_id = $2`,
    [analysisId, userId]
  );
  return rows.length > 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: analysisId } = await params;

  if (!(await verifyOwnership(analysisId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 20MB limit" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "Unsupported file type. Upload PDFs or images." }, { status: 400 });
  }

  const resolvedType = MIME_BY_EXT[ext] ?? file.type;

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const document = {
    name: file.name,
    type: resolvedType,
    size: file.size,
    base64,
  };

  await query(
    `UPDATE clo_analyses
     SET documents = COALESCE(documents, '[]'::jsonb) || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(document), analysisId]
  );

  return NextResponse.json({
    name: file.name,
    type: resolvedType,
    size: file.size,
  });
}

// Flip status from 'uploading' to 'queued' after all uploads succeed
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: analysisId } = await params;

  if (!(await verifyOwnership(analysisId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    `UPDATE clo_analyses SET status = 'queued' WHERE id = $1 AND status = 'uploading'`,
    [analysisId]
  );

  return NextResponse.json({ ok: true });
}

// Abort: mark as error so worker won't pick it up with partial documents
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: analysisId } = await params;

  if (!(await verifyOwnership(analysisId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    `UPDATE clo_analyses SET status = 'error', error_message = 'File upload failed'
     WHERE id = $1 AND status = 'uploading'`,
    [analysisId]
  );

  return NextResponse.json({ ok: true });
}
