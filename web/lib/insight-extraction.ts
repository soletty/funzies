import { query } from "@/lib/db";
import type { FollowUpInsight } from "@/lib/types";
import { buildInsightExtractionPrompt } from "@/lib/follow-up-prompts";

export async function extractInsight(
  followUpId: string,
  assemblyId: string,
  apiKey: string
): Promise<void> {
  const [followUp] = await query<{ response_md: string; question: string }>(
    "SELECT response_md, question FROM follow_ups WHERE id = $1",
    [followUpId]
  );
  if (!followUp?.response_md) return;

  const [assembly] = await query<{ raw_files: Record<string, string> }>(
    "SELECT raw_files FROM assemblies WHERE id = $1",
    [assemblyId]
  );
  if (!assembly) return;

  const synthesis = assembly.raw_files["synthesis.md"] || "";
  if (!synthesis) return;

  const prompt = buildInsightExtractionPrompt(synthesis, followUp.question, followUp.response_md);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) return;

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) return;

  let insight: FollowUpInsight;
  try {
    insight = JSON.parse(text);
  } catch {
    return;
  }

  if (typeof insight.hasInsight !== "boolean") return;

  await query(
    "UPDATE follow_ups SET insight = $1 WHERE id = $2",
    [JSON.stringify(insight), followUpId]
  );
}
