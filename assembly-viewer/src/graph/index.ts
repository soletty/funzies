import type { Workspace, Topic } from "../types.js";
import { scanWorkspace } from "../scanner/index.js";
import { parseWorkspace } from "../parser/index.js";

export function buildContentGraph(workspacePath: string): Workspace {
  const manifest = scanWorkspace(workspacePath);
  const topics = parseWorkspace(manifest, workspacePath);

  return {
    path: workspacePath,
    topics,
  };
}
