import Anthropic from "@anthropic-ai/sdk";
import {
  parseCharacterFiles,
  parseSynthesis,
  parseTranscript,
  parseReferenceLibrary,
} from "../lib/parsers/index.js";
import type { Topic } from "../lib/types.js";
import {
  domainAnalysisPrompt,
  characterGenerationPrompt,
  referenceLibraryPrompt,
  debatePrompt,
  synthesisPrompt,
  deliverablePrompt,
  verificationPrompt,
} from "./prompts.js";

export interface PipelineConfig {
  assemblyId: string;
  topic: string;
  slug: string;
  apiKey: string;
  initialRawFiles?: Record<string, string>;
  updatePhase: (phase: string) => Promise<void>;
  updateRawFiles: (files: Record<string, string>) => Promise<void>;
  updateParsedData: (data: unknown) => Promise<void>;
}

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userMessage }],
    system: systemPrompt,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function runPipeline(config: PipelineConfig): Promise<void> {
  const { topic, slug, apiKey, initialRawFiles, updatePhase, updateRawFiles, updateParsedData } =
    config;

  const client = new Anthropic({ apiKey });

  // Track raw files — pre-populated from DB for resume support
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Phase 1: Domain Analysis
  if (!rawFiles["domain-analysis.md"]) {
    await updatePhase("domain-analysis");
    const result = await callClaude(
      client,
      domainAnalysisPrompt(topic),
      `Analyze this topic: ${topic}`,
      8192
    );
    rawFiles["domain-analysis.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 2: Character Generation
  if (!rawFiles["characters.md"]) {
    await updatePhase("character-generation");
    const result = await callClaude(
      client,
      characterGenerationPrompt(topic, rawFiles["domain-analysis.md"]),
      `Generate 6 characters + Socrate for the assembly on: ${topic}`,
      8192
    );
    rawFiles["characters.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 3: Reference Library
  if (!rawFiles["reference-library.md"]) {
    await updatePhase("reference-library");
    const result = await callClaude(
      client,
      referenceLibraryPrompt(topic, rawFiles["characters.md"]),
      `Build the reference library for the assembly on: ${topic}`,
      8192
    );
    rawFiles["reference-library.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 4: Debate
  if (!rawFiles["debate-transcript.md"]) {
    await updatePhase("debate");
    const result = await callClaude(
      client,
      debatePrompt(
        topic,
        rawFiles["characters.md"],
        rawFiles["reference-library.md"]
      ),
      `Run the Grande Table debate on: ${topic}`,
      16384
    );
    rawFiles["debate-transcript.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 5: Synthesis
  if (!rawFiles["synthesis.md"]) {
    await updatePhase("synthesis");
    const result = await callClaude(
      client,
      synthesisPrompt(topic, rawFiles["debate-transcript.md"]),
      `Synthesize the debate on: ${topic}`,
      8192
    );
    rawFiles["synthesis.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 6: Deliverable
  if (!rawFiles["deliverable.md"]) {
    await updatePhase("deliverable");
    const result = await callClaude(
      client,
      deliverablePrompt(topic, rawFiles["synthesis.md"]),
      `Produce the deliverable for: ${topic}`,
      8192
    );
    rawFiles["deliverable.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Phase 7: Verification
  if (!rawFiles["verification.md"]) {
    await updatePhase("verification");
    const result = await callClaude(
      client,
      verificationPrompt(
        topic,
        rawFiles["deliverable.md"],
        rawFiles["synthesis.md"]
      ),
      `Verify the assembly output for: ${topic}`,
      8192
    );
    rawFiles["verification.md"] = result;
    await updateRawFiles(rawFiles);
  }

  // Parse all raw files into a Topic object
  const characters = parseCharacterFiles([rawFiles["characters.md"]]);
  const synthesisData = parseSynthesis(rawFiles["synthesis.md"]);
  const rounds = parseTranscript(rawFiles["debate-transcript.md"]);
  const parsedRefLib = parseReferenceLibrary(rawFiles["reference-library.md"]);

  const parsed: Topic = {
    slug,
    title: topic,
    characters,
    iterations: [
      {
        number: 1,
        structure: "Grande Table",
        synthesis: synthesisData,
        transcriptRaw: rawFiles["debate-transcript.md"],
        rounds,
      },
    ],
    synthesis: synthesisData,
    deliverables: [
      {
        slug: "main",
        title: "Deliverable",
        content: rawFiles["deliverable.md"],
      },
    ],
    verification: [
      {
        type: "full",
        title: "Verification Report",
        content: rawFiles["verification.md"],
      },
    ],
    referenceLibrary: rawFiles["reference-library.md"],
    parsedReferenceLibrary: parsedRefLib,
    researchFiles: [],
    followUps: [],
  };

  await updateParsedData(parsed);
}
