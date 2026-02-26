import { callAnthropicChunked, parseJsonResponse } from "../api";
import { portfolioExtractionPrompt } from "../../../worker/clo-prompts";
import type { CloDocument } from "../types";

function mergePortfolio(
  base: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base };

  for (const [key, val] of Object.entries(delta)) {
    if (val == null) continue;
    const baseVal = merged[key];

    if (Array.isArray(val) && Array.isArray(baseVal)) {
      merged[key] = [...baseVal, ...val];
    } else if (typeof val === "object" && !Array.isArray(val) && typeof baseVal === "object" && baseVal && !Array.isArray(baseVal)) {
      merged[key] = mergePortfolio(baseVal as Record<string, unknown>, val as Record<string, unknown>);
    } else if (merged[key] == null) {
      merged[key] = val;
    }
  }

  return merged;
}

export async function runPortfolioExtraction(
  apiKey: string,
  documents: CloDocument[],
): Promise<Record<string, unknown>> {
  const prompt = portfolioExtractionPrompt();
  const chunked = await callAnthropicChunked(apiKey, prompt.system, documents, prompt.user, 16384);

  if (chunked.error) {
    throw new Error(chunked.error);
  }

  let extractedPortfolio: Record<string, unknown> = {};

  for (const chunkResult of chunked.results) {
    const parsed = parseJsonResponse(chunkResult.text);
    extractedPortfolio = Object.keys(extractedPortfolio).length === 0
      ? parsed
      : mergePortfolio(extractedPortfolio, parsed);
  }

  return extractedPortfolio;
}
