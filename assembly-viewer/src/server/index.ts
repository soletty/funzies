import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleFollowUp, handleDeleteFollowUp, handleDeleteWorkspace } from "./follow-up.js";
import { startSession, sendInput, addSSEClient, getSessionStatus } from "./assembly-session.js";
import { handleUpload } from "./upload.js";
import { buildContentGraph } from "../graph/index.js";
import { generateExportHtml } from "../export/index.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
  });
}

export function startServer(
  buildDir: string,
  port: number,
  workspacePath?: string
): http.Server {
  const server = http.createServer(async (req, res) => {
    // API routes
    if (req.url === "/api/follow-up" && req.method === "POST") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      handleFollowUp(req, res, workspacePath, buildDir);
      return;
    }

    if (req.url === "/api/follow-up" && req.method === "DELETE") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      handleDeleteFollowUp(req, res, workspacePath);
      return;
    }

    if (req.url === "/api/workspace" && req.method === "DELETE") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      handleDeleteWorkspace(req, res, workspacePath);
      return;
    }

    // Upload API
    if (req.url === "/api/upload" && req.method === "POST") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      handleUpload(req, res, workspacePath);
      return;
    }

    // Assembly API routes
    if (req.url === "/api/assembly/start" && req.method === "POST") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      const body = await readBody(req);
      let parsed: { topic?: string; files?: string[] };
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      if (!parsed.topic) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing topic" }));
        return;
      }
      startSession(parsed.topic, workspacePath, buildDir, parsed.files);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === "/api/assembly/stream" && req.method === "GET") {
      const status = getSessionStatus();
      if (!status) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active session" }));
        return;
      }
      addSSEClient(res);
      return;
    }

    if (req.url === "/api/assembly/input" && req.method === "POST") {
      const body = await readBody(req);
      let parsed: { text?: string; files?: string[] };
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      if (!parsed.text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing text" }));
        return;
      }
      const sent = sendInput(parsed.text, parsed.files);
      res.writeHead(sent ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: sent }));
      return;
    }

    if (req.url === "/api/assembly/status" && req.method === "GET") {
      const status = getSessionStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status ?? { status: "idle" }));
      return;
    }

    // Export API
    const exportMatch = req.url?.match(/^\/api\/export\/([a-z0-9-]+)$/);
    if (exportMatch && req.method === "GET") {
      if (!workspacePath) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Workspace path not configured" }));
        return;
      }
      const topicSlug = exportMatch[1];
      const workspace = buildContentGraph(workspacePath);
      const topic = workspace.topics.find((t) => t.slug === topicSlug);
      if (!topic) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Topic not found" }));
        return;
      }
      const html = generateExportHtml(workspace, topicSlug);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="assembly-${topicSlug}.html"`,
      });
      res.end(html);
      return;
    }

    // Static file serving
    let urlPath = req.url ?? "/";

    // Remove query string
    urlPath = urlPath.split("?")[0];

    // Default to index.html
    if (urlPath.endsWith("/")) urlPath += "index.html";

    const filePath = path.join(buildDir, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(buildDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404 — Not Found</h1>");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });

  server.listen(port, () => {
    console.log(`Assembly Viewer running at http://localhost:${port}`);
    if (workspacePath) {
      console.log(`Follow-up API enabled (workspace: ${workspacePath})`);
    }
  });

  return server;
}
