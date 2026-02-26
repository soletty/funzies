import { callAnthropicChunked, parseJsonResponse } from "../api";
import { ppmExtractionPrompt, ppmDeepDiveEligibilityPrompt, ppmDeepDiveStructuralPrompt } from "../../../worker/clo-prompts";
import { extractedConstraintsSchema } from "../../../app/api/clo/profile/extract/schema";
import type { CloDocument } from "../types";

function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== null) result[k] = stripNulls(v);
    }
    return result;
  }
  return obj;
}

function deduplicateArray(arr: unknown[]): unknown[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeExtraction(
  base: Record<string, unknown>,
  delta: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };

  for (const [key, deltaVal] of Object.entries(delta)) {
    if (deltaVal == null) continue;
    const baseVal = merged[key];

    if (Array.isArray(deltaVal)) {
      if (Array.isArray(baseVal)) {
        merged[key] = deduplicateArray([...baseVal, ...deltaVal]);
      } else {
        merged[key] = deltaVal;
      }
    } else if (key === "additionalProvisions" && typeof deltaVal === "string") {
      merged[key] = (typeof baseVal === "string" ? baseVal + "\n\n" : "") + deltaVal;
    } else if (typeof deltaVal === "object" && !Array.isArray(deltaVal)) {
      if (typeof baseVal === "object" && baseVal && !Array.isArray(baseVal)) {
        merged[key] = { ...(baseVal as Record<string, unknown>), ...(deltaVal as Record<string, unknown>) };
      } else {
        merged[key] = deltaVal;
      }
    } else {
      merged[key] = deltaVal;
    }
  }

  return merged;
}

export async function runPpmExtraction(
  apiKey: string,
  documents: CloDocument[],
): Promise<{ extractedConstraints: Record<string, unknown>; rawOutputs: Record<string, string> }> {
  const rawOutputs: Record<string, string> = {};

  // ── Pass 1: Full extraction (chunked for large PDFs) ──
  const extractPrompt = ppmExtractionPrompt();
  const pass1Chunked = await callAnthropicChunked(apiKey, extractPrompt.system, documents, extractPrompt.user, 64000);

  if (pass1Chunked.error) {
    throw new Error(pass1Chunked.error);
  }

  let extractedConstraints: Record<string, unknown> = {};
  let pass1Parsed = true;
  let anyTruncated = false;

  for (const chunkResult of pass1Chunked.results) {
    rawOutputs[`pass1_${chunkResult.chunkLabel}`] = chunkResult.text;
    if (chunkResult.truncated) anyTruncated = true;

    try {
      const raw = stripNulls(parseJsonResponse(chunkResult.text)) as Record<string, unknown>;
      const validated = extractedConstraintsSchema.parse(raw);
      extractedConstraints = Object.keys(extractedConstraints).length === 0
        ? validated
        : mergeExtraction(extractedConstraints, validated);
    } catch {
      if (pass1Chunked.results.length === 1) {
        extractedConstraints = { rawExtraction: chunkResult.text };
        pass1Parsed = false;
      }
    }
  }

  rawOutputs.pass1 = pass1Chunked.results.map((r) => r.text).join("\n\n---CHUNK_BOUNDARY---\n\n");

  if (anyTruncated) {
    extractedConstraints._extractionTruncated = true;
  }

  if (pass1Chunked.results.length > 1) {
    extractedConstraints._chunkedExtraction = true;
    extractedConstraints._chunkCount = pass1Chunked.results.length;
  }

  // ── Pass 2 & 3: Focused deep-dives ──
  if (pass1Parsed) {
    const firstPassJson = JSON.stringify(extractedConstraints, null, 2);

    const eligibilityPrompt = ppmDeepDiveEligibilityPrompt(firstPassJson);
    const structuralPrompt = ppmDeepDiveStructuralPrompt(firstPassJson);

    const [eligibilityChunked, structuralChunked] = await Promise.all([
      callAnthropicChunked(apiKey, eligibilityPrompt.system, documents, eligibilityPrompt.user, 32768),
      callAnthropicChunked(apiKey, structuralPrompt.system, documents, structuralPrompt.user, 32768),
    ]);

    for (const [i, chunked] of [eligibilityChunked, structuralChunked].entries()) {
      const passTexts: string[] = [];
      for (const chunkResult of chunked.results) {
        passTexts.push(chunkResult.text);
        try {
          const delta = stripNulls(parseJsonResponse(chunkResult.text)) as Record<string, unknown>;
          if (Object.keys(delta).length > 0) {
            extractedConstraints = mergeExtraction(extractedConstraints, delta);
          }
        } catch {
          // Deep-dive parse failed — keep what we have
        }
      }
      rawOutputs[`pass${i + 2}`] = passTexts.join("\n\n---CHUNK_BOUNDARY---\n\n");
    }
  }

  extractedConstraints._extractionPasses = pass1Parsed ? 3 : 1;

  return { extractedConstraints, rawOutputs };
}
