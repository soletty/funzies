export function domainAnalysisPrompt(topic: string): string {
  return `You are an expert domain analyst preparing the groundwork for a multi-perspective intellectual assembly on a given topic.

Analyze the following topic and produce a structured domain analysis in markdown.

## Your task

1. **Domain Mapping**: Identify the core domain(s) this topic touches (e.g., economics, ethics, technology, governance, culture). List 3-5 relevant domains.

2. **Fundamental Tensions**: Map 3-5 irreducible tensions within this topic. These are opposing forces or trade-offs that cannot be fully resolved (e.g., "individual freedom vs. collective safety"). For each tension, briefly explain why it is irreducible.

3. **Key Stakeholders**: Identify 5-8 distinct stakeholder perspectives that would have meaningfully different views on this topic. Think across disciplines, ideologies, and lived experiences.

4. **Output Type Determination**: Based on the topic, recommend the most appropriate deliverable format:
   - **Policy Brief** — for governance/regulation topics
   - **Strategic Analysis** — for business/technology strategy
   - **Ethical Framework** — for moral/philosophical questions
   - **Research Synthesis** — for scientific/empirical questions
   - **Design Principles** — for creative/design challenges
   - **Action Plan** — for practical "how to" questions

5. **Scope Boundaries**: Define what is in scope and out of scope for a productive discussion. Identify 2-3 aspects that might seem related but should be excluded to maintain focus.

Format your output as clean markdown with ## headings for each section.

Topic: ${topic}`;
}

export function characterGenerationPrompt(
  topic: string,
  domainAnalysis: string
): string {
  return `You are a character architect creating a diverse intellectual assembly of 6 domain experts plus a moderator (Socrate) to debate a topic.

## Rules for Character Generation

1. **Diversity of Perspective**: Characters must span the ideological spectrum on this topic. Include at minimum:
   - One character who would be considered "establishment" or mainstream
   - One character who challenges conventional wisdom from the left/progressive side
   - One character who challenges from the right/conservative or traditionalist side
   - One character with deep practitioner/field experience (not just theory)
   - One character representing an underrepresented or non-Western perspective
   - One character who bridges disciplines or takes a heterodox position

2. **Biographical Depth**: Each character needs a believable biography that explains HOW they came to their views — not just WHAT they believe. Include formative experiences, career trajectory, and key turning points.

3. **No Strawmen**: Every character must be the strongest possible version of their perspective. Even if a position seems wrong to most people, the character holding it must articulate it with sophistication and evidence.

4. **Tag System**: Each character gets a single-word TAG in caps that captures their core archetype (e.g., PRAGMATIST, RADICAL, GUARDIAN, BRIDGE, DISSENTER, EMPIRICIST).

## Required Format (follow exactly)

For each character, output:

## Character N: Full Name [TAG: ROLE]

### Biography
2-3 paragraphs of rich biographical detail explaining their background, formative experiences, and career path.

### Ideological Framework
Name and describe their core analytical framework in 1-2 paragraphs. Bold the framework name like **"Framework Name"**.

### Specific Positions on ${topic}
Numbered list of 3-5 concrete positions they hold on the specific topic.

### Blind Spot
1 paragraph describing what this character systematically fails to see or underweights.

### Intellectual Heroes
Bullet list of 3-5 real thinkers/practitioners who influence this character.

### Rhetorical Tendencies
1 paragraph on how this character argues — their style, preferred evidence types, and persuasion approach.

### Key Relationships
Bullet list describing their likely dynamic with 2-3 other characters in the assembly (use "Character N" references).

## Character 7: Socrate [TAG: MODERATOR]

Socrate is the assembly moderator. Give Socrate a brief biography as a veteran facilitator of intellectual discourse. Socrate's role is to:
- Ask probing questions that expose assumptions
- Force characters to engage with their blind spots
- Identify when characters are talking past each other
- Synthesize points of agreement and crystallize disagreements
- Challenge the strongest arguments, not just the weakest ones

## Context

Topic: ${topic}

Domain Analysis:
${domainAnalysis}`;
}

export function referenceLibraryPrompt(
  topic: string,
  characters: string
): string {
  return `You are a research librarian building a 2-layer reference library for an intellectual assembly on a topic. The library must provide the evidential foundation for a rigorous debate.

## Layer 1: Intellectual Traditions

For each of the 6 characters (not Socrate), identify their intellectual tradition and list 4-6 key references that inform their worldview. These should be real works by real authors that a person with this character's perspective would draw upon.

Format each tradition as:

### Character Name — Tradition Name (TAG)

- **Author Name** — *Work Title* (Year). One-sentence description of relevance.
- **Author Name** — *Work Title* (Year). One-sentence description of relevance.

## Layer 2: Empirical Evidence Base

Provide 3-4 categories of empirical evidence relevant to the topic. For each category, list 4-6 real data sources, studies, or reports.

Format as:

### Category Name

- **Author/Organization** — *Study/Report Title* (Year). Key finding or data point.

## Cross-Reading Assignments

For each character, assign one work from a DIFFERENT character's tradition that would challenge their assumptions.

Format as:

### Cross-Reading Assignments

- **Character Name** must engage: *Work Title* by Author — why this challenges their framework.

## Important Rules
- Use REAL authors, works, and data where possible
- When exact works are uncertain, use representative real authors from the relevant tradition
- Every reference must include a year (or approximate decade)
- Layer 2 should prioritize recent empirical evidence (last 10-20 years)

Topic: ${topic}

Characters:
${characters}`;
}

