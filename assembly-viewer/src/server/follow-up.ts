import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { rebuildTopicPages } from "./rebuild.js";
import { buildFileReferenceBlock } from "./upload.js";

export interface FollowUpRequest {
  question: string;
  topicSlug: string;
  characters: string[];
  context: {
    page: string;
    section?: string;
  };
  mode: "ask-assembly" | "ask-character" | "ask-library" | "debate";
  challenge?: boolean;
  highlightedText?: string;
  files?: string[];
}

export function handleFollowUp(
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string,
  buildDir: string
) {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let request: FollowUpRequest;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!request.question || !request.topicSlug) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing question or topicSlug" }));
      return;
    }

    try {
      streamFollowUp(request, req, res, workspacePath, buildDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Follow-up error:", msg);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`);
        res.end();
      }
    }
  });
}

function streamFollowUp(
  request: FollowUpRequest,
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string,
  buildDir: string
) {
  const topicDir = path.join(workspacePath, request.topicSlug);
  const basePrompt = buildPrompt(request, topicDir);

  if (!basePrompt) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Topic workspace files not found" }));
    return;
  }

  const fileBlock = buildFileReferenceBlock(request.files ?? [], workspacePath);
  const prompt = basePrompt + fileBlock;

  // Write prompt to a temp file to avoid E2BIG when the assembled context is large
  const promptFile = writePromptFile(prompt);

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const args = [
    "-p", `Read the file at ${promptFile} for your complete instructions and follow them exactly.`,
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", "3",
  ];

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const claude = spawn("claude", args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let fullText = "";
  let clientConnected = true;

  console.log("[follow-up] Spawning claude with args:", args.filter((a, i) => i !== 1).join(" "));

  const safeSend = (data: string) => {
    if (!clientConnected) return;
    try {
      res.write(data);
    } catch {
      clientConnected = false;
    }
  };

  const rl = createInterface({ input: claude.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      console.log("[follow-up] event type:", event.type, event.subtype || "");

      // Extract text content from various event shapes
      const text = extractText(event);
      if (text) {
        fullText += text;
        safeSend(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
      }

      // Fallback: use the final result if streaming produced nothing
      if (event.type === "result" && typeof event.result === "string" && event.result && !fullText) {
        fullText = event.result;
        safeSend(`data: ${JSON.stringify({ type: "text", content: event.result })}\n\n`);
      }
    } catch {
      // Skip non-JSON lines
    }
  });

  let stderrOutput = "";
  claude.stderr.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  claude.on("close", (code) => {
    cleanupPromptFile(promptFile);
    console.log("[follow-up] Claude exited with code:", code, "fullText length:", fullText.length, "stderr:", stderrOutput.slice(0, 200));
    if (code !== 0 && !fullText) {
      safeSend(`data: ${JSON.stringify({ type: "error", content: stderrOutput || `Claude exited with code ${code}` })}\n\n`);
    }

    // Persist the follow-up even if client disconnected
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const followUpDir = path.join(topicDir, "follow-ups");
    fs.mkdirSync(followUpDir, { recursive: true });

    const followUpContent = formatFollowUpMarkdown(request, fullText, timestamp);
    const followUpPath = path.join(followUpDir, `follow-up-${timestamp}.md`);
    fs.writeFileSync(followUpPath, followUpContent, "utf-8");

    rebuildTopicPages(workspacePath, buildDir, request.topicSlug);

    safeSend(`data: ${JSON.stringify({ type: "done", followUpFile: followUpPath })}\n\n`);
    if (clientConnected) res.end();
  });

  claude.on("error", (err) => {
    safeSend(`data: ${JSON.stringify({ type: "error", content: `Failed to spawn claude: ${err.message}. Is Claude Code installed?` })}\n\n`);
    if (clientConnected) res.end();
  });

  // Track client disconnect but do NOT kill Claude — let it finish so the
  // follow-up file gets saved. The user will see it when they navigate back.
  res.on("close", () => {
    clientConnected = false;
  });
}

