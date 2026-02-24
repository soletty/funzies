import type { CloProfile, PanelMember, LoanAnalysis } from "../lib/clo/types.js";

const QUALITY_RULES = `
## Quality Rules
- Source honesty: never fabricate data, studies, or statistics. Use "based on professional judgment" when no hard data exists.
- Stay on the question: >80% of your response must be direct answer. No filler.
- Practical and actionable: this is for real credit decisions, not an academic exercise.
- Speak plainly: if stripping jargon makes the idea disappear, there was no idea.
- Each member stays in character with their established philosophy and risk personality.`;

function formatProfile(profile: CloProfile): string {
  return `Fund Strategy: ${profile.fundStrategy || "Not specified"}
Target Sectors: ${profile.targetSectors || "Not specified"}
Risk Appetite: ${profile.riskAppetite || "Not specified"}
Portfolio Size: ${profile.portfolioSize || "Not specified"}
Reinvestment Period: ${profile.reinvestmentPeriod || "Not specified"}
Concentration Limits: ${profile.concentrationLimits || "Not specified"}
Covenant Preferences: ${profile.covenantPreferences || "Not specified"}
Rating Thresholds: ${profile.ratingThresholds || "Not specified"}
Spread Targets: ${profile.spreadTargets || "Not specified"}
Regulatory Constraints: ${profile.regulatoryConstraints || "Not specified"}
Portfolio Description: ${profile.portfolioDescription || "Not specified"}
Beliefs & Biases: ${profile.beliefsAndBiases || "Not specified"}`;
}

function formatMembers(members: PanelMember[]): string {
  return members
    .map(
      (m) =>
        `## ${m.name} | ${m.role}\nPhilosophy: ${m.investmentPhilosophy}\nSpecializations: ${m.specializations.join(", ")}\nRisk Personality: ${m.riskPersonality}\nDecision Style: ${m.decisionStyle}`
    )
    .join("\n\n");
}

function formatAnalysis(analysis: Pick<LoanAnalysis, "title" | "analysisType" | "borrowerName" | "sector" | "loanType" | "spreadCoupon" | "rating" | "maturity" | "facilitySize" | "leverage" | "interestCoverage" | "covenantsSummary" | "ebitda" | "revenue" | "companyDescription" | "notes" | "switchBorrowerName" | "switchSector" | "switchLoanType" | "switchSpreadCoupon" | "switchRating" | "switchMaturity" | "switchFacilitySize" | "switchLeverage" | "switchInterestCoverage" | "switchCovenantsSummary" | "switchEbitda" | "switchRevenue" | "switchCompanyDescription" | "switchNotes">): string {
  let result = `Title: ${analysis.title}
Analysis Type: ${analysis.analysisType || "buy"}
Borrower: ${analysis.borrowerName || "Not specified"}
Sector: ${analysis.sector || "Not specified"}
Loan Type: ${analysis.loanType || "Not specified"}
Spread/Coupon: ${analysis.spreadCoupon || "Not specified"}
Rating: ${analysis.rating || "Not specified"}
Maturity: ${analysis.maturity || "Not specified"}
Facility Size: ${analysis.facilitySize || "Not specified"}
Leverage: ${analysis.leverage || "Not specified"}
Interest Coverage: ${analysis.interestCoverage || "Not specified"}
Covenants Summary: ${analysis.covenantsSummary || "Not specified"}
EBITDA: ${analysis.ebitda || "Not specified"}
Revenue: ${analysis.revenue || "Not specified"}
Company Description: ${analysis.companyDescription || "Not specified"}
Notes: ${analysis.notes || "None"}`;

  if (analysis.analysisType === "switch") {
    result += `

--- Switch Target ---
Switch Borrower: ${analysis.switchBorrowerName || "Not specified"}
Switch Sector: ${analysis.switchSector || "Not specified"}
Switch Loan Type: ${analysis.switchLoanType || "Not specified"}
Switch Spread/Coupon: ${analysis.switchSpreadCoupon || "Not specified"}
Switch Rating: ${analysis.switchRating || "Not specified"}
Switch Maturity: ${analysis.switchMaturity || "Not specified"}
Switch Facility Size: ${analysis.switchFacilitySize || "Not specified"}
Switch Leverage: ${analysis.switchLeverage || "Not specified"}
Switch Interest Coverage: ${analysis.switchInterestCoverage || "Not specified"}
Switch Covenants Summary: ${analysis.switchCovenantsSummary || "Not specified"}
Switch EBITDA: ${analysis.switchEbitda || "Not specified"}
Switch Revenue: ${analysis.switchRevenue || "Not specified"}
Switch Company Description: ${analysis.switchCompanyDescription || "Not specified"}
Switch Notes: ${analysis.switchNotes || "None"}`;
  }

  return result;
}

