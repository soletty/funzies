import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface FollowUpRequest {
  question: string;
  topicSlug: string;
  characters: string[];
  context: {
    page: string;
    section?: string;
  };
  mode: "multi-character" | "reconvene" | "ask-character" | "explore-explain" | "explore-connect" | "explore-deep-dive";
}

export function handleFollowUp(
  req: IncomingMessage,
  res: ServerResponse,
  workspacePath: string
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
      streamFollowUp(request, req, res, workspacePath);
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
  workspacePath: string
) {
  const topicDir = path.join(workspacePath, request.topicSlug);
  const prompt = buildPrompt(request, topicDir);

  if (!prompt) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Topic workspace files not found" }));
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", "1",
  ];

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const claude = spawn("claude", args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let fullText = "";

  console.log("[follow-up] Spawning claude with args:", args.filter((a, i) => i !== 1).join(" "));

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
        res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
      }

      // Fallback: use the final result if streaming produced nothing
      if (event.type === "result" && typeof event.result === "string" && event.result && !fullText) {
        fullText = event.result;
        res.write(`data: ${JSON.stringify({ type: "text", content: event.result })}\n\n`);
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
    console.log("[follow-up] Claude exited with code:", code, "fullText length:", fullText.length, "stderr:", stderrOutput.slice(0, 200));
    if (code !== 0 && !fullText) {
      res.write(`data: ${JSON.stringify({ type: "error", content: stderrOutput || `Claude exited with code ${code}` })}\n\n`);
    }

    // Persist the follow-up
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const followUpDir = path.join(topicDir, "follow-ups");
    fs.mkdirSync(followUpDir, { recursive: true });

    const followUpContent = formatFollowUpMarkdown(request, fullText, timestamp);
    const followUpPath = path.join(followUpDir, `follow-up-${timestamp}.md`);
    fs.writeFileSync(followUpPath, followUpContent, "utf-8");

    res.write(`data: ${JSON.stringify({ type: "done", followUpFile: followUpPath })}\n\n`);
    res.end();
  });

  claude.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ type: "error", content: `Failed to spawn claude: ${err.message}. Is Claude Code installed?` })}\n\n`);
    res.end();
  });

  // Handle client disconnect — listen on response, not request
  // (req "close" fires when the POST body is consumed, killing claude immediately)
  res.on("close", () => {
    if (!claude.killed) claude.kill();
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
  return mode.startsWith("explore-");
}

function buildPrompt(request: FollowUpRequest, topicDir: string): string | null {
  const files = readTopicFiles(topicDir);

  if (!files.charactersContent && !isReferenceLibraryMode(request.mode)) return null;

  if (isReferenceLibraryMode(request.mode)) {
    return buildReferenceLibraryPrompt(request, files);
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
  const challengeInstructions = getChallengeInstructions(request.mode, isCharacterPage);

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

  return `You are continuing an Intellectual Assembly session. Respond to the user's follow-up question, staying fully in character as the assembly members.

CHARACTER PROFILES:
${files.charactersContent}
${contextBlock}
CONTEXT:
${contextInfo}

USER'S QUESTION:
${request.question}

${characterFilter}

${modeInstructions}

${challengeInstructions}

FORMAT RULES:
- Start each character's response with their full name in bold: **Full Name:** followed by their response.
- Each character must argue FROM their ideological framework as defined in their profile.
- Maintain their distinctive voice, rhetorical tendencies, and specific positions.
- Do NOT homogenize voices. Preserve disagreement where frameworks genuinely conflict.
- Where relevant, cite specific intellectual traditions and sources from the reference library.
- Keep responses focused and substantive — no meta-commentary about being characters.`;
}

function buildReferenceLibraryPrompt(
  request: FollowUpRequest,
  files: ReturnType<typeof readTopicFiles>
): string {
  if (!files.referenceLibraryContent) {
    return buildDebatePrompt(request, files);
  }

  const modePrompt = getReferenceLibraryModePrompt(request.mode);

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
USER'S QUESTION:
${request.question}

TONE: Be scholarly but accessible. Assume the user is intelligent but may not have read the sources. Cite specific works by name and author. Do NOT adopt character voices — you are a guide, not a debater.`;
}

function getModeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character") {
    return `MODE: SINGLE CHARACTER — IN-DEPTH RESPONSE

You are responding as the specified character only.

Structure your response:
1. Your direct answer to the question (2-3 paragraphs, grounded in your intellectual tradition)
2. What your framework reveals that others' frameworks obscure
3. A challenge: identify one assumption in the user's question and push back on it. Be specific. Name what they're taking for granted.
4. A question back to the user — what should they think about next?

Go deep. This is a one-on-one exchange, not a panel. Show the full depth of your framework.`;
  }

  if (mode === "reconvene") {
    return `MODE: RECONVENE — STRUCTURED ADVERSARIAL DEBATE

Run a structured adversarial mini-debate among ALL assembly members on this question.

Structure:
1. OPENING POSITIONS (each character states their position in 1-2 paragraphs, grounded in their intellectual tradition)
2. DIRECT CHALLENGES (characters challenge each other by name — "I disagree with [Name] because..." — be specific about what framework assumptions are in tension)
3. SOCRATE INTERVENTION (Socrate identifies the deepest assumption that divides the assembly and poses a question that none of them can easily answer)
4. SYNTHESIS (2-3 sentences on where the assembly stands after this exchange — what's resolved and what remains contested)

Rules: No character may agree with more than one other character. Force genuine disagreement. Reference specific intellectual traditions and sources from their profiles. Make the tensions concrete, not abstract.`;
  }

  // multi-character
  if (isCharacterPage) {
    return `MODE: BRING IN THE ASSEMBLY

The user is on a specific character's profile page and wants to hear from multiple perspectives. Include this character plus 1-2 others who would have the most productive tension with them on this question.

Each character MUST:
1. Answer the question from within their specific framework — cite the intellectual traditions that ground their position
2. Directly address where they agree or disagree with the other responding characters
3. Identify one assumption in the user's question that their framework would challenge

Structure: Each character responds in 2-4 paragraphs. If characters disagree, make the disagreement specific and grounded in their frameworks. Do not soften tensions.`;
  }

  return `MODE: MULTI-CHARACTER EXCHANGE

You are facilitating a focused exchange between selected members of the Intellectual Assembly.

Each character MUST:
1. Answer the question from within their specific framework — cite the intellectual traditions that ground their position
2. Directly address where they agree or disagree with the other responding characters
3. Identify one assumption in the user's question that their framework would challenge

Structure: Each character responds in 2-4 paragraphs. If characters disagree, make the disagreement specific and grounded in their frameworks. Do not soften tensions.`;
}

function getReferenceLibraryModePrompt(mode: string): string {
  if (mode === "explore-connect") {
    return `You are mapping the intellectual landscape of this assembly's reference library. The user wants to understand how sources relate.

Trace the connections:
- Which sources agree, conflict, or build on each other
- Where different characters' intellectual traditions converge or diverge
- Surprising connections between seemingly unrelated sources
- Gaps in the library — what important works or perspectives are missing

Be precise. Name specific works, authors, and the characters who cite them.`;
  }

  if (mode === "explore-deep-dive") {
    return `You are conducting a seminar on a specific source from this assembly's reference library.

Go deep:
- The core argument of the work in the author's own terms
- Historical context — when it was written and what it was responding to
- Its lasting influence and how it's been received, challenged, and built upon
- How the assembly character who cites it interprets it — and whether that interpretation is faithful or selective
- The strongest criticism of this work

Be scholarly but accessible. Assume the user is intelligent but hasn't read the source.`;
  }

  // explore-explain (default)
  return `You are a scholarly guide to this assembly's reference library. The user wants to understand specific sources, traditions, or ideas.

Draw on the reference library content below. Explain clearly and specifically:
- What the source argues
- Why it matters for this debate
- Which assembly character draws on it, and how they use it
- What the source gets right, and what it gets wrong or overlooks

Be a teacher, not a debater. Cite specific works by name and author.`;
}

function getChallengeInstructions(mode: string, isCharacterPage: boolean): string {
  if (mode === "ask-character" && isCharacterPage) {
    return `CHALLENGE: After your main response, challenge the user's thinking from your framework. Then ask them a question that pushes them to think more carefully about this topic.`;
  }

  if (mode === "reconvene") {
    return `CHALLENGE: The Socrate intervention should question the assumptions that ALL characters (and the user) share. Find the unexamined common ground.`;
  }

  return `CHALLENGE: Each character should identify one assumption in the user's question that their framework would challenge. Push back on the user's framing. The goal is not to please the user but to sharpen their thinking.`;
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
**Mode:** ${request.mode}
**Question:** ${request.question}

---

${responseText.trim()}
`;
}
