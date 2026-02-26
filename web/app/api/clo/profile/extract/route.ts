import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { ppmExtractionPrompt } from "@/worker/clo-prompts";

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
  const prompt = ppmExtractionPrompt();

  const content: Array<Record<string, unknown>> = [
    ...documents.map((doc) => {
      if (doc.type === "application/pdf") {
        return {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: doc.base64,
          },
        };
      }
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: doc.type,
          data: doc.base64,
        },
      };
    }),
    { type: "text", text: prompt.user },
  ];

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: prompt.system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!anthropicResponse.ok) {
    if (anthropicResponse.status === 401) {
      return NextResponse.json(
        { error: "Your API key is invalid or expired. Please update it in Settings." },
        { status: 401 }
      );
    }
    if (anthropicResponse.status === 429) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const errorText = await anthropicResponse.text();
    return NextResponse.json(
      { error: "API error", details: errorText },
      { status: anthropicResponse.status }
    );
  }

  const result = await anthropicResponse.json();
  const responseText = result.content
    ?.filter((block: { type: string }) => block.type === "text")
    ?.map((block: { text: string }) => block.text)
    ?.join("\n") || "";

  let extractedConstraints;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    extractedConstraints = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    extractedConstraints = { rawExtraction: responseText };
  }

  await query(
    `UPDATE clo_profiles
     SET extracted_constraints = $1::jsonb, updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(extractedConstraints), profile.id]
  );

  return NextResponse.json({ extractedConstraints });
}
