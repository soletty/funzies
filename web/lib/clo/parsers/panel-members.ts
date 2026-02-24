import type { PanelMember } from "../types.js";

const MEMBER_HEADING = /^##\s+Member\s+(\d+):\s*(.+?)\s*\|\s*(.+)$/i;
const SECTION_HEADING = /^###\s+(.+)$/;

export function parsePanelMembers(markdown: string): PanelMember[] {
  const members: PanelMember[] = [];
  const lines = markdown.split("\n");

  let current: Partial<PanelMember> | null = null;
  let currentSection = "";
  let sectionContent: string[] = [];
  let fullProfileLines: string[] = [];

  function flushSection() {
    if (!current || !currentSection) return;
    const text = sectionContent.join("\n").trim();
    applySection(current, currentSection, text);
    sectionContent = [];
  }

  function flushMember() {
    flushSection();
    if (current?.name) {
      members.push({
        number: current.number ?? 0,
        name: current.name,
        role: current.role ?? "",
        background: current.background ?? "",
        investmentPhilosophy: current.investmentPhilosophy ?? "",
        specializations: current.specializations ?? [],
        decisionStyle: current.decisionStyle ?? "",
        riskPersonality: current.riskPersonality ?? "",
        notablePositions: current.notablePositions ?? [],
        blindSpots: current.blindSpots ?? [],
        fullProfile: fullProfileLines.join("\n").trim(),
        avatarUrl: current.avatarUrl ?? "",
      });
    }
  }

  for (const line of lines) {
    const memberMatch = line.match(MEMBER_HEADING);
    if (memberMatch) {
      flushMember();
      current = {
        number: parseInt(memberMatch[1], 10),
        name: memberMatch[2].trim(),
        role: memberMatch[3].trim(),
      };
      currentSection = "";
      sectionContent = [];
      fullProfileLines = [line];
      continue;
    }

    if (!current) continue;
    fullProfileLines.push(line);

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      flushSection();
      currentSection = sectionMatch[1];
      continue;
    }

    if (currentSection) {
      sectionContent.push(line);
    }
  }

  flushMember();
  return members;
}

function applySection(current: Partial<PanelMember>, sectionName: string, text: string) {
  const key = sectionName.toLowerCase();

  if (key.includes("background")) {
    current.background = text;
  } else if (key.includes("investment philosophy") || key.includes("philosophy") || key.includes("credit philosophy")) {
    current.investmentPhilosophy = text;
  } else if (key.includes("specialization")) {
    current.specializations = text
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (key.includes("decision style")) {
    current.decisionStyle = text;
  } else if (key.includes("risk personality") || key.includes("risk")) {
    current.riskPersonality = text;
  } else if (key.includes("notable position")) {
    current.notablePositions = parseBulletList(text);
  } else if (key.includes("blind spot")) {
    current.blindSpots = parseBulletList(text);
  } else if (key.includes("full profile")) {
    current.fullProfile = text;
  }
}

function parseBulletList(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^[-*]\s/.test(line.trim()))
    .map((line) => line.trim().replace(/^[-*]\s*/, ""));
}