function extractText(event: Record<string, unknown>): string | null {
  // stream-json format: {"type": "assistant", "message": {"content": [{"type": "text", "text": "..."}]}}
  if (event.type === "assistant") {
    const msg = event.message as Record<string, unknown> | undefined;
    if (msg?.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
      }
    }
  }

  // stream-json partial: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "..."}}
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  // Nested stream_event wrapper
  if (event.type === "stream_event") {
    const inner = event.event as Record<string, unknown> | undefined;
    if (inner) return extractText(inner);
  }

  return null;
}

function readTopicFiles(topicDir: string) {
  let charactersContent = "";
  let synthesisContent = "";
  let referenceLibraryContent = "";
  let iterationSyntheses = "";

  const entries = fs.readdirSync(topicDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const fullPath = path.join(topicDir, entry.name);
      if (entry.name.startsWith("characters")) {
        charactersContent += fs.readFileSync(fullPath, "utf-8") + "\n";
      } else if (entry.name === "synthesis.md") {
        synthesisContent = fs.readFileSync(fullPath, "utf-8");
      } else if (entry.name === "reference-library.md") {
        referenceLibraryContent = fs.readFileSync(fullPath, "utf-8");
      }
    }

    // Read iteration synthesis files
    if (entry.isDirectory() && entry.name.startsWith("iteration-")) {
      const synthPath = path.join(topicDir, entry.name, "synthesis.md");
      if (fs.existsSync(synthPath)) {
        iterationSyntheses += `\n--- ${entry.name} synthesis ---\n` + fs.readFileSync(synthPath, "utf-8") + "\n";
      }
    }
  }

  return { charactersContent, synthesisContent, referenceLibraryContent, iterationSyntheses };
}

function isReferenceLibraryMode(mode: string): boolean {
  return mode === "ask-library";
}

function buildPrompt(request: FollowUpRequest, topicDir: string): string | null {
  const files = readTopicFiles(topicDir);

  if (!files.charactersContent && !isReferenceLibraryMode(request.mode)) return null;

  if (isReferenceLibraryMode(request.mode)) {
    return buildReferenceLibraryPrompt(request, files);
  }

  if (request.mode === "debate") {
    return buildStructuredDebatePrompt(request, files);
  }

  return buildDebatePrompt(request, files);
}

