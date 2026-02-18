import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { buildContentGraph } from "../graph/index.js";
import { renderWorkspace } from "../renderer/index.js";
import { buildFileReferenceBlock } from "./upload.js";

type PhaseId = "analysis" | "characters" | "references" | "debate" | "synthesis" | "deliverable" | "verification";

const PHASE_PATTERNS: Array<{ pattern: RegExp; phase: PhaseId }> = [
  { pattern: /PHASE\s*0|Domain\s*Analysis/i, phase: "analysis" },
  { pattern: /PHASE\s*1|Character\s*Generation/i, phase: "characters" },
  { pattern: /PHASE\s*2|Reference\s*Library/i, phase: "references" },
  { pattern: /PHASE\s*3|THE\s*DEBATE|Grande\s*Table/i, phase: "debate" },
  { pattern: /PHASE\s*4|SYNTHESIS/i, phase: "synthesis" },
  { pattern: /PHASE\s*5|DELIVERABLE/i, phase: "deliverable" },
  { pattern: /PHASE\s*6|VERIFICATION/i, phase: "verification" },
];

const FILE_PHASE_MAP: Array<{ check: string; phase: PhaseId; urlSuffix: string }> = [
  { check: "characters.md", phase: "characters", urlSuffix: "characters.html" },
  { check: "reference-library.md", phase: "references", urlSuffix: "reference-library.html" },
  { check: "iteration-*/transcript.md", phase: "debate", urlSuffix: "iteration-1.html" },
  { check: "synthesis.md", phase: "synthesis", urlSuffix: "synthesis.html" },
  { check: "deliverable/", phase: "deliverable", urlSuffix: "deliverables.html" },
  { check: "verification/", phase: "verification", urlSuffix: "verification.html" },
];

interface AssemblySession {
  process: ChildProcess | null;
  sessionId: string | null;
  status: "running" | "waiting_for_input" | "complete" | "error";
  currentPhase: string;
  completedPhases: PhaseId[];
  completedPhaseUrls: Record<string, string>;
  topicSlug: string | null;
  sseClients: ServerResponse[];
  pollInterval: ReturnType<typeof setInterval> | null;
  lastAssistantText: string;
  preExistingDirs: Set<string>;
  workspacePath: string;
  buildDir: string;
  pendingQuestion: { question: string; options?: string[] } | null;
}

let session: AssemblySession | null = null;

const CLAUDE_ENV = () => {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
};

function broadcast(event: Record<string, unknown>) {
  if (!session) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  session.sseClients = session.sseClients.filter((res) => !res.destroyed);
  for (const client of session.sseClients) {
    client.write(data);
  }
}

function detectPhase(text: string): PhaseId | null {
  let latestPhase: PhaseId | null = null;
  let latestIndex = -1;
  for (const { pattern, phase } of PHASE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && match.index > latestIndex) {
      latestIndex = match.index;
      latestPhase = phase;
    }
  }
  return latestPhase;
}

function rebuildSite(workspacePath: string, buildDir: string) {
  const workspace = buildContentGraph(workspacePath);
  renderWorkspace(workspace, buildDir);
}

function snapshotExistingDirs(workspacePath: string): Set<string> {
  const dirs = new Set<string>();
  try {
    for (const entry of fs.readdirSync(workspacePath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_")) {
        dirs.add(entry.name);
      }
    }
  } catch { /* workspace dir might not exist yet */ }
  console.log(`[assembly] Pre-existing directories: [${[...dirs].join(", ")}]`);
  return dirs;
}

