import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { Workspace } from "../types.js";

export function generateExportHtml(
  workspace: Workspace,
  topicSlug?: string
): string {
  const cssSource = new URL("../renderer/css/styles.css", import.meta.url);
  const css = fs.readFileSync(cssSource, "utf-8");

  const topics = topicSlug
    ? workspace.topics.filter((t) => t.slug === topicSlug)
    : workspace.topics;

  const pages: Array<{ id: string; label: string; html: string }> = [];

  if (!topicSlug) {
    pages.push({
      id: "home",
      label: "Home",
      html: renderExportSection(workspace),
    });
  }

  for (const topic of topics) {
    pages.push({
      id: topic.slug,
      label: topic.title,
      html: renderTopicExportSection(workspace, topic),
    });
  }

  const toc = pages
    .map((p) => `<li><a href="#${p.id}">${escapeHtml(p.label)}</a></li>`)
    .join("\n");

  const sections = pages
    .map(
      (p) => `<section id="${p.id}" class="export-section">${p.html}</section>`
    )
    .join("\n<hr>\n");

  const title = topicSlug && topics.length === 1
    ? escapeHtml(topics[0].title)
    : "Assembly Workspace Export";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
${css}
/* Export-specific overrides */
body { display: block; }
nav { display: none; }
main { margin-left: 0; max-width: 900px; margin: 0 auto; padding: 2rem; }
.export-toc { margin: 1.5rem 0; }
.export-toc ul { list-style: none; padding: 0; }
.export-toc li { margin: 0.35rem 0; }
.export-section { margin-bottom: 3rem; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="subtitle">Generated ${new Date().toISOString().split("T")[0]}</p>
    ${!topicSlug ? `<nav class="export-toc" style="display: block;">
      <h2>Contents</h2>
      <ul>${toc}</ul>
    </nav>
    <hr>` : ""}
    ${sections}
  </main>
</body>
</html>`;
}

export function exportToSingleFile(
  workspace: Workspace,
  outputPath: string
) {
  const html = generateExportHtml(workspace);
  fs.writeFileSync(outputPath, html, "utf-8");

  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Exported to ${outputPath} (${sizeKB} KB)`);
  if (sizeKB > 1024) {
    console.warn(`Warning: export file is ${sizeKB} KB (over 1 MB)`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderExportSection(workspace: Workspace): string {
  return `<h2>Assembly Workspace — ${workspace.topics.length} Topics</h2>
  <ul>
    ${workspace.topics.map((t) => `<li><a href="#${t.slug}">${escapeHtml(t.title)}</a> — ${t.characters.length} characters, ${t.iterations.length} iterations</li>`).join("\n")}
  </ul>`;
}

function renderTopicExportSection(
  workspace: Workspace,
  topic: typeof workspace.topics[number]
): string {
  const renderMd = (md: string) => marked.parse(md, { async: false }) as string;

  let html = `<h2>${escapeHtml(topic.title)}</h2>`;

  // Synthesis
  if (topic.synthesis) {
    html += `<div class="markdown-content">${renderMd(topic.synthesis.raw)}</div><hr>`;
  }

  // Characters
  if (topic.characters.length > 0) {
    html += `<h3>Characters</h3>`;
    for (const char of topic.characters) {
      html += `<details>
        <summary>${escapeHtml(char.name)}${char.tag ? ` <span class="badge badge-tag">${escapeHtml(char.tag)}</span>` : ""}</summary>
        <div class="details-content markdown-content">${renderMd(char.fullProfile)}</div>
      </details>`;
    }
    html += `<hr>`;
  }

  // Iterations
  for (const iter of topic.iterations) {
    if (iter.synthesis) {
      html += `<details>
        <summary>Iteration ${iter.number}: ${escapeHtml(iter.structure)}</summary>
        <div class="details-content markdown-content">${renderMd(iter.synthesis.raw)}</div>
      </details>`;
    }
  }

  // Deliverables
  for (const del of topic.deliverables) {
    html += `<details>
      <summary>Deliverable: ${escapeHtml(del.title)}</summary>
      <div class="details-content markdown-content">${renderMd(del.content)}</div>
    </details>`;
  }

  // Verification
  for (const ver of topic.verification) {
    html += `<details>
      <summary>Verification: ${escapeHtml(ver.title)}</summary>
      <div class="details-content markdown-content">${renderMd(ver.content)}</div>
    </details>`;
  }

  // Reference Library
  if (topic.referenceLibrary) {
    html += `<details>
      <summary>Reference Library</summary>
      <div class="details-content markdown-content">${renderMd(topic.referenceLibrary)}</div>
    </details>`;
  }

  // Follow-ups
  if (topic.followUps.length > 0) {
    html += `<details>
      <summary>Follow-ups (${topic.followUps.length})</summary>
      <div class="details-content">`;

    for (const fu of topic.followUps) {
      html += `<div style="margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #ddd;">`;
      html += `<div style="font-size:0.78rem;color:#888;margin-bottom:0.3rem;">`;
      if (fu.timestamp) html += `${escapeHtml(fu.timestamp)} `;
      if (fu.mode) html += `[${escapeHtml(fu.mode)}]`;
      html += `</div>`;
      html += `<p><strong>Q:</strong> ${escapeHtml(fu.question)}</p>`;

      for (const r of fu.responses) {
        html += `<div style="margin:0.5rem 0 0.5rem 0.5rem;">
          <strong>${escapeHtml(r.speaker)}:</strong>
          <div class="markdown-content">${renderMd(r.content)}</div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `</div></details>`;
  }

  return html;
}
