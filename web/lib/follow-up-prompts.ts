export interface TopicFiles {
  charactersContent: string;
  synthesisContent: string;
  referenceLibraryContent: string;
  iterationSyntheses: string;
}

export interface FileReference {
  name: string;
  type: string;
  content: string;
}

export interface FollowUpRequest {
  question: string;
  characters: string[];
  context: { page: string; section?: string };
  mode: "ask-assembly" | "ask-character" | "ask-library" | "debate";
  challenge?: boolean;
  highlightedText?: string;
  files?: FileReference[];
}

function buildFileReferenceBlock(files?: FileReference[]): string {
  if (!files || files.length === 0) return "";
  const blocks = files.map((f) => {
    const truncated = f.content.length > 10000
      ? f.content.slice(0, 10000) + "\n\n[... truncated ...]"
      : f.content;
    return `--- ${f.name} (${f.type}) ---\n${truncated}`;
  });
  return `\nUSER-ATTACHED FILES:\n${blocks.join("\n\n")}\n`;
}

export function buildPrompt(
  request: FollowUpRequest,
  files: TopicFiles
): string | null {
  if (!files.charactersContent && request.mode !== "ask-library") return null;

  if (request.mode === "ask-library") {
    return buildReferenceLibraryPrompt(request, files);
  }

  if (request.mode === "debate") {
    return buildStructuredDebatePrompt(request, files);
  }

  return buildDebatePrompt(request, files);
}

export function buildDebatePrompt(
  request: FollowUpRequest,
  files: TopicFiles
): string {
  const characterFilter = request.characters.length > 0
    ? `Responding characters: ${request.characters.join(", ")}.`
    : "Choose the 2-3 most relevant characters based on the question.";

  const contextInfo = request.context.section
    ? `The user is reading the "${request.context.section}" section of the ${request.context.page} page.`
    : `The user is on the ${request.context.page} page.`;

  const isCharacterPage = request.context.page.startsWith("character-");
  const modeInstructions = getModeInstructions(request.mode, isCharacterPage);
  const challengeInstructions = request.challenge
    ? getChallengeMode()
    : getChallengeInstructions(request.mode, isCharacterPage);

  let contextBlock = "";
  if (files.synthesisContent) {
    contextBlock += `\nCURRENT SYNTHESIS:\n${files.synthesisContent}\n`;
  }
  if (files.referenceLibraryContent) {
    contextBlock += `\nREFERENCE LIBRARY (characters should cite these sources where relevant):\n${files.referenceLibraryContent}\n`;
  }
  if (files.iterationSyntheses) {
    contextBlock += `\nITERATION SYNTHESES (prior debate rounds for context):\n${files.iterationSyntheses}\n`;
  }
  contextBlock += buildFileReferenceBlock(request.files);

  return `You are continuing an Intellectual Assembly session. Respond to the user's follow-up question in character as the assembly members.

CHARACTER PROFILES:
${files.charactersContent}
${contextBlock}
CONTEXT:
${contextInfo}

${request.highlightedText ? `HIGHLIGHTED TEXT FROM DELIVERABLE:\n> ${request.highlightedText}\n\nUSER'S QUESTION ABOUT THIS TEXT:` : "USER'S QUESTION:"}
${request.question}

${characterFilter}

${modeInstructions}

${challengeInstructions}

CRITICAL QUALITY RULES:
- Start each character's response with their full name in bold: **Full Name:** followed by their response.
- STAY ON THE QUESTION. If the user asks about economics, answer about economics. If they ask about a process, explain the process. Do not pivot to your theoretical framework unless it directly changes the practical answer. A character whose framework is thermodynamics, when asked about gate fees, should talk about gate fees — not entropy. The framework can inform your analysis, but the answer must be about what was asked.
- Each character's response should be >80% direct answer to the question, with real specifics: numbers, companies, mechanisms, trade-offs. If a character spends most of their response on their theoretical framework rather than the question, the response has failed.
- Characters should AGREE with each other when they genuinely agree. Do not manufacture disagreement.
- If a character's framework genuinely changes what you'd conclude — not just how you'd label it — then briefly explain how. If it just adds a different lens without changing the practical answer, skip it.
- No meta-commentary, no "from my framework" throat-clearing, no performative invocations of intellectual traditions.`;
}

export function buildStructuredDebatePrompt(
  request: FollowUpRequest,
  files: TopicFiles
): string {
  let contextBlock = "";
  if (files.synthesisContent) {
    contextBlock += `\nPRIOR SYNTHESIS (the assembly's existing conclusions — build on or challenge these):\n${files.synthesisContent}\n`;
  }
  if (files.referenceLibraryContent) {
    contextBlock += `\nREFERENCE LIBRARY (cite these sources where relevant):\n${files.referenceLibraryContent}\n`;
  }
  if (files.iterationSyntheses) {
    contextBlock += `\nPRIOR ITERATION SYNTHESES:\n${files.iterationSyntheses}\n`;
  }
  contextBlock += buildFileReferenceBlock(request.files);

  return `You are running a structured adversarial debate among the Intellectual Assembly members. The user has posed a question for the assembly to debate.

CHARACTER PROFILES:
${files.charactersContent}
${contextBlock}
DEBATE QUESTION:
${request.question}

DEBATE RULES:
1. Choose 3-5 characters whose frameworks are most relevant to this question. Not every character needs to speak — only those whose framework genuinely informs the question.
2. Each character opens with a concise position statement (2-3 paragraphs) arguing FROM their framework with real specifics: numbers, cases, mechanisms, trade-offs.
3. After opening positions, characters DIRECTLY CHALLENGE each other. Name the person you're responding to and explain specifically why they're wrong — not framework-vs-framework abstraction, but "this actually works differently because..."
4. Characters MAY agree and MUST concede specific points where the other side has merit. Do not manufacture disagreement. Real consensus is as valuable as real disagreement.
5. Include Socrate. Socrate asks 1-2 devastating questions that expose hidden assumptions or force characters to confront the weakest point of their position. Socrate NEVER states opinions — only asks genuine questions.
6. Framework restatement is not insight. A character who takes a practical question and "reframes" it through their theoretical lens without adding new information has failed. Each response must be >80% direct substance.
7. End with a brief synthesis: where the assembly converged, where they remain divided, and what emerged from the collision that no single perspective would have produced.

FORMAT:
Start each character's contribution with their full name in bold: **Full Name:** followed by their argument.
For Socrate's interventions, use: **Socrate:** followed by their question(s).
End with: **Synthesis:** followed by a brief summary of convergence, divergence, and emergent insights.`;
}

