import fs from "node:fs";
import path from "node:path";
import type { Workspace } from "../types.js";
import {
  renderWorkspaceIndex,
  renderTopicLanding,
  renderSynthesis,
  renderCharacterGrid,
  renderCharacterProfile,
  renderIteration,
  renderDeliverables,
  renderVerification,
} from "./html.js";

export function renderWorkspace(workspace: Workspace, outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy CSS
  const cssSource = new URL("css/styles.css", import.meta.url);
  fs.copyFileSync(cssSource, path.join(outputDir, "styles.css"));

  // Workspace index
  writeFile(path.join(outputDir, "index.html"), renderWorkspaceIndex(workspace));

  // Per-topic pages
  for (const topic of workspace.topics) {
    const topicDir = path.join(outputDir, topic.slug);
    fs.mkdirSync(topicDir, { recursive: true });

    // Topic landing
    writeFile(
      path.join(topicDir, "index.html"),
      renderTopicLanding(workspace, topic)
    );

    // Synthesis
    const synthHtml = renderSynthesis(workspace, topic);
    if (synthHtml) {
      writeFile(path.join(topicDir, "synthesis.html"), synthHtml);
    }

    // Characters
    const charGridHtml = renderCharacterGrid(workspace, topic);
    if (charGridHtml) {
      writeFile(path.join(topicDir, "characters.html"), charGridHtml);
    }

    for (const character of topic.characters) {
      writeFile(
        path.join(topicDir, `character-${character.number}.html`),
        renderCharacterProfile(workspace, topic, character)
      );
    }

    // Iterations
    for (const iteration of topic.iterations) {
      writeFile(
        path.join(topicDir, `iteration-${iteration.number}.html`),
        renderIteration(workspace, topic, iteration)
      );
    }

    // Deliverables
    const delHtml = renderDeliverables(workspace, topic);
    if (delHtml) {
      writeFile(path.join(topicDir, "deliverables.html"), delHtml);
    }

    // Verification
    const verHtml = renderVerification(workspace, topic);
    if (verHtml) {
      writeFile(path.join(topicDir, "verification.html"), verHtml);
    }
  }
}

function writeFile(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, "utf-8");
}