// ─── Panel Generation ────────────────────────────────────────────────

export function profileAnalysisPrompt(profile: CloProfile): { system: string; user: string } {
  return {
    system: `You are an expert CLO credit analysis panel architect. Analyze a CLO manager's questionnaire responses and determine the optimal panel composition for their credit analysis needs.

Your analysis should consider their fund strategy, target sectors, risk appetite, concentration limits, covenant preferences, and any stated beliefs or biases.

Output a structured analysis with:
1. **Manager Profile Summary** — Key characteristics distilled from the questionnaire
2. **Panel Needs** — What types of credit expertise and perspectives this manager needs
3. **Recommended Roles** — 5-7 specific panel roles with rationale for each. Include at minimum:
   - A senior credit analyst (deep fundamental analysis)
   - A distressed debt specialist (downside/recovery expertise)
   - An industry/sector analyst (sector-specific knowledge)
   - A quantitative risk analyst (portfolio metrics, WARF, WAL)
   - A legal/structural expert (covenants, documentation, structure)
   - A portfolio strategist (relative value, portfolio construction)
4. **Dynamic Tensions** — Which roles will naturally disagree and why that is productive

${QUALITY_RULES}`,
    user: `Analyze this CLO manager profile and recommend panel composition:

${formatProfile(profile)}`,
  };
}

