import type {
  CreditMemo,
  CreditRiskAssessment,
  CreditRecommendation,
  CloDebateRound,
  IndividualCreditAssessment,
  CreditVerdict,
  CreditVoteRecord,
} from "../types.js";

const VALID_VERDICTS: CreditVerdict[] = ["strong_buy", "buy", "hold", "pass", "strong_pass"];

export function parseCreditMemo(raw: string): CreditMemo {
  const lines = raw.split("\n");
  const titleMatch = raw.match(/^#\s+(.+)$/m) || raw.match(/^##\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s*[—–\-:]\s*Credit Memo$/i, "") : "Credit Memo";

  const sections: { heading: string; content: string }[] = [];
  let currentHeading = "";
  let contentLines: string[] = [];

  function flush() {
    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        content: contentLines.join("\n").trim(),
      });
    }
    contentLines = [];
  }

  for (const line of lines) {
    if (line.match(/^#\s+/) && !line.startsWith("##")) {
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match && !line.startsWith("###")) {
      flush();
      currentHeading = h2Match[1].trim();
      continue;
    }
    contentLines.push(line);
  }
  flush();

  return { title, sections, raw };
}

export function parseCreditRiskAssessment(raw: string): CreditRiskAssessment {
  const riskLevelMatch = raw.match(/(?:overall\s+risk\s+(?:rating|level))[:\s]*\*?\*?(low|moderate|high|very[- ]high)\*?\*?/i);
  let overallRisk: CreditRiskAssessment["overallRisk"] = "moderate";
  if (riskLevelMatch) {
    const matched = riskLevelMatch[1].toLowerCase().replace(/\s+/, "-");
    if (matched === "low" || matched === "moderate" || matched === "high" || matched === "very-high") {
      overallRisk = matched;
    }
  }

  const categories: CreditRiskAssessment["categories"] = [];

  const categoryPattern = /(?:^#{2,3}\s*(.+?Risk)\s*$|^\*\*(.+?Risk)\*\*)/gmi;
  let catMatch;
  const categoryPositions: { name: string; start: number }[] = [];

  while ((catMatch = categoryPattern.exec(raw)) !== null) {
    const name = (catMatch[1] || catMatch[2]).trim();
    if (/overall/i.test(name)) continue;
    categoryPositions.push({ name, start: catMatch.index });
  }

  for (let i = 0; i < categoryPositions.length; i++) {
    const { name, start } = categoryPositions[i];
    const end = i + 1 < categoryPositions.length ? categoryPositions[i + 1].start : raw.indexOf("## Mitigant", start) > 0 ? raw.indexOf("## Mitigant", start) : raw.length;
    const section = raw.slice(start, end);

    const levelMatch = section.match(/(?:Level|Rating)[:\s]*\*?\*?(low|moderate|high|very[- ]high)\*?\*?/i);
    const level = levelMatch ? levelMatch[1].toLowerCase().replace(/\s+/, "-") : "moderate";

    const analysisText = section
      .replace(/^.*?\n/, "")
      .replace(/(?:Level|Rating)[:\s]*\*?\*?(?:low|moderate|high|very[- ]high)\*?\*?\s*/i, "")
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .join(" ")
      .slice(0, 500);

    categories.push({ name, level, analysis: analysisText });
  }

  const mitigantsSection = raw.match(/## Mitigants?\s*\n([\s\S]*?)(?=##|$)/i);
  const mitigants: string[] = [];
  if (mitigantsSection) {
    const lines = mitigantsSection[1].split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s/.test(trimmed)) {
        mitigants.push(trimmed.replace(/^[-*]\s*/, ""));
      }
    }
  }

  return { overallRisk, categories, mitigants, raw };
}

