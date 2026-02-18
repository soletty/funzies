import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".pdf", ".txt", ".csv", ".md", ".json",
  ".ts", ".js", ".py", ".html", ".css",
  ".xml", ".yaml", ".yml", ".toml",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const MAX_BODY_SIZE = 20 * 1024 * 1024; // 20MB

function sanitizeFilename(fileName: string): string | null {
  // Strip path components
  const base = path.basename(fileName);
  if (!base || base === "." || base === ".." || base.includes("..")) return null;
  // Only keep alphanumeric, dashes, underscores, dots
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!sanitized) return null;
  return sanitized;
}

export function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string
) {
  let body = "";
  let bodySize = 0;

  req.on("data", (chunk: Buffer) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_SIZE) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File too large (max 20MB)" }));
      req.destroy();
      return;
    }
    body += chunk.toString();
  });

  req.on("end", () => {
    let parsed: { fileName?: string; data?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!parsed.fileName || !parsed.data) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing fileName or data" }));
      return;
    }

    const sanitized = sanitizeFilename(parsed.fileName);
    if (!sanitized) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid filename" }));
      return;
    }

    const ext = path.extname(sanitized).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `File type ${ext} not allowed` }));
      return;
    }

    const uploadsDir = path.join(os.tmpdir(), "assembly-uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const destName = `${timestamp}-${sanitized}`;
    const destPath = path.join(uploadsDir, destName);

    const buffer = Buffer.from(parsed.data, "base64");
    fs.writeFileSync(destPath, buffer);

    console.log(`[upload] Saved ${destPath} (${buffer.length} bytes)`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path: destPath }));
  });
}

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function buildFileReferenceBlock(files: string[], _workspacePath: string): string {
  if (!files || files.length === 0) return "";

  const lines = files.map((file) => {
    // Paths are already absolute (from temp dir)
    if (isImageFile(file)) {
      return `[Attached image: ${file}]`;
    }
    return `[Attached file: ${file} — please read this file for context]`;
  });

  return "\n\n" + lines.join("\n");
}
