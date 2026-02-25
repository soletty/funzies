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

async function verifyOwnership(evaluationId: string, userId: string) {
  const rows = await query(
    `SELECT e.id FROM ic_evaluations e
     JOIN ic_committees c ON e.committee_id = c.id
     JOIN investor_profiles p ON c.profile_id = p.id
     WHERE e.id = $1 AND p.user_id = $2`,
    [evaluationId, userId]
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

  const { id: evaluationId } = await params;

  if (!(await verifyOwnership(evaluationId, user.id))) {
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

  // Append to the documents array in details JSONB
  await query(
    `UPDATE ic_evaluations
     SET details = jsonb_set(
       COALESCE(details, '{}'::jsonb),
       '{documents}',
       COALESCE(details->'documents', '[]'::jsonb) || $1::jsonb
     )
     WHERE id = $2`,
    [JSON.stringify(document), evaluationId]
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

  const { id: evaluationId } = await params;

  if (!(await verifyOwnership(evaluationId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    `UPDATE ic_evaluations SET status = 'queued' WHERE id = $1 AND status = 'uploading'`,
    [evaluationId]
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

  const { id: evaluationId } = await params;

  if (!(await verifyOwnership(evaluationId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    `UPDATE ic_evaluations SET status = 'error', error_message = 'File upload failed'
     WHERE id = $1 AND status = 'uploading'`,
    [evaluationId]
  );

  return NextResponse.json({ ok: true });
}
