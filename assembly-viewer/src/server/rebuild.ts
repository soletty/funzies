import fs from "node:fs";
import path from "node:path";
import { buildContentGraph } from "../graph/index.js";
import {
  renderWorkspaceIndex,
  renderTopicLanding,
  renderSynthesis,
  renderCharacterGrid,
  renderCharacterProfile,
  renderIteration,
  renderDeliverables,
  renderStructuredReferenceLibrary,
  renderTrajectory,
} from "../renderer/html.js";

export function rebuildTopicPages(workspacePath: string, buildDir: string, topicSlug: string): void {
  const workspace = buildContentGraph(workspacePath);
  const topic = workspace.topics.find((t) => t.slug === topicSlug);
  if (!topic) return;

  const topicDir = path.join(buildDir, topic.slug);
  fs.mkdirSync(topicDir, { recursive: true });

  // Workspace index (recent activity section)
  fs.writeFileSync(path.join(buildDir, "index.html"), renderWorkspaceIndex(workspace), "utf-8");

  // Topic landing
  fs.writeFileSync(path.join(topicDir, "index.html"), renderTopicLanding(workspace, topic), "utf-8");

  // Synthesis
  const synthHtml = renderSynthesis(workspace, topic);
  if (synthHtml) {
    fs.writeFileSync(path.join(topicDir, "synthesis.html"), synthHtml, "utf-8");
  }

  // Character grid
  const charGridHtml = renderCharacterGrid(workspace, topic);
  if (charGridHtml) {
    fs.writeFileSync(path.join(topicDir, "characters.html"), charGridHtml, "utf-8");
  }

  // Character profiles
  for (const character of topic.characters) {
    fs.writeFileSync(
      path.join(topicDir, `character-${character.number}.html`),
      renderCharacterProfile(workspace, topic, character),
      "utf-8"
    );
  }

  // Iterations
  for (const iteration of topic.iterations) {
    fs.writeFileSync(
      path.join(topicDir, `iteration-${iteration.number}.html`),
      renderIteration(workspace, topic, iteration),
      "utf-8"
    );
  }

  // Reference library
  const refHtml = renderStructuredReferenceLibrary(workspace, topic);
  if (refHtml) {
    fs.writeFileSync(path.join(topicDir, "reference-library.html"), refHtml, "utf-8");
  }

  // Deliverables
  const delHtml = renderDeliverables(workspace, topic);
  if (delHtml) {
    fs.writeFileSync(path.join(topicDir, "deliverables.html"), delHtml, "utf-8");
  }

  // Trajectory
  if (topic.followUps.length > 0) {
    fs.writeFileSync(path.join(topicDir, "trajectory.html"), renderTrajectory(workspace, topic), "utf-8");
  }
}
