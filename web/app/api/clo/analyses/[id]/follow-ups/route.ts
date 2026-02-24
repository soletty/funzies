import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { verifyAnalysisAccess } from "@/lib/clo/access";
import type { PanelMember } from "@/lib/clo/types";

function buildFollowUpPrompt(
  question: string,
  mode: string,
  targetMember: string | undefined,
  analysis: {
    title: string;
    borrower_name: string;
    raw_files: Record<string, string>;
    parsed_data: Record<string, unknown>;
  },
  members: PanelMember[],
  profile: { fund_strategy: string; risk_appetite: string }
): string {
  const memoContent = analysis.raw_files?.["memo.md"] || "";
  const riskContent = analysis.raw_files?.["risk-assessment.md"] || "";
  const debateContent = analysis.raw_files?.["debate.md"] || "";
  const recommendationContent = analysis.raw_files?.["recommendation.md"] || "";

  const memberProfiles = members
    .map(
      (m) =>
        `**${m.name}** (${m.role}): ${m.background}\nSpecializations: ${m.specializations.join(", ")}\nRisk personality: ${m.riskPersonality}`
    )
    .join("\n\n");

  let modeInstruction = "";
  if (mode === "ask-member" && targetMember) {
    const member = members.find((m) => m.name === targetMember);
    modeInstruction = `Respond ONLY as ${targetMember}. ${member ? `Role: ${member.role}. Specializations: ${member.specializations.join(", ")}. Investment philosophy: ${member.investmentPhilosophy}.` : ""}`;
  } else if (mode === "debate") {
    modeInstruction = `Run a structured debate among 3-4 panel members most relevant to the question. Each member should take a clear position, then challenge each other directly. End with a synthesis of convergence and divergence.`;
  } else {
    modeInstruction = `Respond as the full panel. Choose 2-4 members most relevant to the question. Each should give their perspective, with specific reasoning. Members may agree or disagree.`;
  }

  return `You are an AI credit analysis panel conducting follow-up analysis.

CLO PORTFOLIO PROFILE:
Fund strategy: ${profile.fund_strategy}
Risk appetite: ${profile.risk_appetite}

PANEL MEMBERS:
${memberProfiles}

CREDIT ANALYSIS: ${analysis.title}
Borrower: ${analysis.borrower_name}

CONTEXT (prior analysis):
${memoContent ? `CREDIT MEMO:\n${memoContent}\n` : ""}
${riskContent ? `RISK ASSESSMENT:\n${riskContent}\n` : ""}
${debateContent ? `DEBATE:\n${debateContent}\n` : ""}
${recommendationContent ? `RECOMMENDATION:\n${recommendationContent}\n` : ""}

MODE: ${modeInstruction}

FORMAT:
Start each member's response with their full name in bold: **Name:** followed by their response.
Be substantive and specific. Reference the prior analysis where relevant.
Answer the question directly -- no throat-clearing or framework restatement.

QUALITY RULES:
- SOURCE HONESTY: Never fabricate data, studies, statistics, or citations. If you don't have hard data, say "based on professional judgment" or "in my experience."
- STAY ON THE QUESTION: >80% of your response must directly address what was asked. No preamble, no framework restatement unless it changes the answer.
- PRACTICAL OUTPUT: This is for real credit decisions. Be specific, actionable, and concrete.
- PLAINTEXT TEST: If you strip all jargon from a sentence and it says nothing, delete it.
- Each panel member must stay in character with their established philosophy and risk personality.`;
}

function buildMessages(
  history: { role: string; content: string }[] | undefined,
  question: string
): { role: "user" | "assistant"; content: string }[] {
  if (!history || history.length === 0) {
    return [{ role: "user", content: question }];
  }

  const prior = history.filter((_, i) => !(i === history.length - 1 && history[i].role === "user" && history[i].content === question));

  const capped = prior.slice(-10);
  const startIdx = capped.findIndex((m) => m.role === "user");
  const trimmed = startIdx >= 0 ? capped.slice(startIdx) : capped;

  const messages: { role: "user" | "assistant"; content: string }[] = trimmed.map((m) => ({
    role: m.role === "assistant" ? "assistant" as const : "user" as const,
    content: m.content,
  }));

  messages.push({ role: "user", content: question });
  return messages;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await verifyAnalysisAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const followUps = await query(
    "SELECT * FROM clo_follow_ups WHERE analysis_id = $1 ORDER BY created_at ASC",
    [id]
  );

  return NextResponse.json(followUps);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await verifyAnalysisAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { question, mode, targetMember, history } = body;

  if (!question || !mode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const analyses = await query<{
    title: string;
    borrower_name: string;
    panel_id: string;
    raw_files: Record<string, string>;
    parsed_data: Record<string, unknown>;
    dynamic_specialists: PanelMember[];
  }>(
    "SELECT title, borrower_name, panel_id, raw_files, parsed_data, dynamic_specialists FROM clo_analyses WHERE id = $1",
    [id]
  );

  if (analyses.length === 0) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const analysis = analyses[0];

  const panels = await query<{
    members: PanelMember[];
    profile_id: string;
  }>(
    "SELECT members, profile_id FROM clo_panels WHERE id = $1",
    [analysis.panel_id]
  );

  if (panels.length === 0) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const profiles = await query<{
    fund_strategy: string;
    risk_appetite: string;
  }>(
    "SELECT fund_strategy, risk_appetite FROM clo_profiles WHERE id = $1",
    [panels[0].profile_id]
  );

  const standingMembers = (panels[0].members || []) as PanelMember[];
  const dynamicSpecialists = (analysis.dynamic_specialists || []) as PanelMember[];
  const members = [...standingMembers, ...dynamicSpecialists];
  const profile = profiles[0] || { fund_strategy: "", risk_appetite: "" };

  const systemPrompt = buildFollowUpPrompt(
    question,
    mode,
    targetMember,
    analysis,
    members,
    profile
  );

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
      system: systemPrompt,
      messages: buildMessages(history, question),
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
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "API error", details: errorText },
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

      try {
        await query(
          `INSERT INTO clo_follow_ups (analysis_id, question, mode, target_member, response_md)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, question, mode, targetMember || null, fullText]
        );
      } catch (err) {
        console.error("[clo/follow-ups] Failed to persist follow-up:", err);
      }

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
