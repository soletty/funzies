import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { ppmExtractionPrompt, ppmDeepDiveEligibilityPrompt, ppmDeepDiveStructuralPrompt } from "@/worker/clo-prompts";
import { buildDocumentContent, callAnthropic, parseJsonResponse } from "@/lib/clo/api";
import { extractedConstraintsSchema } from "./schema";

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

    // Arrays: concatenate and deduplicate
    if (Array.isArray(deltaVal)) {
      if (Array.isArray(baseVal)) {
        merged[key] = deduplicateArray([...baseVal, ...deltaVal]);
      } else {
        merged[key] = deltaVal;
      }
    }
    // additionalProvisions: append text
    else if (key === "additionalProvisions" && typeof deltaVal === "string") {
      merged[key] = (typeof baseVal === "string" ? baseVal + "\n\n" : "") + deltaVal;
    }
    // Objects: merge keys (delta wins on conflicts)
    else if (typeof deltaVal === "object" && !Array.isArray(deltaVal)) {
      if (typeof baseVal === "object" && baseVal && !Array.isArray(baseVal)) {
        merged[key] = { ...(baseVal as Record<string, unknown>), ...(deltaVal as Record<string, unknown>) };
      } else {
        merged[key] = deltaVal;
      }
    }
    // Primitives: delta overrides (it's a correction)
    else {
      merged[key] = deltaVal;
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
  const rawOutputs: Record<string, string> = {};

  // ── Pass 1: Full extraction ──
  const extractPrompt = ppmExtractionPrompt();
  const pass1Content = buildDocumentContent(documents, extractPrompt.user);
  const pass1 = await callAnthropic(apiKey, extractPrompt.system, pass1Content, 65536);

  if (pass1.error) {
    if (pass1.status === 401) {
      return NextResponse.json(
        { error: "Your API key is invalid or expired. Please update it in Settings." },
        { status: 401 }
      );
    }
    if (pass1.status === 429) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "API error", details: pass1.error },
      { status: pass1.status || 500 }
    );
  }

  rawOutputs.pass1 = pass1.text;
  let extractedConstraints: Record<string, unknown>;
  let pass1Parsed = true;

  try {
    const raw = parseJsonResponse(pass1.text);
    extractedConstraints = extractedConstraintsSchema.parse(raw);
  } catch {
    extractedConstraints = { rawExtraction: pass1.text };
    pass1Parsed = false;
  }

  if (pass1.truncated) {
    extractedConstraints._extractionTruncated = true;
  }

  // ── Pass 2 & 3: Focused deep-dives (skip if Pass 1 failed to parse) ──
  if (pass1Parsed) {
    const firstPassJson = JSON.stringify(extractedConstraints, null, 2);

    const eligibilityPrompt = ppmDeepDiveEligibilityPrompt(firstPassJson);
    const structuralPrompt = ppmDeepDiveStructuralPrompt(firstPassJson);

    const [eligibilityPass, structuralPass] = await Promise.all([
      callAnthropic(apiKey, eligibilityPrompt.system, buildDocumentContent(documents, eligibilityPrompt.user), 32768),
      callAnthropic(apiKey, structuralPrompt.system, buildDocumentContent(documents, structuralPrompt.user), 32768),
    ]);

    for (const [i, pass] of [eligibilityPass, structuralPass].entries()) {
      rawOutputs[`pass${i + 2}`] = pass.text;
      if (!pass.error && pass.text) {
        try {
          const delta = parseJsonResponse(pass.text);
          if (Object.keys(delta).length > 0) {
            extractedConstraints = mergeExtraction(extractedConstraints, delta);
          }
        } catch {
          // Deep-dive parse failed — keep what we have, not fatal
        }
      }
    }
  }

  extractedConstraints._extractionPasses = pass1Parsed ? 3 : 1;

  await query(
    `UPDATE clo_profiles
     SET extracted_constraints = $1::jsonb,
         ppm_raw_extraction = $2::jsonb,
         ppm_extracted_at = now(),
         updated_at = now()
     WHERE id = $3`,
    [JSON.stringify(extractedConstraints), JSON.stringify(rawOutputs), profile.id]
  );

  return NextResponse.json({ extractedConstraints });
}
