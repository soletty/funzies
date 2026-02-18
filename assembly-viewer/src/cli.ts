#!/usr/bin/env node

import { Command } from "commander";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentGraph } from "./graph/index.js";
import { renderWorkspace } from "./renderer/index.js";
import { startServer } from "./server/index.js";
import { exportToSingleFile } from "./export/index.js";

const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);

const program = new Command();

program
  .name("assembly-viewer")
  .description("View multi-agent research and debate assembly workspaces")
  .version(pkg.version)
  .option("--dir <path>", "Path to assembly workspace directory")
  .option("--port <number>", "Server port", "3456")
  .option("--export", "Export to a single self-contained HTML file")
  .option("--out <path>", "Export output path", "assembly-viewer-export.html")
  .option("--demo", "Load the bundled demo assembly")
  .action((opts) => {
    let isDemo = false;
    let workspacePath = opts.demo ? getDemoPath() : resolveWorkspace(opts.dir);

    if (!workspacePath) {
      const demoPath = getDemoPath();
      if (demoPath) {
        console.log("No workspace found. Loading demo assembly...");
        workspacePath = demoPath;
        isDemo = true;
      } else {
        console.error(
          "No assembly workspace found.\n" +
            "Expected an `assembly-workspace/` directory in the current folder.\n" +
            "Use --dir to specify a custom path."
        );
        process.exit(1);
      }
    } else if (opts.demo) {
      isDemo = true;
    }

    console.log(`Scanning workspace: ${workspacePath}`);
    const workspace = buildContentGraph(workspacePath);
    workspace.isDemo = isDemo;
    console.log(
      `Found ${workspace.topics.length} topic(s): ${workspace.topics.map((t) => t.slug).join(", ")}`
    );

    if (opts.export) {
      const outPath = path.resolve(opts.out);
      exportToSingleFile(workspace, outPath);
    } else {
      const buildDir = path.join(process.cwd(), "_assembly-build");
      console.log(`Building to ${buildDir}`);
      renderWorkspace(workspace, buildDir);

      const port = parseInt(opts.port, 10);
      startServer(buildDir, port, isDemo ? undefined : workspacePath);

      openBrowser(`http://localhost:${port}`);
    }
  });

program.parse();

function resolveWorkspace(dirOpt?: string): string | null {
  if (dirOpt) {
    const resolved = path.resolve(dirOpt);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
    return null;
  }

  const candidates = ["assembly-workspace", "workspace"];
  for (const candidate of candidates) {
    const p = path.resolve(candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }

  return null;
}

function getDemoPath(): string | null {
  const demoDir = fileURLToPath(new URL("../demo-data", import.meta.url));
  if (fs.existsSync(demoDir) && fs.statSync(demoDir).isDirectory()) {
    return demoDir;
  }
  return null;
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${cmd} ${url}`, (err) => {
    if (err) {
      console.log(`Open ${url} in your browser.`);
    }
  });
}
