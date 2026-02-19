import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const ALLOWED_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "html", "css", "js", "ts", "tsx", "jsx",
  "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "sh", "yaml", "yml",
  "toml", "sql", "pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg",
  "gif", "webp", "svg",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

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
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const uploadDir = join(tmpdir(), "assembly-uploads", assemblyId);
  await mkdir(uploadDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = join(uploadDir, `${Date.now()}-${safeName}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return NextResponse.json({
    name: file.name,
    path: filePath,
    type: file.type,
    size: file.size,
  });
}
