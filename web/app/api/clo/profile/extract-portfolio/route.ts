import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { portfolioExtractionPrompt } from "@/worker/clo-prompts";
import { callAnthropicChunked, parseJsonResponse } from "@/lib/clo/api";

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

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<{
    id: string;
    documents: Array<{ name: string; type: string; size: number; base64: string }>;
  }>(
    "SELECT id, documents FROM clo_profiles WHERE user_id = $1",
    [user.id]
  );

  if (profiles.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = profiles[0];
  const documents = profile.documents || [];

  if (documents.length === 0) {
    return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
  }

  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);
  const prompt = portfolioExtractionPrompt();

  const chunked = await callAnthropicChunked(apiKey, prompt.system, documents, prompt.user, 16384);

  if (chunked.error) {
    if (chunked.status === 401) {
      return NextResponse.json(
        { error: "Your API key is invalid or expired. Please update it in Settings." },
        { status: 401 }
      );
    }
    if (chunked.status === 429) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "API error", details: chunked.error },
      { status: chunked.status || 500 }
    );
  }

  let extractedPortfolio: Record<string, unknown> = {};

  for (const chunkResult of chunked.results) {
    try {
      const parsed = parseJsonResponse(chunkResult.text);
      extractedPortfolio = Object.keys(extractedPortfolio).length === 0
        ? parsed
        : mergePortfolio(extractedPortfolio, parsed);
    } catch {
      if (chunked.results.length === 1) {
        return NextResponse.json(
          { error: "Failed to parse extraction result", raw: chunkResult.text },
          { status: 500 }
        );
      }
    }
  }

  await query(
    `UPDATE clo_profiles
     SET extracted_portfolio = $1::jsonb, updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(extractedPortfolio), profile.id]
  );

  return NextResponse.json({ extractedPortfolio });
}
