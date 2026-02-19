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
  avatarMappingPrompt,
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
  maxTokens: number,
  model: string = "claude-sonnet-4-20250514"
): Promise<string> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const apiErr = err as { status: number; message?: string };
      if (apiErr.status === 401) {
        throw new Error("Invalid API key. Please update your key in Settings.");
      }
      if (apiErr.status === 429) {
        throw new Error("Rate limited by Anthropic. Please wait and try again, or check your API plan limits.");
      }
      if (apiErr.status === 529) {
        throw new Error("Anthropic API is temporarily overloaded. Your assembly will be retried.");
      }
    }
    throw err;
  }
}

function attachAvatars(characters: Topic["characters"], rawAvatarJson: string) {
  try {
    const avatarMapping = JSON.parse(rawAvatarJson) as Array<{
      name: string;
      skinColor: string;
      hair: string;
      hairColor: string;
      eyes: string;
      eyebrows: string;
      mouth: string;
      glasses: string;
      features: string;
    }>;
    for (const char of characters) {
      const mapping = avatarMapping.find(
        (m) => m.name.toLowerCase() === char.name.toLowerCase()
      );
      if (mapping) {
        const params = new URLSearchParams({
          seed: mapping.name,
          skinColor: mapping.skinColor,
          hair: mapping.hair,
          hairColor: mapping.hairColor,
          eyes: mapping.eyes,
          eyebrows: mapping.eyebrows,
          mouth: mapping.mouth,
        });
        if (mapping.glasses !== "none") {
          params.set("glasses", mapping.glasses);
          params.set("glassesProbability", "100");
        } else {
          params.set("glassesProbability", "0");
        }
        if (mapping.features !== "none") {
          params.set("features", mapping.features);
          params.set("featuresProbability", "100");
        } else {
          params.set("featuresProbability", "0");
        }
        char.avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?${params.toString()}`;
      }
    }
  } catch {
    console.warn("[pipeline] Failed to parse avatar-mapping.json, skipping avatars");
  }
}

function buildParsedTopic(rawFiles: Record<string, string>, slug: string, topic: string): Topic {
  const characters = rawFiles["characters.md"]
    ? parseCharacterFiles([rawFiles["characters.md"]])
    : [];

  if (rawFiles["avatar-mapping.json"]) {
    attachAvatars(characters, rawFiles["avatar-mapping.json"]);
  }

  const synthesisData = rawFiles["synthesis.md"]
    ? parseSynthesis(rawFiles["synthesis.md"])
    : null;

  const rounds = rawFiles["debate-transcript.md"]
    ? parseTranscript(rawFiles["debate-transcript.md"])
    : [];

  const parsedRefLib = rawFiles["reference-library.md"]
    ? parseReferenceLibrary(rawFiles["reference-library.md"])
    : null;

  return {
    slug,
    title: topic,
    characters,
    iterations: rawFiles["debate-transcript.md"]
      ? [{
          number: 1,
          structure: "Grande Table",
          synthesis: synthesisData,
          transcriptRaw: rawFiles["debate-transcript.md"],
          rounds,
        }]
      : [],
    synthesis: synthesisData,
    deliverables: rawFiles["deliverable.md"]
      ? [{ slug: "main", title: "Deliverable", content: rawFiles["deliverable.md"] }]
      : [],
    verification: rawFiles["verification.md"]
      ? [{ type: "full", title: "Verification Report", content: rawFiles["verification.md"] }]
      : [],
    referenceLibrary: rawFiles["reference-library.md"] || null,
    parsedReferenceLibrary: parsedRefLib,
    researchFiles: [],
    followUps: [],
  };
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
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
  }

  // Phase 2.5: Avatar Mapping
  if (!rawFiles["avatar-mapping.json"]) {
    await updatePhase("avatar-mapping");
    const result = await callClaude(
      client,
      avatarMappingPrompt(rawFiles["characters.md"]),
      "Map each character to DiceBear Adventurer avatar options based on their biographies.",
      2048,
      "claude-haiku-4-5-20251001"
    );
    const cleaned = result.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    rawFiles["avatar-mapping.json"] = cleaned;
    await updateRawFiles(rawFiles);
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
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
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
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
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
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
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
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
    await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
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

  // Build final parsed data and save
  await updateParsedData(buildParsedTopic(rawFiles, slug, topic));
}