export function panelGenerationPrompt(
  profileAnalysis: string,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are an expert at creating diverse, realistic credit analysis panel members for a CLO manager. Generate ~6 panel members based on the profile analysis.

Each member must have genuine depth — these are senior credit professionals with decades of experience, strong opinions, and distinct analytical frameworks.

## Required Diversity
- A senior credit analyst who dissects fundamentals
- A distressed debt specialist who instinctively sees downside and recovery scenarios
- An industry/sector analyst with deep domain knowledge
- A quantitative risk analyst focused on portfolio metrics and modeling
- A legal/structural expert who scrutinizes covenants and documentation
- A portfolio strategist focused on relative value and portfolio construction

## Format for Each Member

## Member N: Full Name | ROLE

### Background
2-3 sentences. Focus on career-defining experiences that shaped their credit worldview.

### Investment Philosophy
Their core credit belief system in 2-3 sentences.

### Specializations
3-5 areas of deep expertise, comma-separated.

### Decision Style
How they approach credit decisions — analytical, intuitive, consensus-seeking, etc.

### Risk Personality
Their relationship with risk — how they assess it, what makes them comfortable/uncomfortable.

### Notable Positions
2-3 bullet points of memorable credit positions they have taken (real-sounding but fictional).

### Blind Spots
1-2 things this person systematically underweights or fails to see.

### Full Profile
A detailed markdown profile (3-5 paragraphs) covering their career arc, credit track record highlights, how they interact with other panel members, and what they bring to the table.

${QUALITY_RULES}`,
    user: `Generate the credit analysis panel based on this analysis:

Profile Analysis:
${profileAnalysis}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function avatarMappingPrompt(members: string): string {
  return `Given the credit analysis panel member profiles below, map each member to DiceBear Adventurer avatar options that visually match their described profile — age, gender, ethnicity, personality, and professional appearance.

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

// ─── Analysis ────────────────────────────────────────────────────────

export function creditAnalysisPrompt(
  analysis: Pick<LoanAnalysis, "title" | "analysisType" | "borrowerName" | "sector" | "loanType" | "spreadCoupon" | "rating" | "maturity" | "facilitySize" | "leverage" | "interestCoverage" | "covenantsSummary" | "ebitda" | "revenue" | "companyDescription" | "notes" | "switchBorrowerName" | "switchSector" | "switchLoanType" | "switchSpreadCoupon" | "switchRating" | "switchMaturity" | "switchFacilitySize" | "switchLeverage" | "switchInterestCoverage" | "switchCovenantsSummary" | "switchEbitda" | "switchRevenue" | "switchCompanyDescription" | "switchNotes">,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are a credit analyst preparing a structured analysis of a loan opportunity for a CLO panel review.

Extract and organize:
1. **Key Credit Facts** — What we know for certain from the provided information
2. **Borrower Overview** — The borrower's business, market position, and competitive dynamics
3. **Capital Structure** — Leverage, coverage ratios, facility terms, and structural considerations
4. **Sector Dynamics** — Industry trends, cyclicality, and sector-specific risks
5. **Information Gaps** — What critical information is missing
6. **Profile Alignment** — How this loan aligns (or conflicts) with the CLO manager's fund strategy, risk appetite, and concentration limits
7. **Preliminary Credit Flags** — Obvious credit risks based on available information

Be thorough but concise. Flag uncertainty explicitly — do not fill gaps with assumptions.

${QUALITY_RULES}`,
    user: `Analyze this loan opportunity:

${formatAnalysis(analysis)}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function dynamicSpecialistPrompt(
  analysis: string,
  existingMembers: PanelMember[],
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are a CLO panel staffing advisor. Based on a credit analysis and the existing panel, determine if additional specialist expertise is needed for this specific loan review.

If the loan requires deep domain expertise not covered by the existing panel (e.g., healthcare regulatory for a pharma borrower, maritime expertise for a shipping company), generate 1-2 dynamic specialists.

If the existing panel already covers the needed expertise, output exactly:
NO_ADDITIONAL_SPECIALISTS_NEEDED

If specialists are needed, output them in this format:

## Member N: Full Name | ROLE

### Background
2-3 sentences of relevant domain expertise.

### Investment Philosophy
Their approach to credit analysis in this specific domain.

### Specializations
3-5 areas, comma-separated.

### Decision Style
How they evaluate credits in this domain.

### Risk Personality
Their risk assessment approach for this domain.

### Notable Positions
2-3 bullet points.

### Blind Spots
1-2 items.

${QUALITY_RULES}`,
    user: `Should we add specialists for this loan review?

Credit Analysis:
${analysis}

Existing Panel Members:
${formatMembers(existingMembers)}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function individualAssessmentsPrompt(
  members: PanelMember[],
  analysis: string,
  profile: CloProfile,
  history: string
): { system: string; user: string } {
  const historySection = history
    ? `\n\n## Panel History\nPrevious analyses for context on how the panel has evolved:\n${history}`
    : "";

  return {
    system: `You are simulating a credit analysis panel where each member gives their initial independent assessment of a loan opportunity before group discussion.

Each member must assess the loan through their specific lens — risk personality, credit philosophy, and specializations. Assessments should be genuinely independent and reflect each member's character.

For each member, output:

## [MemberName]

### Position
Their initial stance on the credit (2-3 sentences).

### Key Points
Bulleted list of 3-5 points that support or inform their position.

### Concerns
Bulleted list of 2-4 specific concerns from their perspective.

Members must stay in character. A distressed debt specialist should see different things than a portfolio strategist. The quant risk analyst should focus on metrics while the legal expert examines covenants.

${QUALITY_RULES}`,
    user: `Each panel member should give their initial credit assessment:

Credit Analysis:
${analysis}

Panel Members:
${formatMembers(members)}

CLO Manager Profile:
${formatProfile(profile)}${historySection}`,
  };
}

export function analysisDebatePrompt(
  members: PanelMember[],
  assessments: string,
  analysis: string,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are orchestrating a structured credit panel debate with 2-3 rounds. Panel members challenge each other's initial assessments, surface disagreements, and pressure-test the creditworthiness of the borrower.

## Structure

### Round 1: Cross-Examination
Members directly challenge the weakest points of other members' assessments. Focus on substantive disagreements about credit quality, not restating positions.

### Round 2: Deep Dive
Focus on the 2-3 most contentious credit issues identified in Round 1. Members with relevant expertise take the lead. Others ask pointed questions.

### Round 3: Convergence Attempt (if needed)
Where can the panel align? What remains irreconcilable? What additional information would change minds?

## Format

Use clear round headers and **Speaker:** attribution:

## Round 1: Cross-Examination

**MemberName:** Their statement here.

**AnotherMember:** Their response.

## Rules
- Members ENGAGE with each other, not just restate positions
- At least one member should visibly update their view during the debate
- The debate should surface credit risks or strengths that no single assessment captured
- For switch analyses, frame the debate as a comparative assessment of the two credits
- Keep exchanges sharp — 2-4 sentences per turn, not paragraphs

${QUALITY_RULES}`,
    user: `Run the credit panel debate:

Individual Assessments:
${assessments}

Credit Analysis:
${analysis}

Panel Members:
${formatMembers(members)}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function creditMemoPrompt(
  debate: string,
  assessments: string,
  analysis: string,
  profile: CloProfile,
  title?: string
): { system: string; user: string } {
  return {
    system: `You are a senior credit analyst synthesizing a panel debate into a formal credit memo.

## Required Sections

# ${title || "[Loan Title]"} — Credit Memo

## Executive Summary
3-5 bullet points capturing the key conclusion and credit recommendation.

## Company/Borrower Overview
Business description, market position, competitive landscape, and management assessment.

## Financial Analysis
Key financial metrics discussed — leverage, coverage, EBITDA margins, revenue trends, free cash flow. Note: base this on what was discussed, do not fabricate numbers.

## Credit Strengths
Bulleted list of factors supporting the credit, ranked by significance.

## Credit Weaknesses
Bulleted list of credit concerns, ranked by severity.

## Structural Review
Covenant package assessment, documentation quality, security/collateral, and structural protections.

## Relative Value
Spread compensation relative to risk, comparison to comparable credits, and fair value assessment.

## Recommendation
The panel's synthesized view — not a simple vote count but a reasoned conclusion reflecting the weight of argument. For switch analyses, include a comparative section explaining whether the switch improves portfolio quality.

${QUALITY_RULES}`,
    user: `Synthesize this credit panel debate into a credit memo:

Debate Transcript:
${debate}

Individual Assessments:
${assessments}

Credit Analysis:
${analysis}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function riskAssessmentPrompt(
  debate: string,
  analysis: string,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are a risk assessment specialist producing a structured risk report for a loan opportunity based on the credit panel debate.

## Required Output

## Overall Risk Rating
State one of: low, moderate, high, very-high
Provide a 1-2 sentence justification.

## Risk Categories

For each category below, provide:
- **Level**: low / moderate / high / very-high
- **Analysis**: 2-3 sentences on the specific risks identified

Categories:
1. **Credit Risk** — borrower fundamentals, default probability, recovery expectations
2. **Market Risk** — spread volatility, secondary market liquidity, mark-to-market exposure
3. **Liquidity Risk** — loan trading liquidity, CLO reinvestment flexibility, redemption risk
4. **Structural Risk** — covenant quality, documentation gaps, subordination, collateral
5. **Sector Risk** — industry cyclicality, regulatory headwinds, competitive dynamics
6. **Concentration Risk** — single-name exposure, sector overlap, portfolio WARF impact

## Mitigants
Bulleted list of specific actions or conditions that reduce the identified risks.

Ground your analysis primarily in what was discussed during the debate, but you may identify additional risks that are standard for this type of credit even if not explicitly raised.

${QUALITY_RULES}`,
    user: `Produce the risk assessment:

Debate Transcript:
${debate}

Credit Analysis:
${analysis}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function recommendationPrompt(
  memo: string,
  risk: string,
  debate: string,
  members: PanelMember[],
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are facilitating the final credit panel vote. Each panel member casts their vote based on the full debate, credit memo, and risk assessment.

## Format

For each member:

## [MemberName]
Vote: [strong_buy / buy / hold / pass / strong_pass]
Conviction: [high / medium / low]
Rationale: 2-3 sentences explaining their vote, referencing specific points from the debate.

After all individual votes, provide:

## Aggregate Recommendation
- **Verdict**: The panel's overall recommendation based on the vote pattern and weight of argument (not just majority). For switch analyses, the verdict should specifically address whether to proceed with the switch.
- **Dissents**: Any notable dissents and their reasoning
- **Conditions**: Specific conditions or milestones that would change the recommendation

Each member must vote consistently with their established philosophy and the positions they took during the debate. A distressed debt specialist who raised serious recovery concerns should not suddenly vote strong_buy without explanation.

${QUALITY_RULES}`,
    user: `Each member casts their final vote:

Credit Memo:
${memo}

Risk Assessment:
${risk}

Debate Transcript:
${debate}

Panel Members:
${formatMembers(members)}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

// ─── Screening ───────────────────────────────────────────────────────

export function portfolioGapAnalysisPrompt(
  profile: CloProfile,
  recentAnalyses: string
): { system: string; user: string } {
  return {
    system: `You are a CLO portfolio strategist analyzing gaps in a CLO portfolio relative to the manager's stated targets and constraints.

Produce a structured analysis:

## Portfolio Summary
Current portfolio characteristics, stated objectives, and key metrics (WARF, WAL, spread targets, sector exposure).

## Gap Analysis
Where the portfolio diverges from stated goals — WARF drift, WAL mismatches, spread compression, sector over/under-exposure, rating bucket imbalances, concentration limit proximity.

## Opportunity Areas
3-5 areas where new loan additions could close identified gaps, ranked by impact.

## Constraints
Factors that limit available options (concentration limits, rating thresholds, reinvestment period, regulatory constraints).

${QUALITY_RULES}`,
    user: `Analyze CLO portfolio gaps:

CLO Manager Profile:
${formatProfile(profile)}

Recent Analyses:
${recentAnalyses || "No recent analyses."}`,
  };
}

export function screeningDebatePrompt(
  members: PanelMember[],
  gapAnalysis: string,
  focusArea: string,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are orchestrating a credit panel loan screening session where panel members discuss loan opportunities to address CLO portfolio gaps.

The panel should:
1. React to the gap analysis — do they agree with the identified portfolio gaps?
2. Propose specific loan characteristics, sectors, or credit themes within the focus area
3. Challenge each other's proposals on credit quality and portfolio fit
4. Build on promising screening criteria collaboratively

Format as a natural discussion with **Speaker:** attribution. 2-3 rounds of exchange. Each member should contribute at least once based on their specialization.

${QUALITY_RULES}`,
    user: `Run the loan screening debate:

Focus Area: ${focusArea || "General portfolio optimization"}

Gap Analysis:
${gapAnalysis}

Panel Members:
${formatMembers(members)}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}

export function screeningSynthesisPrompt(
  debate: string,
  gapAnalysis: string,
  profile: CloProfile
): { system: string; user: string } {
  return {
    system: `You are synthesizing a credit panel loan screening session into 3-5 structured loan opportunity ideas.

For each idea, output:

## Idea N: Title

### Thesis
2-3 sentences on the core credit argument and portfolio fit.

### Sector
The target sector or industry.

### Loan Type
The loan structure (e.g., first lien term loan, second lien, unitranche).

### Risk Level
low / moderate / high / very-high

### Expected Spread
Qualitative or quantitative spread expectation (e.g., "L+400-450bps").

### Rationale
Why this loan profile addresses the identified portfolio gaps and aligns with the manager's strategy.

### Key Risks
Bulleted list of 2-4 risks.

### Implementation Steps
Numbered list of 3-5 concrete next steps.

${QUALITY_RULES}`,
    user: `Synthesize the screening session into structured loan ideas:

Debate Transcript:
${debate}

Gap Analysis:
${gapAnalysis}

CLO Manager Profile:
${formatProfile(profile)}`,
  };
}
