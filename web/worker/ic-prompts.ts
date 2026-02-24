import type { InvestorProfile, CommitteeMember, Evaluation } from "../lib/ic/types.js";

const QUALITY_RULES = `
## Quality Rules
- Source honesty: never fabricate data, studies, or statistics. Use "based on professional judgment" when no hard data exists.
- Stay on the question: >80% of your response must be direct answer. No filler.
- Practical and actionable: this is for real investment decisions, not an academic exercise.
- Speak plainly: if stripping jargon makes the idea disappear, there was no idea.
- Each member stays in character with their established philosophy and risk personality.`;

function formatProfile(profile: InvestorProfile): string {
  return `Investment Philosophy: ${profile.investmentPhilosophy || "Not specified"}
Risk Tolerance: ${profile.riskTolerance || "Not specified"}
Asset Classes: ${(profile.assetClasses || []).join(", ") || "Not specified"}
Current Portfolio: ${profile.currentPortfolio || "Not specified"}
Geographic Preferences: ${profile.geographicPreferences || "Not specified"}
ESG Preferences: ${profile.esgPreferences || "Not specified"}
Decision Style: ${profile.decisionStyle || "Not specified"}
AUM Range: ${profile.aumRange || "Not specified"}
Time Horizons: ${profile.timeHorizons ? Object.entries(profile.timeHorizons).map(([k, v]) => `${k}: ${v}`).join(", ") : "Not specified"}
Beliefs & Biases: ${profile.beliefsAndBiases || "Not specified"}`;
}

function formatMembers(members: CommitteeMember[]): string {
  return members
    .map(
      (m) =>
        `## ${m.name} | ${m.role}\nPhilosophy: ${m.investmentPhilosophy}\nSpecializations: ${m.specializations.join(", ")}\nRisk Personality: ${m.riskPersonality}\nDecision Style: ${m.decisionStyle}`
    )
    .join("\n\n");
}

function formatEvaluation(evaluation: Pick<Evaluation, "title" | "opportunityType" | "companyName" | "thesis" | "terms" | "details">): string {
  return `Title: ${evaluation.title}
Opportunity Type: ${evaluation.opportunityType || "Not specified"}
Company: ${evaluation.companyName || "Not specified"}
Thesis: ${evaluation.thesis || "Not specified"}
Terms: ${evaluation.terms || "Not specified"}
Details: ${evaluation.details ? JSON.stringify(evaluation.details, null, 2) : "None"}`;
}

// ─── Committee Generation ────────────────────────────────────────────

export function profileAnalysisPrompt(profile: InvestorProfile): { system: string; user: string } {
  return {
    system: `You are an expert investment committee architect. Analyze an investor's questionnaire responses and determine the optimal committee composition for their family office.

Your analysis should consider their investment philosophy, risk tolerance, preferred asset classes, decision-making style, and any stated beliefs or biases.

Output a structured analysis with:
1. **Investor Profile Summary** — Key characteristics distilled from the questionnaire
2. **Committee Needs** — What types of expertise and perspectives this investor needs
3. **Recommended Roles** — 5-7 specific committee roles with rationale for each. Include at minimum:
   - A risk-focused role (hawk/guardian)
   - A growth/opportunity-focused role (optimist)
   - A contrarian/devil's advocate
   - A sector specialist aligned with their asset class preferences
   - An operations/due diligence focused role
4. **Dynamic Tensions** — Which roles will naturally disagree and why that is productive

${QUALITY_RULES}`,
    user: `Analyze this investor profile and recommend committee composition:

${formatProfile(profile)}`,
  };
}

