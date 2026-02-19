import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { deliverableEvolutionPrompt } from "@/worker/prompts";
import type { Topic, Deliverable, FollowUpInsight } from "@/lib/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

  const assemblies = await query<{
    raw_files: Record<string, string>;
    parsed_data: Topic;
    topic_input: string;
  }>(
    "SELECT raw_files, parsed_data, topic_input FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );

  if (!assemblies.length) {
    return NextResponse.json({ error: "Assembly not found" }, { status: 404 });
  }

  const { raw_files, parsed_data, topic_input } = assemblies[0];

  const insightRows = await query<{ id: string; insight: FollowUpInsight }>(
    `SELECT id, insight FROM follow_ups
     WHERE assembly_id = $1 AND insight->>'hasInsight' = 'true'
     ORDER BY created_at ASC`,
    [assemblyId]
  );

  if (insightRows.length === 0) {
    return NextResponse.json(
      { error: "No insights available to evolve from" },
      { status: 400 }
    );
  }

  const currentDeliverables = parsed_data.deliverables || [];
  const latestVersion = currentDeliverables.length;
  const latestDeliverable = currentDeliverables[latestVersion - 1];

  if (!latestDeliverable) {
    return NextResponse.json({ error: "No existing deliverable to evolve" }, { status: 400 });
  }

  const synthesis = raw_files["synthesis.md"] || "";
  const insightSummaries = insightRows.map((r) => r.insight.summary);
  const insightIds = insightRows.map((r) => r.id);

  const prompt = deliverableEvolutionPrompt(
    topic_input,
    latestDeliverable.content,
    insightSummaries,
    synthesis
  );

  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "Anthropic API error", details: errorText },
      { status: response.status }
    );
  }

  const data = await response.json();
  const evolvedContent = data.content?.[0]?.text;
  if (!evolvedContent) {
    return NextResponse.json({ error: "Empty response from API" }, { status: 500 });
  }

  const newVersion = latestVersion + 1;
  const newDeliverable: Deliverable = {
    slug: `deliverable-v${newVersion}`,
    title: `${latestDeliverable.title} (v${newVersion})`,
    content: evolvedContent,
    version: newVersion,
    createdAt: new Date().toISOString(),
    basedOnInsights: insightIds,
  };

  const fileKey = `deliverable-v${newVersion}.md`;
  const updatedRawFiles = { ...raw_files, [fileKey]: evolvedContent };
  const updatedDeliverables = [...currentDeliverables, newDeliverable];

  // Tag v1 if not already versioned
  if (updatedDeliverables[0] && !updatedDeliverables[0].version) {
    updatedDeliverables[0] = {
      ...updatedDeliverables[0],
      version: 1,
    };
  }

  const updatedParsedData = {
    ...parsed_data,
    deliverables: updatedDeliverables,
  };

  await query(
    "UPDATE assemblies SET raw_files = $1, parsed_data = $2 WHERE id = $3",
    [JSON.stringify(updatedRawFiles), JSON.stringify(updatedParsedData), assemblyId]
  );

  return NextResponse.json({ deliverable: newDeliverable, version: newVersion });
}
