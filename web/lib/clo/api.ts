import type { CloDocument } from "./types";

interface AnthropicBlock { type: string; text?: string }

export function buildDocumentContent(
  documents: CloDocument[],
  userText: string,
): Array<Record<string, unknown>> {
  return [
    ...documents.map((doc) => {
      if (doc.type === "application/pdf") {
        return {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: doc.base64 },
        };
      }
      return {
        type: "image",
        source: { type: "base64", media_type: doc.type, data: doc.base64 },
      };
    }),
    { type: "text", text: userText },
  ];
}

export async function callAnthropic(
  apiKey: string,
  system: string,
  content: Array<Record<string, unknown>>,
  maxTokens: number,
): Promise<{ text: string; truncated: boolean; error?: string; status?: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    return { text: "", truncated: false, error: await response.text(), status: response.status };
  }

  const result = await response.json();
  const text = result.content
    ?.filter((block: AnthropicBlock) => block.type === "text")
    ?.map((block: AnthropicBlock) => block.text)
    ?.join("\n") || "";
  const truncated = result.stop_reason !== "end_turn";

  return { text, truncated };
}

export function parseJsonResponse(text: string): Record<string, unknown> {
  // Find the outermost JSON object, handling nested braces correctly
  const start = text.indexOf("{");
  if (start === -1) return {};

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  return {};
}

export function normalizeClassName(name: string): string {
  return name
    .replace(/^class\s+/i, "")
    .replace(/[\s-]+/g, "-")
    .toUpperCase();
}