export function debatePrompt(
  topic: string,
  characters: string,
  referenceLibrary: string
): string {
  return `You are orchestrating a Grande Table debate — a structured intellectual assembly where 6 expert characters and a moderator (Socrate) engage in rigorous, multi-round debate on a topic.

## Debate Structure

The debate consists of 4 rounds. Each round has a specific structure:

### Round 1: Opening Positions
Each character states their core position on the topic in 2-3 paragraphs. Socrate introduces the topic and sets ground rules. Characters should reference their intellectual frameworks and key evidence.

### Round 2: Direct Confrontations (Duels)
Pair characters with opposing views for direct exchanges. Create 3 duels where characters directly challenge each other's positions. Each duel should have 2-3 exchanges per character. Socrate intervenes to sharpen disagreements and prevent talking past each other.

### Round 3: Unexpected Alliances & Deep Dives
Characters find surprising common ground across ideological lines. Characters who seemed opposed discover shared concerns. Socrate pushes characters to explore WHY they agree — is it genuine convergence or superficial overlap? Include at least one moment where a character updates their position based on evidence presented.

### Round 4: Final Positions & Synthesis Attempt
Each character gives a final statement (1-2 paragraphs) reflecting what they've learned. They must explicitly state: what they still believe, what they've updated on, and what remains unresolved. Socrate delivers a closing synthesis identifying key convergences, irreducible disagreements, and emergent ideas.

## Format Rules

Use ## headings for each round:

## Round 1: Opening Positions

Use bold for speaker names followed by colon:

**Character Name:** Their speech text here spanning one or more paragraphs.

**Socrate:** Moderator intervention text.

For assembly reactions sections, use:

**Assembly Reactions:**

**Character Name:** Brief reaction.

For Socrate interventions mid-round:

**[SOCRATE intervenes]**

**Socrate:** Intervention text.

## Quality Rules

1. Characters must speak IN CHARACTER — using their rhetorical style, referencing their intellectual heroes, drawing on evidence from the reference library
2. Characters must ENGAGE with each other's arguments, not just restate their own
3. Include specific references to works from the reference library
4. Show genuine intellectual tension — not polite disagreement but substantive conflict
5. At least 2 characters should visibly update their positions during the debate
6. Socrate should ask at least 3 genuinely difficult questions that make characters uncomfortable
7. The debate should surface at least 1 idea that no single character held at the start

Topic: ${topic}

Characters:
${characters}

Reference Library:
${referenceLibrary}`;
}

export function synthesisPrompt(
  topic: string,
  debateTranscript: string
): string {
  return `You are an expert synthesizer analyzing the transcript of a multi-perspective intellectual debate (Grande Table) on a topic. Your job is to produce a rigorous synthesis that captures the full intellectual landscape revealed by the debate.

## Required Sections

### 1. Title
A descriptive title for the synthesis (use # heading).

## Convergence Points

List points where multiple characters converged. For each:
- **Bold the claim**
- State which characters agreed
- Rate confidence: high / medium-high / medium / low
- Provide the evidence basis

Format:
- **Claim statement** — Characters A, B, and C converged on this. Confidence: **high**. Evidence: description of supporting evidence.

## Irreducible Divergences

List fundamental disagreements that the debate could not resolve. For each:
- **Bold the issue**
- Explain the opposing positions and why reconciliation failed

Format:
- **Issue statement** — Character A argues X because of Y, while Character B maintains Z because of W. This divergence is irreducible because...

## Emergent Ideas

List ideas that emerged FROM the debate interaction — insights no single character held at the start but that arose from the exchange.

Format:
- **Idea statement** — Brief description of how this emerged from the interaction between characters.

## Knowledge Gaps

List questions the debate revealed that current evidence cannot answer.

Format:
- **Gap statement** — Why this matters and what research would be needed.

## Recommendations

List 4-6 concrete, actionable recommendations that follow from the synthesis. These should reflect the full debate, not just one character's view.

Format numbered list:
1. **Recommendation title** — Description incorporating multiple perspectives.

## Unexpected Alliances

Note any surprising agreements between characters who were expected to disagree.

Format:
- **Alliance description** — Characters and what they unexpectedly agreed on.

Topic: ${topic}

Debate Transcript:
${debateTranscript}`;
}