export function buildReferenceLibraryPrompt(
  request: FollowUpRequest,
  files: TopicFiles
): string {
  if (!files.referenceLibraryContent) {
    return buildDebatePrompt(request, files);
  }

  const modePrompt = getReferenceLibraryModePrompt();

  let contextBlock = "";
  if (files.charactersContent) {
    contextBlock += `\nASSEMBLY CHARACTER PROFILES (for understanding who cites what):\n${files.charactersContent}\n`;
  }
  if (files.synthesisContent) {
    contextBlock += `\nDEBATE SYNTHESIS (the assembly's conclusions):\n${files.synthesisContent}\n`;
  }
  contextBlock += buildFileReferenceBlock(request.files);

  return `${modePrompt}

REFERENCE LIBRARY:
${files.referenceLibraryContent}
${contextBlock}
${request.highlightedText ? `HIGHLIGHTED TEXT:\n> ${request.highlightedText}\n\nUSER'S QUESTION ABOUT THIS TEXT:` : "USER'S QUESTION:"}
${request.question}

TONE: Be scholarly but accessible. Assume the user is intelligent but may not have read the sources. Cite specific works by name and author. Do NOT adopt character voices — you are a guide, not a debater.`;
}

export function getModeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character") {
    return `MODE: SINGLE CHARACTER — IN-DEPTH RESPONSE

You are responding as the specified character only. This is a one-on-one exchange.

Structure your response:
1. Answer the question directly and substantively. Use your real domain expertise — specific knowledge, operational details, concrete examples. Your response should be >80% direct answer with real specifics: numbers, companies, mechanisms, trade-offs. Do not pivot to your theoretical framework unless it directly changes the practical answer. If the user asks about economics, talk about economics — not your framework's abstract lens on economics.
2. Only AFTER answering substantively: if your framework genuinely changes what you'd conclude — not just how you'd label it — then briefly explain how. If it just adds a different lens without changing the practical answer, skip this entirely.
3. If there's something the user is getting wrong or oversimplifying, push back with specifics. Don't just "challenge their framing" in the abstract — show them what they're missing with evidence.

Go deep on substance. The user wants to understand, not to be lectured at through a theoretical lens.`;
  }

  if (isCharacterPage) {
    return `MODE: ASK THE ASSEMBLY

The user is on a specific character's profile page and wants to hear from multiple perspectives. Include this character plus 1-2 others whose expertise is most relevant to THIS SPECIFIC QUESTION.

Choose 2-4 most relevant characters. If the question warrants structured debate, use opening positions → challenges → synthesis. Otherwise, a focused multi-perspective exchange.

Each character should:
1. Answer the question with substance and specifics — real examples, real numbers, real trade-offs from their area of expertise
2. Where they genuinely disagree with another character, explain why in concrete terms (not framework-vs-framework, but "this actually works differently because...")
3. Where they agree, say so and add what they can

Characters MAY agree. Do not force disagreement. Not every character needs to invoke their theoretical framework — only do so when it genuinely changes the answer.`;
  }

  return `MODE: ASK THE ASSEMBLY

Choose 2-4 most relevant characters based on the question. If the question warrants structured debate, use opening positions → challenges → synthesis. Otherwise, a focused multi-perspective exchange.

Each character should:
1. Answer the question with substance and specifics — real examples, real data, real operational details from their area of expertise. The user is an intelligent person who wants to understand how things actually work.
2. Where they genuinely disagree with another character, explain why in concrete terms — what would you actually do differently, and why?
3. Where they agree, say so briefly and build on it rather than manufacturing a fake disagreement.

Characters whose expertise is most relevant should give the longest, most detailed responses. Characters with less relevant expertise should be briefer. Not everyone needs to weigh in on everything. Characters MAY agree — real consensus is as valuable as real disagreement.`;
}

export function getChallengeMode(): string {
  return `CHALLENGE MODE: The user is pushing back on a position. This is adversarial — they disagree and want the character(s) to defend.

Rules:
- Acknowledge the specific objection the user is raising — do not talk past it
- Defend the position with evidence, not by restating the framework
- Concede specific points where the objection genuinely has merit
- Reference which other assembly characters would agree or disagree with the user's objection
- Identify what evidence would settle the dispute
- Do NOT be sycophantic. Push back firmly where the position is defensible. If the user is wrong, say so with specifics.`;
}

export function getChallengeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character") {
    return `PUSHBACK: If the user's question contains a factual error, a hidden assumption, or an oversimplification that matters, point it out with evidence. But only if it's real — don't invent problems with the question just to seem adversarial. If the question is good, say so and answer it.`;
  }

  return `PUSHBACK: If a character sees something wrong or oversimplified in the user's question, they should say so with specifics. But characters should not manufacture challenges — if the question is well-framed, engage with it directly.`;
}