function buildDebatePrompt(
  request: FollowUpRequest,
  files: ReturnType<typeof readTopicFiles>
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

function buildStructuredDebatePrompt(
  request: FollowUpRequest,
  files: ReturnType<typeof readTopicFiles>
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

function buildReferenceLibraryPrompt(
  request: FollowUpRequest,
  files: ReturnType<typeof readTopicFiles>
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

  return `${modePrompt}

REFERENCE LIBRARY:
${files.referenceLibraryContent}
${contextBlock}
${request.highlightedText ? `HIGHLIGHTED TEXT:\n> ${request.highlightedText}\n\nUSER'S QUESTION ABOUT THIS TEXT:` : "USER'S QUESTION:"}
${request.question}

TONE: Be scholarly but accessible. Assume the user is intelligent but may not have read the sources. Cite specific works by name and author. Do NOT adopt character voices — you are a guide, not a debater.`;
}

function getModeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character") {
    return `MODE: SINGLE CHARACTER — IN-DEPTH RESPONSE

You are responding as the specified character only. This is a one-on-one exchange.

Structure your response:
1. Answer the question directly and substantively. Use your real domain expertise — specific knowledge, operational details, concrete examples. Your response should be >80% direct answer with real specifics: numbers, companies, mechanisms, trade-offs. Do not pivot to your theoretical framework unless it directly changes the practical answer. If the user asks about economics, talk about economics — not your framework's abstract lens on economics.
2. Only AFTER answering substantively: if your framework genuinely changes what you'd conclude — not just how you'd label it — then briefly explain how. If it just adds a different lens without changing the practical answer, skip this entirely.
3. If there's something the user is getting wrong or oversimplifying, push back with specifics. Don't just "challenge their framing" in the abstract — show them what they're missing with evidence.

Go deep on substance. The user wants to understand, not to be lectured at through a theoretical lens.`;
  }

  // ask-assembly (default)
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

function getReferenceLibraryModePrompt(): string {
  return `You are a scholarly guide to this assembly's reference library. Auto-determine the best approach from the user's question:

- If they ask about a specific source: explain its core argument, historical context, lasting influence, how the assembly character interprets it, and the strongest criticism. Go deep.
- If they ask about connections: trace which sources agree, conflict, or build on each other. Map where different characters' traditions converge or diverge. Identify surprising connections and gaps.
- If they ask a general question: explain what the relevant sources argue, why they matter for this debate, which characters draw on them, and what they get right or wrong.

Be scholarly but accessible. Assume the user is intelligent but may not have read the sources. Cite specific works by name and author. Do NOT adopt character voices — you are a guide, not a debater.`;
}

function getChallengeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character") {
    return `PUSHBACK: If the user's question contains a factual error, a hidden assumption, or an oversimplification that matters, point it out with evidence. But only if it's real — don't invent problems with the question just to seem adversarial. If the question is good, say so and answer it.`;
  }

  return `PUSHBACK: If a character sees something wrong or oversimplified in the user's question, they should say so with specifics. But characters should not manufacture challenges — if the question is well-framed, engage with it directly.`;
}

function getChallengeMode(): string {
  return `CHALLENGE MODE: The user is pushing back on a position. This is adversarial — they disagree and want the character(s) to defend.

Rules:
- Acknowledge the specific objection the user is raising — do not talk past it
- Defend the position with evidence, not by restating the framework
- Concede specific points where the objection genuinely has merit
- Reference which other assembly characters would agree or disagree with the user's objection
- Identify what evidence would settle the dispute
- Do NOT be sycophantic. Push back firmly where the position is defensible. If the user is wrong, say so with specifics.`;
}

export function handleDeleteFollowUp(
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string
) {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let request: { topicSlug: string; timestamp: string };
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!request.topicSlug || !request.timestamp) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing topicSlug or timestamp" }));
      return;
    }

    // Validate timestamp format to prevent path traversal
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(request.timestamp)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid timestamp format" }));
      return;
    }

    // Validate topicSlug has no path separators
    if (/[/\\]/.test(request.topicSlug)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid topicSlug" }));
      return;
    }

    const followUpPath = path.join(
      workspacePath,
      request.topicSlug,
      "follow-ups",
      `follow-up-${request.timestamp}.md`
    );

    // Verify resolved path stays within workspace
    const resolved = path.resolve(followUpPath);
    if (!resolved.startsWith(path.resolve(workspacePath))) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    if (!fs.existsSync(followUpPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Follow-up not found" }));
      return;
    }

    try {
      fs.unlinkSync(followUpPath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
  });
}

export function handleDeleteWorkspace(
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string
) {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let request: { topicSlug: string };
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!request.topicSlug) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing topicSlug" }));
      return;
    }

    if (/[/\\]/.test(request.topicSlug)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid topicSlug" }));
      return;
    }

    const topicPath = path.join(workspacePath, request.topicSlug);
    const resolved = path.resolve(topicPath);
    if (!resolved.startsWith(path.resolve(workspacePath))) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    if (!fs.existsSync(topicPath) || !fs.statSync(topicPath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Workspace not found" }));
      return;
    }

    try {
      fs.rmSync(topicPath, { recursive: true, force: true });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
  });
}

function writePromptFile(prompt: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembly-"));
  const file = path.join(tmpDir, "prompt.md");
  fs.writeFileSync(file, prompt, "utf-8");
  return file;
}

function cleanupPromptFile(promptFile: string) {
  try { fs.rmSync(path.dirname(promptFile), { recursive: true }); } catch { /* ignore */ }
}

function formatFollowUpMarkdown(
  request: FollowUpRequest,
  responseText: string,
  timestamp: string
): string {
  const readableTime = timestamp.replace(/T/, " ").replace(/-/g, (m, offset) => {
    return offset > 9 ? ":" : "-";
  });

  return `# Follow-up — ${readableTime}

**Context:** ${request.context.page}${request.context.section ? ` > ${request.context.section}` : ""}
**Mode:** ${request.mode}${request.highlightedText ? `\n**Highlighted Text:** > ${request.highlightedText}` : ""}
**Question:** ${request.question}

---

${responseText.trim()}
`;
}
