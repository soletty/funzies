import fs from "node:fs";
import path from "node:path";
import type { FileManifest, IterationManifest } from "../types.js";

export function scanWorkspace(workspacePath: string): FileManifest {
  const manifest: FileManifest = {
    topicDirs: [],
    characterFiles: new Map(),
    synthesisFiles: new Map(),
    iterationDirs: new Map(),
    deliverableFiles: new Map(),
    verificationFiles: new Map(),
    referenceFiles: new Map(),
    researchFiles: new Map(),
    followUpFiles: new Map(),
  };

  const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const topicSlug = entry.name;
    const topicPath = path.join(workspacePath, topicSlug);
    manifest.topicDirs.push(topicSlug);
    scanTopic(topicPath, topicSlug, manifest);
  }

  return manifest;
}

function scanTopic(topicPath: string, slug: string, manifest: FileManifest) {
  const entries = fs.readdirSync(topicPath, { withFileTypes: true });

  const charFiles: string[] = [];
  const iterations: IterationManifest[] = [];
  const deliverables: string[] = [];
  const verifications: string[] = [];
  const research: string[] = [];
  const followUps: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(topicPath, entry.name);

    if (entry.isFile() && entry.name.endsWith(".md")) {
      if (entry.name.startsWith("characters")) {
        charFiles.push(fullPath);
      } else if (entry.name === "synthesis.md") {
        manifest.synthesisFiles.set(slug, fullPath);
      } else if (entry.name === "reference-library.md") {
        manifest.referenceFiles.set(slug, fullPath);
      } else if (entry.name.startsWith("research-")) {
        research.push(fullPath);
      }
    }

    if (entry.isDirectory()) {
      if (entry.name.startsWith("iteration-")) {
        const iterManifest = scanIteration(fullPath, entry.name);
        if (iterManifest) iterations.push(iterManifest);
      } else if (entry.name === "deliverable" || entry.name === "deliverables") {
        scanMarkdownDir(fullPath, deliverables);
      } else if (entry.name === "verification") {
        scanMarkdownDir(fullPath, verifications);
      } else if (entry.name === "follow-ups") {
        scanMarkdownDir(fullPath, followUps);
      }
    }
  }

  if (charFiles.length > 0) manifest.characterFiles.set(slug, charFiles);
  if (iterations.length > 0) {
    iterations.sort((a, b) => a.number - b.number);
    manifest.iterationDirs.set(slug, iterations);
  }
  if (deliverables.length > 0) manifest.deliverableFiles.set(slug, deliverables);
  if (verifications.length > 0) manifest.verificationFiles.set(slug, verifications);
  if (research.length > 0) manifest.researchFiles.set(slug, research);
  if (followUps.length > 0) manifest.followUpFiles.set(slug, followUps);
}

function scanIteration(
  dirPath: string,
  dirName: string
): IterationManifest | null {
  const match = dirName.match(/^iteration-(\d+)-(.+)$/);
  if (!match) return null;

  const entries = fs.readdirSync(dirPath);
  const synthesisFile = entries.includes("synthesis.md")
    ? path.join(dirPath, "synthesis.md")
    : null;
  const transcriptFile = entries.includes("transcript.md")
    ? path.join(dirPath, "transcript.md")
    : null;

  return {
    path: dirPath,
    number: parseInt(match[1], 10),
    structure: match[2],
    synthesisFile,
    transcriptFile,
  };
}

function scanMarkdownDir(dirPath: string, output: string[]) {
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry.endsWith(".md")) {
      output.push(path.join(dirPath, entry));
    }
  }
}