export function buildInsightExtractionPrompt(
  synthesis: string,
  question: string,
  response: string
): string {
  return `You are an extremely strict evaluator. Your job is to determine whether a follow-up conversation produced genuinely NEW intellectual territory that was NOT already present in the original synthesis.

ORIGINAL SYNTHESIS:
${synthesis}

FOLLOW-UP QUESTION:
${question}

FOLLOW-UP RESPONSE:
${response}

EVALUATION RULES — READ CAREFULLY:

The bar for "new insight" is VERY HIGH. Most follow-up conversations do NOT produce new insights. They are clarifications, elaborations, or restatements of existing positions. That is fine and expected.

Something is NOT a new insight if it:
- Restates or elaborates on a position already in the synthesis
- Provides more detail on an existing convergence or divergence point
- Asks a clarifying question and gets an answer that's consistent with synthesis positions
- Explores an implication that's obvious from the synthesis
- Is a stylistic or rhetorical difference without substantive novelty

Something IS a new insight ONLY if it:
- "position_shift": A character explicitly abandons or significantly modifies a position they held in the synthesis. Not a nuance — an actual change.
- "new_argument": An entirely new argument or piece of evidence appears that was absent from the synthesis. Not a restatement with different words.
- "emergent_synthesis": Two or more characters find genuinely unexpected common ground that contradicts the synthesis's divergence map.
- "exposed_gap": The exchange reveals a critical blind spot or assumption in the synthesis that undermines one of its conclusions.
- "unexpected_agreement": Characters who the synthesis identified as opposed turn out to agree on something substantive.

If you are uncertain whether something qualifies, it does NOT qualify. Default to hasInsight: false.

Respond with ONLY a JSON object, no other text:
{"hasInsight": false, "summary": "", "type": "position_shift", "involvedCharacters": []}

Or if there genuinely is new territory:
{"hasInsight": true, "summary": "one sentence describing the specific new insight", "type": "position_shift|new_argument|emergent_synthesis|exposed_gap|unexpected_agreement", "involvedCharacters": ["Full Name 1", "Full Name 2"]}`;
}

export function getReferenceLibraryModePrompt(): string {
  return `You are a scholarly guide to this assembly's reference library. Auto-determine the best approach from the user's question:

- If they ask about a specific source: explain its core argument, historical context, lasting influence, how the assembly character interprets it, and the strongest criticism. Go deep.
- If they ask about connections: trace which sources agree, conflict, or build on each other. Map where different characters' traditions converge or diverge. Identify surprising connections and gaps.
- If they ask a general question: explain what the relevant sources argue, why they matter for this debate, which characters draw on them, and what they get right or wrong.

Be scholarly but accessible. Assume the user is intelligent but may not have read the sources. Cite specific works by name and author. Do NOT adopt character voices — you are a guide, not a debater.`;
}
