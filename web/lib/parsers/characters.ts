import type { Character } from "../types";

// Patterns observed in real workspaces:
// "## Character 1: Marcus Hadley [TAG: SKEPTIC]"
// "## CHARACTER 7 — Dr. Ingrid Nørgaard [TAG: ACCESS]"
// "## 1. KIRA TANAKA — The Static Site Fundamentalist [TAG: CRAFT]"
const CHARACTER_HEADING =
  /^##\s+(?:(?:Character|CHARACTER)\s+)?(\d+)[.:\s—–-]+\s*(.+?)(?:\s*\[TAG:\s*([^\]]+)\])?$/i;

const SECTION_HEADING = /^###\s+(.+)$/;

// Inline bold-label format: "- **Framework:** ..." or "- **Blind spot:** ..."
const BOLD_LABEL = /^-\s+\*\*([^*]+?)(?::)?\*\*\s*(.*)/;

export function parseCharacterFiles(contents: string[]): Character[] {
  const characters: Character[] = [];
  for (const content of contents) {
    characters.push(...parseCharactersFromMarkdown(content));
  }
  characters.sort((a, b) => a.number - b.number);
  return characters;
}

function parseCharactersFromMarkdown(markdown: string): Character[] {
  const characters: Character[] = [];
  const lines = markdown.split("\n");

  let current: Partial<Character> | null = null;
  let currentSection = "";
  let sectionContent: string[] = [];
  let fullProfileLines: string[] = [];
  let biographyLines: string[] = [];
  let collectingBiography = false;

  function flushSection() {
    if (!current || !currentSection) return;
    const text = sectionContent.join("\n").trim();
    applySection(current, currentSection, text);
    sectionContent = [];
  }

  function flushCharacter() {
    flushSection();
    if (current && collectingBiography && biographyLines.length > 0) {
      current.biography = biographyLines.join("\n").trim();
    }
    if (current?.name) {
      characters.push({
        number: current.number ?? 0,
        name: current.name,
        tag: current.tag ?? "",
        biography: current.biography ?? "",
        framework: current.framework ?? "",
        frameworkName: current.frameworkName ?? "",
        specificPositions: current.specificPositions ?? [],
        blindSpot: current.blindSpot ?? "",
        heroes: current.heroes ?? [],
        rhetoricalTendencies: current.rhetoricalTendencies ?? "",
        debateStyle: current.debateStyle ?? "",
        relationships: current.relationships ?? [],
        fullProfile: fullProfileLines.join("\n").trim(),
      });
    }
  }

  for (const line of lines) {
    const charMatch = line.match(CHARACTER_HEADING);
    if (charMatch) {
      flushCharacter();
      current = {
        number: parseInt(charMatch[1], 10),
        name: charMatch[2].trim().replace(/\s*\[.*$/, ""),
        tag: charMatch[3]?.trim() ?? "",
      };
      currentSection = "";
      sectionContent = [];
      biographyLines = [];
      collectingBiography = true;
      fullProfileLines = [line];
      continue;
    }

    if (!current) continue;
    fullProfileLines.push(line);

    // Check for ### section headings (original format)
    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      flushSection();
      if (collectingBiography && biographyLines.length > 0) {
        current.biography = biographyLines.join("\n").trim();
        collectingBiography = false;
      }
      currentSection = sectionMatch[1];
      continue;
    }

    // Check for inline bold-label format: "- **Framework:** ..."
    const boldMatch = line.match(BOLD_LABEL);
    if (boldMatch) {
      flushSection();
      if (collectingBiography && biographyLines.length > 0) {
        current.biography = biographyLines.join("\n").trim();
        collectingBiography = false;
      }
      const label = boldMatch[1].trim();
      const rest = boldMatch[2].trim();
      applyInlineLabel(current, label, rest);
      currentSection = "";
      continue;
    }

    // If we're still collecting biography text (paragraphs before first section/label)
    if (collectingBiography && current) {
      if (line.trim()) {
        biographyLines.push(line);
      } else if (biographyLines.length > 0) {
        biographyLines.push(line);
      }
      continue;
    }

    if (currentSection) {
      sectionContent.push(line);
    }
  }

  flushCharacter();
  return characters;
}

function applySection(
  current: Partial<Character>,
  sectionName: string,
  text: string
) {
  const key = sectionName.toLowerCase();

  if (key.includes("biography")) {
    current.biography = text;
  } else if (
    key.includes("ideological framework") ||
    key.includes("framework")
  ) {
    current.framework = text;
    extractFrameworkName(current, text, sectionName);
  } else if (key.includes("specific position") || key.includes("positions")) {
    current.specificPositions = parseNumberedList(text);
  } else if (key.includes("blind spot")) {
    current.blindSpot = text;
  } else if (
    key.includes("intellectual heroes") ||
    key.includes("heroes")
  ) {
    current.heroes = parseBulletList(text);
  } else if (key.includes("debate style")) {
    current.debateStyle = text;
  } else if (key.includes("rhetorical") || key.includes("tendencies")) {
    current.rhetoricalTendencies = text;
  } else if (key.includes("relationship")) {
    current.relationships = parseBulletList(text);
  }
}

function applyInlineLabel(
  current: Partial<Character>,
  label: string,
  value: string
) {
  const key = label.toLowerCase();

  if (key.includes("framework")) {
    current.framework = value;
    extractFrameworkName(current, value, label);
  } else if (key.includes("position")) {
    current.specificPositions = value
      .split(/\.\s+/)
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter((s) => s.length > 0);
  } else if (key.includes("blind spot")) {
    current.blindSpot = value;
  } else if (key.includes("heroes")) {
    current.heroes = value
      .split(/,\s*(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (key.includes("debate style")) {
    current.debateStyle = value;
  } else if (key.includes("rhetorical")) {
    current.rhetoricalTendencies = value;
  } else if (
    key.includes("primary adversary") ||
    key.includes("unexpected ally") ||
    key.includes("relationship")
  ) {
    if (!current.relationships) current.relationships = [];
    current.relationships.push(`**${label}:** ${value}`);
  }
}

function extractFrameworkName(
  current: Partial<Character>,
  text: string,
  heading: string
) {
  const nameMatch = text.match(/\*\*"?([^"*]+)"?\*\*/);
  if (nameMatch) {
    current.frameworkName = nameMatch[1].replace(/"/g, "");
  } else {
    const headingNameMatch = heading.match(/\*\*"?([^"*]+)"?\*\*/);
    if (headingNameMatch)
      current.frameworkName = headingNameMatch[1].replace(/"/g, "");
    // For inline format like "Framework Name — description", extract the name before the dash
    const dashMatch = text.match(/^([^—–-]+?)\s*[—–-]/);
    if (dashMatch && !current.frameworkName) {
      current.frameworkName = dashMatch[1].trim();
    }
  }
}

function parseNumberedList(text: string): string[] {
  const items: string[] = [];
  const lines = text.split("\n");
  let currentItem: string[] = [];

  for (const line of lines) {
    if (/^\d+\.\s/.test(line)) {
      if (currentItem.length > 0) {
        items.push(currentItem.join(" ").trim());
      }
      currentItem = [line.replace(/^\d+\.\s*/, "")];
    } else if (line.trim() && currentItem.length > 0) {
      currentItem.push(line.trim());
    }
  }
  if (currentItem.length > 0) {
    items.push(currentItem.join(" ").trim());
  }
  return items;
}

function parseBulletList(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^[-*]\s/.test(line.trim()))
    .map((line) => line.trim().replace(/^[-*]\s*/, ""));
}