export function committeeGenerationPrompt(
  profileAnalysis: string,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are an expert at creating diverse, realistic investment committee members for a family office. Generate 5-7 committee members based on the profile analysis.

Each member must have genuine depth — these are senior investment professionals with decades of experience, strong opinions, and distinct analytical frameworks.

## Required Diversity
- A risk hawk who instinctively sees downside
- A growth optimist who spots opportunity others miss
- A contrarian who challenges consensus
- A sector specialist aligned with the FO's focus areas
- An operations/due diligence focused member who cares about execution

## Format for Each Member

## Member N: Full Name | ROLE

### Background
2-3 sentences. Focus on career-defining experiences that shaped their investment worldview.

### Investment Philosophy
Their core investment belief system in 2-3 sentences.

### Specializations
3-5 areas of deep expertise, comma-separated.

### Decision Style
How they approach investment decisions — analytical, intuitive, consensus-seeking, etc.

### Risk Personality
Their relationship with risk — how they assess it, what makes them comfortable/uncomfortable.

### Notable Positions
2-3 bullet points of memorable investment positions they have taken (real-sounding but fictional).

### Blind Spots
1-2 things this person systematically underweights or fails to see.

### Full Profile
A detailed markdown profile (3-5 paragraphs) covering their career arc, investment track record highlights, how they interact with other committee members, and what they bring to the table.

${QUALITY_RULES}`,
    user: `Generate the investment committee based on this analysis:

Profile Analysis:
${profileAnalysis}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function avatarMappingPrompt(members: string): string {
  return `Given the investment committee member profiles below, map each member to DiceBear Adventurer avatar options that visually match their described profile — age, gender, ethnicity, personality, and professional appearance.

## Available Options

Pick ONE value for each field from these exact options:

- **skinColor**: "9e5622", "763900", "ecad80", "f2d3b1"
- **hair**: one of: "long01", "long02", "long03", "long04", "long05", "long06", "long07", "long08", "long09", "long10", "long11", "long12", "long13", "long14", "long15", "long16", "long17", "long18", "long19", "long20", "long21", "long22", "long23", "long24", "long25", "long26", "short01", "short02", "short03", "short04", "short05", "short06", "short07", "short08", "short09", "short10", "short11", "short12", "short13", "short14", "short15", "short16", "short17", "short18", "short19"
- **hairColor**: one of: "0e0e0e", "3eac2c", "6a4e35", "85c2c6", "796a45", "562306", "592454", "ab2a18", "ac6511", "afafaf", "b7a259", "cb6820", "dba3be", "e5d7a3"
- **eyes**: one of: "variant01", "variant02", "variant03", "variant04", "variant05", "variant06", "variant07", "variant08", "variant09", "variant10", "variant11", "variant12", "variant13", "variant14", "variant15", "variant16", "variant17", "variant18", "variant19", "variant20", "variant21", "variant22", "variant23", "variant24", "variant25", "variant26"
- **eyebrows**: one of: "variant01", "variant02", "variant03", "variant04", "variant05", "variant06", "variant07", "variant08", "variant09", "variant10", "variant11", "variant12", "variant13", "variant14", "variant15"
- **mouth**: one of: "variant01", "variant02", "variant03", "variant04", "variant05", "variant06", "variant07", "variant08", "variant09", "variant10", "variant11", "variant12", "variant13", "variant14", "variant15", "variant16", "variant17", "variant18", "variant19", "variant20", "variant21", "variant22", "variant23", "variant24", "variant25", "variant26", "variant27", "variant28", "variant29", "variant30"
- **glasses**: one of: "variant01", "variant02", "variant03", "variant04", "variant05", or "none"
- **features**: one of: "birthmark", "blush", "freckles", "mustache", or "none"

## Rules
- Match skin color to the member's implied ethnicity/background
- Match hair style and color to gender and age cues in the biography
- Use glasses for analytical/academic types when it fits
- Use "mustache" feature for older male members when appropriate
- Make each member visually distinct from the others

## Output Format

Return ONLY a valid JSON array with no markdown formatting, no code fences, no explanation. Each element:

[
  {
    "name": "Member Full Name",
    "skinColor": "...",
    "hair": "...",
    "hairColor": "...",
    "eyes": "...",
    "eyebrows": "...",
    "mouth": "...",
    "glasses": "...",
    "features": "..."
  }
]

Members:
${members}`;
}

// ─── Evaluation ──────────────────────────────────────────────────────

export function opportunityAnalysisPrompt(
  evaluation: Pick<Evaluation, "title" | "opportunityType" | "companyName" | "thesis" | "terms" | "details">,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are an investment analyst preparing a structured analysis of an investment opportunity for an IC review.

Extract and organize:
1. **Key Facts** — What we know for certain from the provided information
2. **Investment Thesis** — The core argument for this investment
3. **Terms Summary** — Key deal terms and their implications
4. **Information Gaps** — What critical information is missing
5. **Profile Alignment** — How this opportunity aligns (or conflicts) with the investor's stated philosophy, risk tolerance, and asset class preferences
6. **Preliminary Risk Flags** — Obvious risks based on available information
7. **Key Questions** — What the committee should focus on

Be thorough but concise. Flag uncertainty explicitly — do not fill gaps with assumptions.

${QUALITY_RULES}`,
    user: `Analyze this investment opportunity:

${formatEvaluation(evaluation)}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function dynamicSpecialistPrompt(
  analysis: string,
  existingMembers: CommitteeMember[],
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are an IC staffing advisor. Based on an opportunity analysis and the existing committee, determine if additional specialist expertise is needed for this specific evaluation.

If the opportunity requires deep domain expertise not covered by the existing committee (e.g., biotech for a pharma deal, maritime law for a shipping investment), generate 1-2 dynamic specialists.

If the existing committee already covers the needed expertise, output exactly:
NO_ADDITIONAL_SPECIALISTS_NEEDED

If specialists are needed, output them in this format:

## Member N: Full Name | ROLE

### Background
2-3 sentences of relevant domain expertise.

### Investment Philosophy
Their approach to investments in this specific domain.

### Specializations
3-5 areas, comma-separated.

### Decision Style
How they evaluate opportunities in this domain.

### Risk Personality
Their risk assessment approach for this domain.

### Notable Positions
2-3 bullet points.

### Blind Spots
1-2 items.

${QUALITY_RULES}`,
    user: `Should we add specialists for this opportunity?

Opportunity Analysis:
${analysis}

Existing Committee Members:
${formatMembers(existingMembers)}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function individualAssessmentsPrompt(
  members: CommitteeMember[],
  analysis: string,
  profile: InvestorProfile,
  history: string
): { system: string; user: string } {
  const historySection = history
    ? `\n\n## Committee History\nPrevious evaluations for context on how the committee has evolved:\n${history}`
    : "";

  return {
    system: `You are simulating an investment committee where each member gives their initial independent assessment of an opportunity before group discussion.

Each member must assess the opportunity through their specific lens — risk personality, investment philosophy, and specializations. Assessments should be genuinely independent and reflect each member's character.

For each member, output:

## [MemberName]

### Position
Their initial stance on the opportunity (2-3 sentences).

### Key Points
Bulleted list of 3-5 points that support or inform their position.

### Concerns
Bulleted list of 2-4 specific concerns from their perspective.

Members must stay in character. A risk hawk should see different things than a growth optimist. The contrarian should challenge the obvious narrative.

${QUALITY_RULES}`,
    user: `Each committee member should give their initial assessment:

Opportunity Analysis:
${analysis}

Committee Members:
${formatMembers(members)}

Investor Profile:
${formatProfile(profile)}${historySection}`,
  };
}

export function evaluationDebatePrompt(
  members: CommitteeMember[],
  assessments: string,
  analysis: string,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are orchestrating a structured IC debate with 2-3 rounds. Committee members challenge each other's initial assessments, surface disagreements, and pressure-test the investment thesis.

## Structure

### Round 1: Cross-Examination
Members directly challenge the weakest points of other members' assessments. Focus on substantive disagreements, not restating positions.

### Round 2: Deep Dive
Focus on the 2-3 most contentious issues identified in Round 1. Members with relevant expertise take the lead. Others ask pointed questions.

### Round 3: Convergence Attempt (if needed)
Where can the committee align? What remains irreconcilable? What additional information would change minds?

## Format

Use clear round headers and **Speaker:** attribution:

## Round 1: Cross-Examination

**MemberName:** Their statement here.

**AnotherMember:** Their response.

## Rules
- Members ENGAGE with each other, not just restate positions
- At least one member should visibly update their view during the debate
- The debate should surface risks or opportunities that no single assessment captured
- Keep exchanges sharp — 2-4 sentences per turn, not paragraphs

${QUALITY_RULES}`,
    user: `Run the IC debate:

Individual Assessments:
${assessments}

Opportunity Analysis:
${analysis}

Committee Members:
${formatMembers(members)}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function investmentMemoPrompt(
  debate: string,
  assessments: string,
  analysis: string,
  profile: InvestorProfile,
  evaluationTitle?: string
): { system: string; user: string } {
  return {
    system: `You are a senior investment analyst synthesizing an IC debate into a formal investment memo.

## Required Sections

# ${evaluationTitle || "[Opportunity Title]"} — Investment Memo

## Executive Summary
3-5 bullet points capturing the key conclusion and recommendation.

## Opportunity Overview
What the opportunity is, key facts, and context.

## Investment Thesis
The core argument for the investment, as refined by the committee debate.

## Key Risks
Ranked by severity. For each: risk description, likelihood, potential impact, and proposed mitigant.

## Financial Analysis
Key financial metrics discussed, valuation considerations, return expectations. Note: base this on what was discussed, do not fabricate numbers.

## Strategic Fit
How this aligns with the investor's stated philosophy, portfolio, and goals.

## Recommendation
The committee's synthesized view — not a simple vote count but a reasoned conclusion reflecting the weight of argument.

${QUALITY_RULES}`,
    user: `Synthesize this IC debate into an investment memo:

Debate Transcript:
${debate}

Individual Assessments:
${assessments}

Opportunity Analysis:
${analysis}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function riskAssessmentPrompt(
  debate: string,
  analysis: string,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are a risk assessment specialist producing a structured risk report for an investment opportunity based on the IC debate.

## Required Output

## Overall Risk Rating
State one of: low, moderate, high, very-high
Provide a 1-2 sentence justification.

## Risk Categories

For each category below, provide:
- **Level**: low / moderate / high / very-high
- **Analysis**: 2-3 sentences on the specific risks identified

Categories:
1. **Market Risk** — macro, sector, timing
2. **Execution Risk** — management, operational, implementation
3. **Financial Risk** — leverage, liquidity, valuation
4. **Regulatory Risk** — compliance, policy changes, legal
5. **Concentration Risk** — portfolio concentration, single-name exposure
6. **Liquidity Risk** — exit options, time horizon, lock-up

## Mitigants
Bulleted list of specific actions or conditions that reduce the identified risks.

Ground your analysis primarily in what was discussed during the debate, but you may identify additional risks that are standard for this type of opportunity even if not explicitly raised.

${QUALITY_RULES}`,
    user: `Produce the risk assessment:

Debate Transcript:
${debate}

Opportunity Analysis:
${analysis}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function recommendationPrompt(
  memo: string,
  risk: string,
  debate: string,
  members: CommitteeMember[],
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are facilitating the final IC vote. Each committee member casts their vote based on the full debate, memo, and risk assessment.

## Format

For each member:

## [MemberName]
Vote: [strong_buy / buy / hold / pass / strong_pass]
Conviction: [high / medium / low]
Rationale: 2-3 sentences explaining their vote, referencing specific points from the debate.

After all individual votes, provide:

## Aggregate Recommendation
- **Verdict**: The committee's overall recommendation based on the vote pattern and weight of argument (not just majority)
- **Dissents**: Any notable dissents and their reasoning
- **Conditions**: Specific conditions or milestones that would change the recommendation

Each member must vote consistently with their established philosophy and the positions they took during the debate. A risk hawk who raised serious concerns should not suddenly vote strong_buy without explanation.

${QUALITY_RULES}`,
    user: `Each member casts their final vote:

Investment Memo:
${memo}

Risk Assessment:
${risk}

Debate Transcript:
${debate}

Committee Members:
${formatMembers(members)}

Investor Profile:
${formatProfile(profile)}`,
  };
}

// ─── Ideas ───────────────────────────────────────────────────────────

export function portfolioGapAnalysisPrompt(
  profile: InvestorProfile,
  recentEvals: string
): { system: string; user: string } {
  return {
    system: `You are a portfolio strategist analyzing gaps between an investor's current portfolio and their stated goals.

Produce a structured analysis:

## Portfolio Summary
Current allocation and stated objectives.

## Gap Analysis
Where the portfolio diverges from stated goals — under/over-allocations, missing asset classes, geographic gaps, time horizon mismatches.

## Opportunity Areas
3-5 areas where new investments could close identified gaps, ranked by impact.

## Constraints
Factors that limit available options (liquidity needs, regulatory, concentration limits).

${QUALITY_RULES}`,
    user: `Analyze portfolio gaps:

Investor Profile:
${formatProfile(profile)}

Recent Evaluations:
${recentEvals || "No recent evaluations."}`,
  };
}

export function ideaDebatePrompt(
  members: CommitteeMember[],
  gapAnalysis: string,
  focusArea: string,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are orchestrating an IC brainstorming session where committee members discuss investment opportunities to address portfolio gaps.

The committee should:
1. React to the gap analysis — do they agree with the identified gaps?
2. Propose specific investment themes or opportunities within the focus area
3. Challenge each other's proposals
4. Build on promising ideas collaboratively

Format as a natural discussion with **Speaker:** attribution. 2-3 rounds of exchange. Each member should contribute at least once based on their specialization.

${QUALITY_RULES}`,
    user: `Run the idea generation debate:

Focus Area: ${focusArea || "General portfolio optimization"}

Gap Analysis:
${gapAnalysis}

Committee Members:
${formatMembers(members)}

Investor Profile:
${formatProfile(profile)}`,
  };
}

export function ideaSynthesisPrompt(
  debate: string,
  gapAnalysis: string,
  profile: InvestorProfile
): { system: string; user: string } {
  return {
    system: `You are synthesizing an IC brainstorming session into 3-5 structured investment ideas.

For each idea, output:

## Idea N: Title

### Thesis
2-3 sentences on the core investment argument.

### Asset Class
The primary asset class.

### Time Horizon
Expected holding period.

### Risk Level
low / moderate / high / very-high

### Expected Return
Qualitative return expectation (e.g., "mid-single-digit yield + capital appreciation").

### Rationale
Why this idea addresses the identified portfolio gaps and aligns with the investor's philosophy.

### Key Risks
Bulleted list of 2-4 risks.

### Implementation Steps
Numbered list of 3-5 concrete next steps.

${QUALITY_RULES}`,
    user: `Synthesize the brainstorming session into structured ideas:

Debate Transcript:
${debate}

Gap Analysis:
${gapAnalysis}

Investor Profile:
${formatProfile(profile)}`,
  };
}

