import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (files.length > 5) {
    return NextResponse.json({ error: "Maximum 5 files allowed" }, { status: 400 });
  }

  const invalidFile = files.find((f) => f.type !== "application/pdf");
  if (invalidFile) {
    return NextResponse.json(
      { error: `Only PDF files are accepted. "${invalidFile.name}" is ${invalidFile.type || "unknown type"}.` },
      { status: 400 }
    );
  }

  const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Total file size must be under 20MB" },
      { status: 413 }
    );
  }

  const documents = await Promise.all(
    files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
      };
    })
  );

  const rows = await query<{ id: string }>(
    `INSERT INTO clo_profiles (user_id, documents)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       documents = EXCLUDED.documents,
       updated_at = now()
     RETURNING id`,
    [user.id, JSON.stringify(documents)]
  );

  return NextResponse.json({
    profileId: rows[0].id,
    documents: documents.map((d) => ({ name: d.name, type: d.type, size: d.size })),
  });
}
