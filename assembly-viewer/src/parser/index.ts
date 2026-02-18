import fs from "node:fs";
import path from "node:path";
import type {
  FileManifest,
  Topic,
  Deliverable,
  VerificationReport,
  ResearchFile,
  FollowUp,
  FollowUpResponse,
} from "../types.js";
import { parseCharacterFiles } from "./characters.js";
import { parseSynthesisFile, parseSynthesis } from "./synthesis.js";
import { parseTranscript } from "./transcript.js";
import { parseReferenceLibrary } from "./reference-library.js";

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
  const parsedReferenceLibrary = referenceLibrary ? parseReferenceLibrary(referenceLibrary) : null;

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

  // Parse follow-ups
  const fuFiles = manifest.followUpFiles.get(slug) ?? [];
  const followUps: FollowUp[] = fuFiles.map((fp) => parseFollowUpFile(fp));
  followUps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

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
    parsedReferenceLibrary,
    researchFiles,
    followUps,
  };
}

const FOLLOWUP_SPEAKER = /^\*\*([^*]+?)(?:\s*:)?\*\*\s*(.*)/;

function parseFollowUpFile(filePath: string): FollowUp {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  let timestamp = "";
  let question = "";
  let context = "";
  let mode = "";
  const responses: FollowUpResponse[] = [];
  let currentSpeaker = "";
  let currentContent: string[] = [];
  let pastHeader = false;

  for (const line of lines) {
    // Parse header metadata
    const tsMatch = line.match(/^#\s+Follow-up\s*—\s*(.+)/i);
    if (tsMatch) {
      timestamp = tsMatch[1].trim();
      continue;
    }
    const ctxMatch = line.match(/^\*\*Context:\*\*\s*(.+)/);
    if (ctxMatch) {
      context = ctxMatch[1].trim();
      continue;
    }
    const modeMatch = line.match(/^\*\*Mode:\*\*\s*(.+)/);
    if (modeMatch) {
      mode = modeMatch[1].trim();
      continue;
    }
    const qMatch = line.match(/^\*\*Question:\*\*\s*(.+)/);
    if (qMatch) {
      question = qMatch[1].trim();
      continue;
    }

    if (line.trim() === "---") {
      pastHeader = true;
      continue;
    }

    if (!pastHeader) continue;

    // Parse speaker-attributed responses (same pattern as transcript)
    const speakerMatch = line.match(FOLLOWUP_SPEAKER);
    if (speakerMatch) {
      if (currentSpeaker) {
        responses.push({ speaker: currentSpeaker, content: currentContent.join("\n").trim() });
      }
      currentSpeaker = speakerMatch[1].trim();
      currentContent = speakerMatch[2] ? [speakerMatch[2]] : [];
    } else if (currentSpeaker && line.trim()) {
      currentContent.push(line);
    }
  }

  if (currentSpeaker) {
    responses.push({ speaker: currentSpeaker, content: currentContent.join("\n").trim() });
  }

  // Fallback: if no speaker-attributed responses were found, capture all
  // content after the --- separator as a single unspeakered response.
  // This handles explore-explain, explore-connect, explore-deep-dive modes
  // which produce guide-style responses without character names.
  if (responses.length === 0 && pastHeader) {
    const separatorIdx = raw.indexOf("\n---\n");
    if (separatorIdx !== -1) {
      const body = raw.slice(separatorIdx + 5).trim();
      if (body) {
        responses.push({ speaker: "", content: body });
      }
    }
  }

  // Fallback timestamp from filename if not found in content
  if (!timestamp) {
    const nameMatch = path.basename(filePath, ".md").match(/follow-up-(.+)/);
    if (nameMatch) timestamp = nameMatch[1];
  }

  return { timestamp, question, context, mode, responses, raw };
}

export { parseSynthesis, parseSynthesisFile } from "./synthesis.js";
export { parseCharacterFiles } from "./characters.js";
export { parseTranscript } from "./transcript.js";
export { parseReferenceLibrary } from "./reference-library.js";
