const SPEAKER_COLORS = [
  "#0969da", "#8250df", "#bf3989", "#0e8a16", "#e16f24",
  "#cf222e", "#1a7f37", "#6639ba", "#953800", "#0550ae",
  "#7c3aed", "#d1242f",
];

export interface SpeakerBlock {
  speaker: string;
  content: string;
  color: string;
}

export function parseFollowUpResponse(
  text: string,
  characterNames: string[]
): SpeakerBlock[] {
  const colorMap = new Map<string, string>();
  characterNames.forEach((name, i) => {
    colorMap.set(name.toLowerCase(), SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
  });

  const pattern = /\*\*([^*]+?):\*\*/g;
  const splits: { speaker: string; startIndex: number }[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    splits.push({ speaker: match[1].trim(), startIndex: match.index });
  }

  if (splits.length === 0) {
    return [{ speaker: "", content: text, color: "var(--color-accent)" }];
  }

  const blocks: SpeakerBlock[] = [];
  for (let i = 0; i < splits.length; i++) {
    const { speaker, startIndex } = splits[i];
    const headerEnd = text.indexOf("**", startIndex + 2) + 2;
    const contentStart = headerEnd + 1;
    const contentEnd = i + 1 < splits.length ? splits[i + 1].startIndex : text.length;
    const content = text.slice(contentStart, contentEnd).trim();

    const color = findSpeakerColor(speaker, colorMap);
    blocks.push({ speaker, content, color });
  }

  return blocks;
}

function findSpeakerColor(speaker: string, colorMap: Map<string, string>): string {
  const lower = speaker.toLowerCase();
  if (colorMap.has(lower)) return colorMap.get(lower)!;

  for (const [name, color] of colorMap) {
    const firstName = name.split(/\s+/)[0];
    if (firstName === lower || name.includes(lower) || lower.includes(firstName)) {
      return color;
    }
  }

  if (lower === "synthesis" || lower === "socrate") return "var(--color-socrate)";
  return "var(--color-accent)";
}

type Mode = "ask-assembly" | "ask-character" | "ask-library" | "debate";

export function getLoadingMessage(mode: Mode, isChallenge: boolean): string {
  if (isChallenge) return "Preparing defense\u2026";
  switch (mode) {
    case "ask-library": return "Researching sources\u2026";
    case "debate": return "The panel is debating\u2026";
    default: return "Panel is deliberating\u2026";
  }
}
