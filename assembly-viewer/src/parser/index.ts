import fs from "node:fs";
import path from "node:path";
import type {
  FileManifest,
  Topic,
  Deliverable,
  VerificationReport,
  ResearchFile,
} from "../types.js";
import { parseCharacterFiles } from "./characters.js";
import { parseSynthesisFile, parseSynthesis } from "./synthesis.js";
import { parseTranscript } from "./transcript.js";

export function parseWorkspace(manifest: FileManifest, workspacePath: string): Topic[] {
  return manifest.topicDirs.map((slug) => parseTopic(slug, manifest, workspacePath));
}

function parseTopic(slug: string, manifest: FileManifest, workspacePath: string): Topic {
  // Parse characters
  const charFiles = manifest.characterFiles.get(slug) ?? [];
  const characters = charFiles.length > 0 ? parseCharacterFiles(charFiles) : [];

  // Parse main synthesis
  const synthPath = manifest.synthesisFiles.get(slug);
  const synthesis = synthPath ? parseSynthesisFile(synthPath) : null;

  // Parse iterations
  const iterManifests = manifest.iterationDirs.get(slug) ?? [];
  const iterations = iterManifests.map((im) => {
    const iterSynthesis = im.synthesisFile
      ? parseSynthesisFile(im.synthesisFile)
      : null;

    let transcriptRaw: string | null = null;
    let rounds: import("../types.js").DebateRound[] = [];

    if (im.transcriptFile) {
      transcriptRaw = fs.readFileSync(im.transcriptFile, "utf-8");
      rounds = parseTranscript(transcriptRaw);
    }

    // If iteration synthesis contains debate content (speakers in bold),
    // also parse it as a transcript
    if (iterSynthesis && rounds.length === 0) {
      const synthContent = iterSynthesis.raw;
      if (/\*\*[A-Z][a-z]+ [A-Z]/.test(synthContent) && /\*\*:\s/.test(synthContent)) {
        rounds = parseTranscript(synthContent);
        if (!transcriptRaw) transcriptRaw = synthContent;
      }
    }

    return {
      number: im.number,
      structure: im.structure,
      synthesis: iterSynthesis,
      transcriptRaw,
      rounds,
    };
  });

  // Parse deliverables
  const delFiles = manifest.deliverableFiles.get(slug) ?? [];
  const deliverables: Deliverable[] = delFiles.map((fp) => {
    const content = fs.readFileSync(fp, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return {
      slug: path.basename(fp, ".md"),
      title: titleMatch ? titleMatch[1].trim() : path.basename(fp, ".md"),
      content,
    };
  });

  // Parse verification reports
  const verFiles = manifest.verificationFiles.get(slug) ?? [];
  const verification: VerificationReport[] = verFiles.map((fp) => {
    const content = fs.readFileSync(fp, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const baseName = path.basename(fp, ".md");
    return {
      type: baseName.replace(/-report$/, ""),
      title: titleMatch ? titleMatch[1].trim() : baseName,
      content,
    };
  });

  // Reference library
  const refPath = manifest.referenceFiles.get(slug);
  const referenceLibrary = refPath ? fs.readFileSync(refPath, "utf-8") : null;

  // Research files
  const resFiles = manifest.researchFiles.get(slug) ?? [];
  const researchFiles: ResearchFile[] = resFiles.map((fp) => {
    const content = fs.readFileSync(fp, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return {
      slug: path.basename(fp, ".md"),
      title: titleMatch ? titleMatch[1].trim() : path.basename(fp, ".md"),
      content,
    };
  });

  // Derive title
  const title =
    synthesis?.title ??
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return {
    slug,
    title,
    characters,
    iterations,
    synthesis,
    deliverables,
    verification,
    referenceLibrary,
    researchFiles,
  };
}

export { parseSynthesis, parseSynthesisFile } from "./synthesis.js";
export { parseCharacterFiles } from "./characters.js";
export { parseTranscript } from "./transcript.js";
