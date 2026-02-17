import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function startServer(
  buildDir: string,
  port: number
): http.Server {
  const server = http.createServer((req, res) => {
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
  });

  return server;
}
