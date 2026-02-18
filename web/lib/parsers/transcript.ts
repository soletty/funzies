import type { DebateRound, DebateExchange } from "../types";

// Transcript patterns observed in real workspaces:
// Debate rounds as ## headings: "## DUEL 1: Marcus vs Elena"
// Speakers in bold: "**Marcus Hadley:** text" or "**[SOCRATE intervenes]**"
// Assembly reactions section: "**Assembly Reactions:**"
// Socrate interventions: "**Socrate:**"
const SPEAKER_PATTERN = /^\*\*([^*]+?)(?:\s*:)?\*\*\s*(.*)$/;
const ROUND_HEADING = /^##\s+(.+)$/;
const SOCRATE_INTERVENTION = /^\*\*\[SOCRATE\b/i;
const ASSEMBLY_REACTIONS = /assembly\s*reactions/i;

export function parseTranscript(markdown: string): DebateRound[] {
  const rounds: DebateRound[] = [];
  const lines = markdown.split("\n");

  let currentRound: DebateRound | null = null;
  let mode: "exchanges" | "reactions" | "socrate" = "exchanges";
  let currentSpeaker = "";
  let currentContent: string[] = [];

  function flushExchange() {
    if (!currentRound || !currentSpeaker) return;
    const content = currentContent.join("\n").trim();
    if (!content) return;

    const exchange: DebateExchange = {
      speaker: currentSpeaker,
      content,
    };

    if (mode === "reactions") {
      currentRound.assemblyReactions.push(exchange);
    } else if (mode === "socrate") {
      currentRound.socrate.push(exchange);
    } else {
      currentRound.exchanges.push(exchange);
    }
    currentSpeaker = "";
    currentContent = [];
  }

  function flushRound() {
    flushExchange();
    if (currentRound) rounds.push(currentRound);
  }

  for (const line of lines) {
    // Check for round heading
    const roundMatch = line.match(ROUND_HEADING);
    if (roundMatch) {
      flushRound();
      currentRound = {
        title: roundMatch[1].trim(),
        exchanges: [],
        assemblyReactions: [],
        socrate: [],
      };
      mode = "exchanges";
      continue;
    }

    if (!currentRound) {
      // If no round heading yet, create a default one
      if (line.match(SPEAKER_PATTERN)) {
        currentRound = {
          title: "Debate",
          exchanges: [],
          assemblyReactions: [],
          socrate: [],
        };
        mode = "exchanges";
      } else {
        continue;
      }
    }

    // Check for Socrate intervention marker
    if (SOCRATE_INTERVENTION.test(line)) {
      flushExchange();
      mode = "socrate";
      continue;
    }

    // Check for assembly reactions marker
    if (ASSEMBLY_REACTIONS.test(line)) {
      flushExchange();
      mode = "reactions";
      continue;
    }

    // Check for speaker pattern
    const speakerMatch = line.match(SPEAKER_PATTERN);
    if (speakerMatch) {
      flushExchange();
      currentSpeaker = speakerMatch[1]
        .trim()
        .replace(/^\[/, "")
        .replace(/\]$/, "");

      // Check if speaker is Socrate
      if (currentSpeaker.toLowerCase().startsWith("socrate")) {
        mode = "socrate";
      }

      const rest = speakerMatch[2]?.trim();
      if (rest) currentContent.push(rest);
      continue;
    }

    // Continuation line
    if (currentSpeaker && line.trim()) {
      currentContent.push(line);
    } else if (!line.trim() && currentContent.length > 0) {
      currentContent.push("");
    }
  }

  flushRound();
  return rounds;
}