function findNewTopicDir(workspacePath: string, preExisting: Set<string>): string | null {
  try {
    for (const entry of fs.readdirSync(workspacePath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_") && !preExisting.has(entry.name)) {
        return entry.name;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function checkFileExists(topicDir: string, check: string): boolean {
  if (check.includes("*")) {
    try {
      for (const entry of fs.readdirSync(topicDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("iteration-")) {
          if (fs.existsSync(path.join(topicDir, entry.name, "transcript.md"))) return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }

  if (check.endsWith("/")) {
    const dirPath = path.join(topicDir, check.slice(0, -1));
    try {
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        return fs.readdirSync(dirPath).some((f) => f.endsWith(".md"));
      }
    } catch { /* ignore */ }
    return false;
  }

  return fs.existsSync(path.join(topicDir, check));
}

function startPolling(workspacePath: string, buildDir: string) {
  if (!session) return;

  const alreadyDetected = new Set<string>();

  const poll = () => {
    if (!session) return;

    if (!session.topicSlug) {
      const newSlug = findNewTopicDir(workspacePath, session.preExistingDirs);
      if (newSlug) {
        session.topicSlug = newSlug;
        console.log(`[assembly] Detected new topic directory: ${newSlug}`);
      } else {
        return;
      }
    }

    const topicDir = path.join(workspacePath, session.topicSlug);
    if (!fs.existsSync(topicDir)) return;

    for (const mapping of FILE_PHASE_MAP) {
      if (alreadyDetected.has(mapping.phase)) continue;

      if (checkFileExists(topicDir, mapping.check)) {
        alreadyDetected.add(mapping.phase);
        console.log(`[assembly] File detected: ${mapping.phase} in ${session.topicSlug}/`);

        try {
          rebuildSite(workspacePath, buildDir);
        } catch (err) {
          console.error(`[assembly] Rebuild error:`, err);
        }

        if (!session.completedPhases.includes(mapping.phase)) {
          session.completedPhases.push(mapping.phase);
        }

        const url = `/${session.topicSlug}/${mapping.urlSuffix}`;
        session.completedPhaseUrls[mapping.phase] = url;

        broadcast({ type: "phase_complete", phase: mapping.phase, url });
      }
    }
  };

  session.pollInterval = setInterval(poll, 3000);
}

/**
 * Attach listeners to a claude process: parse stream-json, detect phases, log activity.
 * Calls `onResult` when a result event fires (turn complete).
 */
function attachProcessListeners(
  claude: ChildProcess,
  onResult: (resultEvent: Record<string, unknown>) => void
) {
  const rl = createInterface({ input: claude.stdout! });
  let accumulatedText = "";

  rl.on("line", (line) => {
    if (!line.trim()) return;

    try {
      const event = JSON.parse(line);

      // Capture session ID from init event
      if (event.type === "system" && event.session_id && session) {
        session.sessionId = event.session_id;
        console.log(`[assembly] Session ID: ${event.session_id}`);
      }

      const text = extractText(event);
      if (text) {
        accumulatedText += text;
        if (session) session.lastAssistantText += text;

        const phase = detectPhase(accumulatedText);
        if (phase && session && phase !== session.currentPhase) {
          session.currentPhase = phase;
          broadcast({ type: "phase", phase });
          console.log(`[assembly] Phase: ${phase}`);
        }

        const snippet = text.replace(/\n/g, " ").slice(0, 120);
        if (snippet.trim()) console.log(`[assembly] text: ${snippet}`);
      }

      const toolInfo = extractToolUse(event);
      if (toolInfo) {
        console.log(`[assembly] tool: ${toolInfo.summary}`);

        if (toolInfo.tool === "AskUserQuestion") {
          const question = extractAskUserQuestion(event);
          if (question && session) {
            session.pendingQuestion = question;
            session.status = "waiting_for_input";
            broadcast({ type: "question", ...question });
            claude.kill();
          }
        }
      }

      if (event.type === "result") {
        const subtype = event.subtype as string | undefined;
        const stopReason = (event as Record<string, unknown>).stop_reason as string | undefined;
        console.log(`[assembly] result event: subtype=${subtype}, stop_reason=${stopReason}`);
        onResult(event);
      }
    } catch {
      // Skip non-JSON lines
    }
  });

  let stderrOutput = "";
  claude.stderr!.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderrOutput += text;
    for (const line of text.split("\n")) {
      if (line.trim()) console.log(`[assembly] stderr: ${line.trim().slice(0, 200)}`);
    }
  });

  return { getStderr: () => stderrOutput };
}

export function startSession(topic: string, workspacePath: string, buildDir: string, files?: string[]) {
  // Kill any existing session
  if (session?.process && !session.process.killed) {
    session.process.kill();
  }
  if (session?.pollInterval) {
    clearInterval(session.pollInterval);
  }

  const preExistingDirs = snapshotExistingDirs(workspacePath);

  const fileBlock = buildFileReferenceBlock(files ?? [], workspacePath);
  const prompt = `Use the Skill tool to invoke the "assembly-skills:assembly-light" skill. The topic is: ${topic}${fileBlock}

If you need critical context to produce a high-quality assembly, you may use AskUserQuestion to ask the user ONE focused clarifying question. Keep it brief and specific. If you can proceed with reasonable assumptions, do so without asking.`;

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  // stdin: "ignore" is required — claude's Bun runtime blocks on piped stdin
  // cwd: workspacePath ensures Claude sees the assembly workspace, not the viewer source code
  const claude = spawn("claude", args, {
    cwd: workspacePath,
    env: CLAUDE_ENV(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  session = {
    process: claude,
    sessionId: null,
    status: "running",
    currentPhase: "",
    completedPhases: [],
    completedPhaseUrls: {},
    topicSlug: null,
    sseClients: [],
    pollInterval: null,
    lastAssistantText: "",
    preExistingDirs,
    workspacePath,
    buildDir,
    pendingQuestion: null,
  };

  console.log(`[assembly] Starting session for topic: "${topic.slice(0, 80)}..."`);
  console.log(`[assembly] PID: ${claude.pid}`);

  startPolling(workspacePath, buildDir);

  const { getStderr } = attachProcessListeners(claude, (resultEvent) => {
    if (!session) return;

    // Check if the result indicates the process is done or waiting for input
    const stopReason = resultEvent.stop_reason as string | undefined;
    const subtype = resultEvent.subtype as string | undefined;

    if (subtype === "success" || subtype === "error") {
      // Process is done — close handler will fire
      return;
    }

    // If result fires but process is still alive, Claude completed a turn and may
    // be waiting for human input (this happens when assembly-light asks context questions)
    if (!claude.killed && claude.exitCode === null && session.sessionId) {
      session.status = "waiting_for_input";
      broadcast({ type: "text", content: session.lastAssistantText });
      broadcast({ type: "input_needed" });
      session.lastAssistantText = "";
      console.log(`[assembly] Waiting for user input (session: ${session.sessionId})`);
    }
  });

  claude.on("close", (code, signal) => {
    console.log(`[assembly] Claude exited with code: ${code}, signal: ${signal}`);

    if (!session) return;

    // Process was killed because we detected AskUserQuestion — not an error
    if (session.status === "waiting_for_input") {
      console.log(`[assembly] Process killed for question prompt — waiting for user answer`);
      session.process = null;
      return;
    }

    if (code === 0) {
      session.process = null;

      // Do a final file-system poll to catch any last-second writes
      const topicDir = session.topicSlug
        ? path.join(workspacePath, session.topicSlug)
        : null;
      if (topicDir && fs.existsSync(topicDir)) {
        for (const mapping of FILE_PHASE_MAP) {
          if (!session.completedPhases.includes(mapping.phase) && checkFileExists(topicDir, mapping.check)) {
            session.completedPhases.push(mapping.phase);
            const url = `/${session.topicSlug}/${mapping.urlSuffix}`;
            session.completedPhaseUrls[mapping.phase] = url;
            broadcast({ type: "phase_complete", phase: mapping.phase, url });
          }
        }
      }

      try {
        rebuildSite(workspacePath, buildDir);
      } catch (err) {
        console.error(`[assembly] Final rebuild error:`, err);
      }

      const ALL_PHASES: PhaseId[] = ["analysis", "characters", "references", "debate", "synthesis", "deliverable", "verification"];
      const missing = ALL_PHASES.filter(
        (p) => p !== "analysis" && !session!.completedPhases.includes(p)
      );

      if (missing.length > 0) {
        console.log(`[assembly] Finished with missing phases: ${missing.join(", ")}`);
        session.status = "complete";
        broadcast({
          type: "complete",
          topicSlug: session.topicSlug,
          partial: true,
          missingPhases: missing,
        });
      } else {
        session.status = "complete";
        broadcast({ type: "complete", topicSlug: session.topicSlug });
      }
    } else {
      session.status = "error";
      session.process = null;
      const stderr = getStderr();
      const detail = signal
        ? `Claude was killed by signal ${signal}`
        : stderr || `Claude exited with code ${code}`;
      console.error(`[assembly] Error detail: ${detail}`);
      broadcast({ type: "error", content: detail });
    }

    if (session.pollInterval) {
      clearInterval(session.pollInterval);
      session.pollInterval = null;
    }
  });

  claude.on("error", (err) => {
    if (!session) return;
    session.status = "error";
    broadcast({ type: "error", content: `Failed to spawn claude: ${err.message}` });
  });
}

/**
 * Send user input by resuming the Claude session.
 * Since stdin: "pipe" blocks Bun, we spawn a new process with --resume.
 */
export function sendInput(text: string, files?: string[]) {
  if (!session || !session.sessionId) {
    return false;
  }

  const { sessionId, workspacePath, buildDir } = session;

  session.status = "running";
  session.lastAssistantText = "";
  session.pendingQuestion = null;
  broadcast({ type: "input_received" });

  const fileBlock = buildFileReferenceBlock(files ?? [], workspacePath);
  const prompt = text + fileBlock;

  console.log(`[assembly] Resuming session ${sessionId} with input: "${text.slice(0, 80)}"`);

  const args = [
    "--resume", sessionId,
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  const claude = spawn("claude", args, {
    cwd: workspacePath,
    env: CLAUDE_ENV(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  session.process = claude;

  const { getStderr } = attachProcessListeners(claude, (resultEvent) => {
    if (!session) return;

    const subtype = resultEvent.subtype as string | undefined;
    if (subtype === "success" || subtype === "error") return;

    if (!claude.killed && claude.exitCode === null && session.sessionId) {
      session.status = "waiting_for_input";
      broadcast({ type: "text", content: session.lastAssistantText });
      broadcast({ type: "input_needed" });
      session.lastAssistantText = "";
      console.log(`[assembly] Waiting for user input again`);
    }
  });

  claude.on("close", (code, signal) => {
    console.log(`[assembly] Resume process exited with code: ${code}, signal: ${signal}`);
    if (!session) return;

    if (session.status === "waiting_for_input") {
      console.log(`[assembly] Resume process killed for question prompt — waiting for user answer`);
      session.process = null;
      return;
    }

    if (code === 0) {
      session.process = null;

      // Final file-system poll
      const topicDir = session.topicSlug
        ? path.join(workspacePath, session.topicSlug)
        : null;
      if (topicDir && fs.existsSync(topicDir)) {
        for (const mapping of FILE_PHASE_MAP) {
          if (!session.completedPhases.includes(mapping.phase) && checkFileExists(topicDir, mapping.check)) {
            session.completedPhases.push(mapping.phase);
            const url = `/${session.topicSlug}/${mapping.urlSuffix}`;
            session.completedPhaseUrls[mapping.phase] = url;
            broadcast({ type: "phase_complete", phase: mapping.phase, url });
          }
        }
      }

      try {
        rebuildSite(workspacePath, buildDir);
      } catch (err) {
        console.error(`[assembly] Final rebuild error:`, err);
      }

      const ALL_PHASES: PhaseId[] = ["analysis", "characters", "references", "debate", "synthesis", "deliverable", "verification"];
      const missing = ALL_PHASES.filter(
        (p) => p !== "analysis" && !session!.completedPhases.includes(p)
      );

      if (missing.length > 0) {
        console.log(`[assembly] Finished with missing phases: ${missing.join(", ")}`);
      }

      session.status = "complete";
      broadcast({
        type: "complete",
        topicSlug: session.topicSlug,
        ...(missing.length > 0 ? { partial: true, missingPhases: missing } : {}),
      });
    } else {
      session.status = "error";
      session.process = null;
      const stderr = getStderr();
      const detail = signal
        ? `Claude was killed by signal ${signal}`
        : stderr || `Claude exited with code ${code}`;
      console.error(`[assembly] Error detail: ${detail}`);
      broadcast({ type: "error", content: detail });
    }

    if (session.pollInterval) {
      clearInterval(session.pollInterval);
      session.pollInterval = null;
    }
  });

  claude.on("error", (err) => {
    if (!session) return;
    session.status = "error";
    broadcast({ type: "error", content: `Failed to resume claude: ${err.message}` });
  });

  return true;
}

export function addSSEClient(res: ServerResponse) {
  if (!session) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`data: ${JSON.stringify({
    type: "state",
    status: session.status,
    currentPhase: session.currentPhase,
    completedPhases: session.completedPhases,
    completedPhaseUrls: session.completedPhaseUrls,
    topicSlug: session.topicSlug,
    pendingQuestion: session.pendingQuestion,
  })}\n\n`);

  session.sseClients.push(res);

  res.on("close", () => {
    if (session) {
      session.sseClients = session.sseClients.filter((c) => c !== res);
    }
  });
}

export function getSessionStatus() {
  if (!session) return null;
  return {
    status: session.status,
    currentPhase: session.currentPhase,
    completedPhases: session.completedPhases,
    completedPhaseUrls: session.completedPhaseUrls,
    topicSlug: session.topicSlug,
  };
}

function extractAskUserQuestion(event: Record<string, unknown>): { question: string; options?: string[] } | null {
  const getContent = (e: Record<string, unknown>) => {
    if (e.type === "assistant") {
      const msg = e.message as Record<string, unknown> | undefined;
      return msg?.content as Array<Record<string, unknown>> | undefined;
    }
    if (e.type === "stream_event") {
      const inner = e.event as Record<string, unknown> | undefined;
      if (inner) return getContent(inner);
    }
    return undefined;
  };

  const content = getContent(event);
  if (!content) return null;

  for (const block of content) {
    if (block.type !== "tool_use" || block.name !== "AskUserQuestion") continue;
    const input = block.input as Record<string, unknown> | undefined;
    if (!input?.questions || !Array.isArray(input.questions)) continue;

    const first = input.questions[0] as Record<string, unknown> | undefined;
    if (!first?.question) continue;

    const question = first.question as string;
    const options = Array.isArray(first.options)
      ? (first.options as Array<Record<string, unknown>>)
          .map((o) => (o.label as string) || "")
          .filter(Boolean)
      : undefined;

    return { question, ...(options?.length ? { options } : {}) };
  }

  return null;
}

function extractToolUse(event: Record<string, unknown>): { tool: string; summary: string } | null {
  if (event.type === "assistant") {
    const msg = event.message as Record<string, unknown> | undefined;
    if (msg?.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && typeof block.name === "string") {
          const input = block.input as Record<string, unknown> | undefined;
          let summary = block.name;
          if (block.name === "Write" && input?.file_path) summary = `Writing ${(input.file_path as string).split("/").pop()}`;
          else if (block.name === "Edit" && input?.file_path) summary = `Editing ${(input.file_path as string).split("/").pop()}`;
          else if (block.name === "Read" && input?.file_path) summary = `Reading ${(input.file_path as string).split("/").pop()}`;
          else if (block.name === "Bash" && input?.command) summary = `Running command`;
          else if (block.name === "Skill") summary = `Invoking skill: ${input?.skill || "unknown"}`;
          return { tool: block.name, summary };
        }
      }
    }
  }

  if (event.type === "stream_event") {
    const inner = event.event as Record<string, unknown> | undefined;
    if (inner) return extractToolUse(inner);
  }

  return null;
}

function extractText(event: Record<string, unknown>): string | null {
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

  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  if (event.type === "stream_event") {
    const inner = event.event as Record<string, unknown> | undefined;
    if (inner) return extractText(inner);
  }

  return null;
}