export function parseCreditRecommendation(raw: string): CreditRecommendation {
  const votes: CreditVoteRecord[] = [];
  const memberBlocks = raw.split(/\n(?=## \S)/);

  for (const block of memberBlocks) {
    const nameMatch = block.match(/^## (.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/^\[|\]$/g, "");
    if (name.toLowerCase() === "aggregate recommendation") continue;

    const voteMatch = block.match(/Vote:\s*\*?\*?(strong_buy|buy|hold|pass|strong_pass)\*?\*?/i);
    const convictionMatch = block.match(/Conviction:\s*\*?\*?(high|medium|low)\*?\*?/i);
    const rationaleMatch = block.match(/Rationale:\s*([\s\S]*?)(?=^## |\n\n## |$)/m);

    if (voteMatch) {
      votes.push({
        memberName: name,
        vote: voteMatch[1].toLowerCase() as CreditVerdict,
        conviction: convictionMatch ? convictionMatch[1].toLowerCase() : "medium",
        rationale: rationaleMatch ? rationaleMatch[1].trim() : "",
      });
    }
  }

  const aggregateSection = raw.match(/## Aggregate Recommendation\s*\n([\s\S]*?)$/i);
  let verdict: CreditVerdict = "hold";
  const dissents: string[] = [];
  const conditions: string[] = [];

  if (aggregateSection) {
    const verdictMatch = aggregateSection[1].match(/Verdict[:\s]*\*?\*?(strong_buy|buy|hold|pass|strong_pass)\*?\*?/i);
    if (verdictMatch && VALID_VERDICTS.includes(verdictMatch[1].toLowerCase() as CreditVerdict)) {
      verdict = verdictMatch[1].toLowerCase() as CreditVerdict;
    }

    const dissentsMatch = aggregateSection[1].match(/Dissents?[:\s]*([\s\S]*?)(?=[-*]\s*\*?\*?Conditions?|\*?\*?Conditions?|$)/i);
    if (dissentsMatch) {
      for (const line of dissentsMatch[1].split("\n")) {
        const trimmed = line.trim();
        if (/^[-*]\s/.test(trimmed)) {
          dissents.push(trimmed.replace(/^[-*]\s*/, ""));
        }
      }
    }

    const conditionsMatch = aggregateSection[1].match(/Conditions?[:\s]*([\s\S]*?)$/i);
    if (conditionsMatch) {
      for (const line of conditionsMatch[1].split("\n")) {
        const trimmed = line.trim();
        if (/^[-*]\s/.test(trimmed)) {
          conditions.push(trimmed.replace(/^[-*]\s*/, ""));
        }
      }
    }
  } else if (votes.length > 0) {
    const voteCounts: Record<CreditVerdict, number> = { strong_buy: 0, buy: 0, hold: 0, pass: 0, strong_pass: 0 };
    for (const v of votes) voteCounts[v.vote]++;
    const maxCount = Math.max(...Object.values(voteCounts));
    const tied = (Object.entries(voteCounts) as [CreditVerdict, number][]).filter(([, c]) => c === maxCount);
    verdict = tied.length === 1 ? tied[0][0] : "hold";
  }

  return { verdict, votes, dissents, conditions, raw };
}

export function parseDebate(raw: string): CloDebateRound[] {
  const rounds: CloDebateRound[] = [];
  const roundBlocks = raw.split(/(?=^## Round\s+\d)/mi);

  for (const block of roundBlocks) {
    const roundMatch = block.match(/^## Round\s+(\d+)/mi);
    if (!roundMatch) continue;

    const roundNum = parseInt(roundMatch[1], 10);
    const exchanges: { speaker: string; content: string }[] = [];

    const parts = block.split(/\n{1,2}\*\*([^*]+?)\*\*:\s*/);
    for (let i = 1; i < parts.length - 1; i += 2) {
      const speaker = parts[i].trim().replace(/\s*(?:intervenes|responds)\s*$/, "");
      const content = (parts[i + 1] || "").trim();
      if (speaker && content) {
        exchanges.push({ speaker, content });
      }
    }

    if (exchanges.length > 0) {
      rounds.push({ round: roundNum, exchanges });
    }
  }

  return rounds;
}

export function parseIndividualAssessments(raw: string): IndividualCreditAssessment[] {
  const assessments: IndividualCreditAssessment[] = [];
  const memberBlocks = raw.split(/(?=^## \S)/m);

  for (const block of memberBlocks) {
    const nameMatch = block.match(/^## (.+)$/m);
    if (!nameMatch) continue;

    const memberName = nameMatch[1].trim().replace(/^\[|\]$/g, "");

    const positionMatch = block.match(/### Position\s*\n([\s\S]*?)(?=### |$)/i);
    const keyPointsMatch = block.match(/### Key Points\s*\n([\s\S]*?)(?=### |$)/i);
    const concernsMatch = block.match(/### Concerns\s*\n([\s\S]*?)(?=### |## |$)/i);

    const position = positionMatch ? positionMatch[1].trim() : "";
    const keyPoints = keyPointsMatch
      ? keyPointsMatch[1]
          .split("\n")
          .filter((l) => /^[-*]\s/.test(l.trim()))
          .map((l) => l.trim().replace(/^[-*]\s*/, ""))
      : [];
    const concerns = concernsMatch
      ? concernsMatch[1]
          .split("\n")
          .filter((l) => /^[-*]\s/.test(l.trim()))
          .map((l) => l.trim().replace(/^[-*]\s*/, ""))
      : [];

    if (position || keyPoints.length > 0) {
      assessments.push({ memberName, position, keyPoints, concerns, raw: block.trim() });
    }
  }

  return assessments;
}
