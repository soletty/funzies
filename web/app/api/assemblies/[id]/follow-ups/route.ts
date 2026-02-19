import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { buildPrompt, FollowUpRequest, TopicFiles } from "@/lib/follow-up-prompts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;
  const body = await request.json();
  const { question, mode, characters, context, challenge, highlightedText } = body;

  if (!question || !mode || !context) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const assemblies = await query<{ raw_files: Record<string, string>; parsed_data: unknown }>(
    "SELECT raw_files, parsed_data FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, user.id]
  );

  if (!assemblies.length) {
    return NextResponse.json({ error: "Assembly not found" }, { status: 404 });
  }

  const rawFiles = assemblies[0].raw_files as Record<string, string>;
  const topicFiles: TopicFiles = {
    charactersContent: rawFiles["characters.md"] || "",
    synthesisContent: rawFiles["synthesis.md"] || "",
    referenceLibraryContent: rawFiles["reference-library.md"] || "",
    iterationSyntheses: Object.entries(rawFiles)
      .filter(([k]) => k.includes("iteration") && k.includes("synthesis"))
      .map(([k, v]) => `\n--- ${k} ---\n${v}`)
      .join("\n"),
  };

  const followUpRequest: FollowUpRequest = {
    question,
    mode,
    characters: characters || [],
    context,
    challenge,
    highlightedText,
  };

  const prompt = buildPrompt(followUpRequest, topicFiles);
  if (!prompt) {
    return NextResponse.json({ error: "Could not build prompt" }, { status: 400 });
  }

  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: prompt,
      messages: [{ role: "user", content: question }],
      stream: true,
    }),
  });

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    if (anthropicResponse.status === 401) {
      return NextResponse.json(
        { error: "Your API key is invalid or expired. Please update it in Settings." },
        { status: 401 }
      );
    }
    if (anthropicResponse.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by Anthropic. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Anthropic API error", details: errorText },
      { status: anthropicResponse.status }
    );
  }

  const reader = anthropicResponse.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "No response stream" }, { status: 500 });
  }

  let fullText = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          let event;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
            );
          }
        }
      }

      await query(
        `INSERT INTO follow_ups (id, assembly_id, user_id, question, mode, is_challenge, context_page, context_section, highlighted_text, response_md)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          assemblyId,
          user.id,
          question,
          mode,
          challenge || false,
          context.page,
          context.section || null,
          highlightedText || null,
          fullText,
        ]
      );

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assemblyId } = await params;

  const followUps = await query(
    "SELECT * FROM follow_ups WHERE assembly_id = $1 ORDER BY created_at DESC",
    [assemblyId]
  );

  return NextResponse.json(followUps);
}