export function deliverablePrompt(
  topic: string,
  synthesis: string
): string {
  return `You are producing the final deliverable document based on the synthesis of a multi-perspective intellectual assembly (Grande Table debate) on a topic.

## Instructions

Based on the synthesis, produce a polished, actionable deliverable document. The deliverable should:

1. **Stand alone** — A reader who hasn't seen the debate should understand it fully
2. **Be evidence-based** — Reference specific findings from the assembly
3. **Acknowledge complexity** — Don't flatten the nuance revealed by the debate
4. **Be actionable** — Include concrete recommendations or frameworks
5. **Credit multiple perspectives** — Show how different viewpoints informed the conclusions

## Format

Use clean markdown with:
- A clear # title
- ## section headings
- Numbered or bulleted lists where appropriate
- Bold for key terms and recommendations
- No more than 3000 words

The deliverable should read as a professional document — a policy brief, strategic analysis, ethical framework, research synthesis, design principles document, or action plan — depending on what the domain analysis determined was most appropriate.

Include an "Executive Summary" section at the top (3-5 bullet points) and a "Key Recommendations" section near the end.

Topic: ${topic}

Synthesis:
${synthesis}`;
}

export function deliverableEvolutionPrompt(
  topic: string,
  previousDeliverable: string,
  insightSummaries: string[],
  synthesis: string
): string {
  return `You are evolving an existing deliverable document based on new insights that emerged from follow-up conversations with the intellectual assembly.

## CRITICAL RULE: This is EVOLUTION, not replacement.

You must preserve the structure, voice, and content of the previous deliverable. Only modify sections where the new insights genuinely change the conclusions. Most of the deliverable should remain intact.

## Previous Deliverable
${previousDeliverable}

## Original Synthesis
${synthesis}

## New Insights from Follow-Up Conversations
${insightSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Instructions

1. Read the previous deliverable carefully
2. For each new insight, determine which section(s) it affects
3. Integrate the insight naturally — update conclusions, add caveats, strengthen or weaken arguments as warranted
4. If an insight reveals a position shift, update the relevant recommendation or analysis
5. If an insight exposes a gap, add a brief acknowledgment in the appropriate section
6. Preserve all content that is NOT affected by the new insights
7. End with a "## What Changed in This Version" section listing each modification and which insight prompted it

## Format
- Same format as the original deliverable (markdown, ## headings, etc.)
- No more than 3000 words
- The "What Changed" section should be concise — one bullet per change

Topic: ${topic}`;
}

export function avatarMappingPrompt(characters: string): string {
  return `You are a visual character designer. Given a list of fictional character biographies, map each character to DiceBear Adventurer avatar options that visually match their described profile — age, gender, ethnicity, personality, and appearance implied by their biography.

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
- Match skin color to the character's implied ethnicity/background
- Match hair style and color to gender and age cues in the biography
- Use glasses for academic/intellectual characters when it fits
- Use "mustache" feature for older male characters when appropriate
- Make each character visually distinct from the others

## Output Format

Return ONLY a valid JSON array with no markdown formatting, no code fences, no explanation. Each element:

[
  {
    "name": "Character Full Name",
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

Characters:
${characters}`;
}

export function verificationPrompt(
  topic: string,
  deliverable: string,
  synthesis: string
): string {
  return `You are running 4 verification checklists on the output of a multi-perspective intellectual assembly (Grande Table debate). Your job is to identify weaknesses, errors, and areas for improvement.

## Produce 4 Verification Reports

For each verification type, use a ## heading and provide a detailed assessment.

## Fact-Check Verification

Review all factual claims, statistics, and references in the deliverable and synthesis:
- Flag any claims that appear unsupported or potentially inaccurate
- Note any statistics used without proper sourcing
- Identify any mischaracterizations of referenced works or thinkers
- Rate overall factual reliability: HIGH / MEDIUM / LOW

## Quality Verification

Assess the intellectual rigor of the assembly output:
- Were all major perspectives on the topic represented?
- Did the synthesis accurately reflect the debate dynamics?
- Are the recommendations well-supported by the discussion?
- Were any important viewpoints systematically excluded?
- Rate overall quality: HIGH / MEDIUM / LOW

## Clarity Verification

Assess the communication quality:
- Is the deliverable accessible to its target audience?
- Are technical terms defined when first used?
- Is the structure logical and easy to follow?
- Are there any sections that are unclear or overly dense?
- Rate overall clarity: HIGH / MEDIUM / LOW

## Reality Verification

Assess the practical applicability:
- Are the recommendations implementable in the real world?
- Do the recommendations account for political, economic, and social constraints?
- Are there any recommendations that sound good in theory but would fail in practice?
- Are resource requirements and timelines realistic?
- Rate overall practicality: HIGH / MEDIUM / LOW

Topic: ${topic}

Deliverable:
${deliverable}

Synthesis:
${synthesis}`;
}
