import type { ReferenceLibrary, ReferenceSection, ReferenceSubsection, ReferenceEntry, CrossReading } from "../types";

export function parseReferenceLibrary(raw: string): ReferenceLibrary | null {
  const lines = raw.split("\n");

  const sections: ReferenceSection[] = [];
  const crossReadings: CrossReading[] = [];

  let currentSection: ReferenceSection | null = null;
  let currentSub: ReferenceSubsection | null = null;
  let inCrossReadings = false;

  for (const line of lines) {
    // H2: top-level section (LAYER 1, LAYER 2, etc.)
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flushSubsection(currentSection, currentSub);
      currentSub = null;
      currentSection = { title: h2[1].trim(), subsections: [] };
      sections.push(currentSection);
      inCrossReadings = false;
      continue;
    }

    // H3: subsection (character tradition or data category)
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      flushSubsection(currentSection, currentSub);

      const title = h3[1].trim();
      if (title.toLowerCase().includes("cross-reading")) {
        inCrossReadings = true;
        currentSub = null;
        continue;
      }

      inCrossReadings = false;
      const charMatch = title.match(/^(.+?)\s*—\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
      currentSub = {
        title: charMatch ? charMatch[1].trim() : title,
        character: charMatch ? charMatch[2].trim() : null,
        tag: charMatch?.[3]?.trim() ?? null,
        entries: [],
      };
      continue;
    }

    // Cross-reading entries
    if (inCrossReadings) {
      const crMatch = line.match(/^-\s+(.+?)\s+must engage:\s*(.+)/);
      if (crMatch) {
        const charName = crMatch[1].trim().replace(/\*\*/g, "");
        crossReadings.push({ character: charName, assignment: crMatch[2].trim() });
      }
      continue;
    }

    // Bullet entries within a subsection
    if (currentSub && line.match(/^-\s+/)) {
      const entry = parseEntry(line);
      if (entry) currentSub.entries.push(entry);
    }
  }

  flushSubsection(currentSection, currentSub);

  if (sections.length === 0) return null;
  return { sections, crossReadings };
}

function flushSubsection(section: ReferenceSection | null, sub: ReferenceSubsection | null) {
  if (section && sub && sub.entries.length > 0) {
    section.subsections.push(sub);
  }
}

function parseEntry(line: string): ReferenceEntry | null {
  const stripped = line.replace(/^-\s+/, "").trim();
  if (!stripped) return null;

  // Pattern: **Author** — *Work Title* (Year). Description
  const full = stripped.match(
    /^\*\*([^*]+)\*\*\s*—\s*\*([^*]+)\*(?:\s*\((\d{4})\))?[.,]?\s*(.*)/
  );
  if (full) {
    return {
      author: full[1].trim(),
      work: full[2].trim(),
      year: full[3] ?? null,
      description: full[4].trim(),
    };
  }

  // Pattern: **Author** — Work description (no italics)
  const simple = stripped.match(/^\*\*([^*]+)\*\*\s*—\s*(.*)/);
  if (simple) {
    const yearMatch = simple[2].match(/\((\d{4})\)/);
    return {
      author: simple[1].trim(),
      work: "",
      year: yearMatch?.[1] ?? null,
      description: simple[2].trim(),
    };
  }

  // Fallback: plain bullet with data
  return {
    author: "",
    work: "",
    year: null,
    description: stripped,
  };
}
