import fs from "node:fs";
import type {
  Synthesis,
  ConvergencePoint,
  DivergencePoint,
  SynthesisSection,
} from "../types.js";

const CONVERGENCE_KEYWORDS = ["convergence", "consensus", "agreement", "agreed"];
const DIVERGENCE_KEYWORDS = [
  "divergence",
  "disagreement",
  "split",
  "irreducible",
  "diverge",
];
const EMERGENT_KEYWORDS = ["emergent", "unexpected", "alliance", "surprise"];
const KNOWLEDGE_GAP_KEYWORDS = ["knowledge gap", "gap", "unknown", "unresolved"];
const RECOMMENDATION_KEYWORDS = [
  "recommendation",
  "concrete",
  "action",
  "next step",
];

export function parseSynthesisFile(filePath: string): Synthesis {
  const content = fs.readFileSync(filePath, "utf-8");
  return parseSynthesis(content);
}

export function parseSynthesis(markdown: string): Synthesis {
  const sections = splitIntoSections(markdown);
  const h2Blocks = buildH2Blocks(markdown);

  const convergence: ConvergencePoint[] = [];
  const divergence: DivergencePoint[] = [];
  const emergentIdeas: string[] = [];
  const knowledgeGaps: string[] = [];
  const recommendations: string[] = [];
  const unexpectedAlliances: string[] = [];

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Synthesis";

  // Use h2 blocks (which include all h3 sub-content) for keyword matching
  for (const block of h2Blocks) {
    const headingLower = block.heading.toLowerCase();

    if (matchesKeywords(headingLower, CONVERGENCE_KEYWORDS)) {
      convergence.push(...parseConvergenceSection(block.fullContent));
    } else if (matchesKeywords(headingLower, DIVERGENCE_KEYWORDS)) {
      divergence.push(...parseDivergenceSection(block.fullContent));
    } else if (matchesKeywords(headingLower, EMERGENT_KEYWORDS)) {
      emergentIdeas.push(...parseBulletSection(block.fullContent));
      unexpectedAlliances.push(...parseBulletSection(block.fullContent));
    } else if (matchesKeywords(headingLower, KNOWLEDGE_GAP_KEYWORDS)) {
      knowledgeGaps.push(...parseBulletSection(block.fullContent));
    } else if (matchesKeywords(headingLower, RECOMMENDATION_KEYWORDS)) {
      recommendations.push(...parseBulletSection(block.fullContent));
    }
  }

  return {
    raw: markdown,
    title,
    convergence,
    divergence,
    emergentIdeas,
    knowledgeGaps,
    recommendations,
    unexpectedAlliances,
    sections,
  };
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

interface H2Block {
  heading: string;
  fullContent: string; // Everything between this h2 and the next h2
}

// Build blocks where each h2 heading owns all content up to the next h2
function buildH2Blocks(markdown: string): H2Block[] {
  const blocks: H2Block[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "";
  let contentLines: string[] = [];

  function flush() {
    if (currentHeading) {
      blocks.push({
        heading: currentHeading,
        fullContent: contentLines.join("\n").trim(),
      });
    }
    contentLines = [];
  }

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    // Only match h2, not h3+
    if (h2Match && !line.startsWith("###")) {
      flush();
      currentHeading = h2Match[1].trim();
      continue;
    }
    contentLines.push(line);
  }
  flush();

  return blocks;
}

function splitIntoSections(markdown: string): SynthesisSection[] {
  const sections: SynthesisSection[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "";
  let currentLevel = 0;
  let contentLines: string[] = [];

  function flush() {
    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        content: contentLines.join("\n").trim(),
      });
    }
    contentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentLevel = headingMatch[1].length;
      currentHeading = headingMatch[2].trim();
      continue;
    }
    contentLines.push(line);
  }
  flush();

  return sections;
}

function parseConvergenceSection(content: string): ConvergencePoint[] {
  const points: ConvergencePoint[] = [];

  // Track current h3 section for context-based confidence inference
  let currentH3 = "";
  const lines = content.split("\n");
  const chunks: Array<{ text: string; h3Context: string }> = [];
  let currentChunkLines: string[] = [];

  for (const line of lines) {
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      if (currentChunkLines.length > 0) {
        chunks.push({ text: currentChunkLines.join("\n"), h3Context: currentH3 });
        currentChunkLines = [];
      }
      currentH3 = h3Match[1];
      continue;
    }

    // Split on new bold item (bullet or paragraph)
    if (/^- \*\*/.test(line) || /^(?![\s-])\*\*/.test(line)) {
      if (currentChunkLines.length > 0) {
        chunks.push({ text: currentChunkLines.join("\n"), h3Context: currentH3 });
        currentChunkLines = [];
      }
    }
    currentChunkLines.push(line);
  }
  if (currentChunkLines.length > 0) {
    chunks.push({ text: currentChunkLines.join("\n"), h3Context: currentH3 });
  }

  for (const { text, h3Context } of chunks) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const claimMatch = trimmed.match(/^(?:\s*-\s+)?\*\*(.+?)\*\*/);
    if (!claimMatch) continue;

    // Extract explicit confidence
    let confidence: ConvergencePoint["confidence"] = "unknown";
    const confMatch = trimmed.match(
      /[Cc]onfidence[:\s]*\*?\*?(\w[\w-]*)\*?\*?/i
    );
    if (confMatch) {
      const raw = confMatch[1].toLowerCase();
      if (raw === "high") confidence = "high";
      else if (raw.includes("medium") && raw.includes("high"))
        confidence = "medium-high";
      else if (raw.includes("medium")) confidence = "medium";
      else if (raw === "low") confidence = "low";
    }

    // Infer confidence from h3 heading context if not explicit
    if (confidence === "unknown" && h3Context) {
      const ctx = h3Context.toLowerCase();
      if (ctx.includes("highest confidence") || ctx.includes("tier 1") || ctx.includes("all 3") || ctx.includes("every iteration") || ctx.includes("structure-independent")) {
        confidence = "high";
      } else if (ctx.includes("tier 2") || ctx.includes("strong") || ctx.includes("2-3 iteration") || ctx.includes("two of three")) {
        confidence = "medium-high";
      } else if (ctx.includes("tier 3") || ctx.includes("moderate") || ctx.includes("mixed")) {
        confidence = "medium";
      }
    }

    points.push({
      claim: claimMatch[1].trim(),
      confidence,
      evidence: trimmed,
    });
  }

  return points;
}

function parseDivergenceSection(content: string): DivergencePoint[] {
  const points: DivergencePoint[] = [];
  const chunks = content.split(/(?=^- \*\*|^###\s+)/m);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const issueMatch = trimmed.match(/\*\*(.+?)\*\*/);
    if (!issueMatch) continue;

    points.push({
      issue: issueMatch[1].trim(),
      content: trimmed,
    });
  }

  return points;
}

function parseBulletSection(content: string): string[] {
  const items: string[] = [];
  const chunks = content.split(/(?=^- \*\*|^\d+\.\s+\*\*)/m);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const boldMatch = trimmed.match(/\*\*(.+?)\*\*/);
    if (boldMatch) {
      items.push(trimmed);
    }
  }

  return items;
}
