import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { verifyPanelAccess } from "@/lib/clo/access";
import { processAnthropicStream } from "@/lib/claude-stream";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { panelId, dealContext } = body;

  if (!panelId) {
    return NextResponse.json({ error: "Missing panelId" }, { status: 400 });
  }

  const hasAccess = await verifyPanelAccess(panelId, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);

  const systemPrompt = `You are a CLO data quality analyst. Analyze the provided deal data and identify issues that could affect waterfall projection accuracy.

Check for:
1. Missing required fields needed for the waterfall model (maturity date, tranche balances, spreads, OC/IC trigger levels)
2. Cross-reference values for consistency (total tranche principal vs pool total par, test levels matching PPM data)
3. Anything that looks unusual for a CLO deal (e.g., abnormally low/high WAC spread, missing tranches, zero balances)
4. Missing waterfall steps or compliance test data

Output a JSON array of warnings. Each warning must have:
- "severity": "error" (blocking — model can't run), "warning" (model runs but may be wrong), or "info" (FYI)
- "message": brief description of the issue
- "action": what the user should do to fix it

Only output the JSON array, nothing else. If no issues found, output an empty array [].
Keep it concise — at most 5-6 warnings for the most important issues.`;

  const contextSummary = JSON.stringify(dealContext, null, 2).slice(0, 8000);

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: `Analyze this CLO deal data for quality issues:\n\n${contextSummary}` }],
      stream: true,
    }),
  });

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    return NextResponse.json(
      { error: "API error", details: errorText },
      { status: anthropicResponse.status }
    );
  }

  const reader = anthropicResponse.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "No response stream" }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      await processAnthropicStream(reader, controller, encoder);
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
