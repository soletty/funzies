# CLO Interactive Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add individual member profile pages and panel-level chat to the CLO flow, matching the interactivity of the IC/Assembly flow.

**Architecture:** Mirror the IC character page pattern (`/assembly/[slug]/characters/[num]`) for CLO at `/clo/panel/[num]`. Create a CLO-specific FollowUpModal that hits a new panel-level follow-up API. The API reuses the existing prompt-building pattern from the analysis follow-up route but makes analysis context optional.

**Tech Stack:** Next.js (App Router), React, Anthropic streaming API, PostgreSQL, marked (markdown rendering)

---

### Task 1: Schema Migration — Make analysis_id nullable, add panel_id

**Files:**
- Modify: `web/lib/schema.sql` (append at end, ~line 845)

**Step 1: Add the migration SQL**

Append to the end of `web/lib/schema.sql`:

```sql
-- CLO panel-level follow-ups (no analysis required)
ALTER TABLE clo_follow_ups ALTER COLUMN analysis_id DROP NOT NULL;
ALTER TABLE clo_follow_ups ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES clo_panels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clo_follow_ups_panel ON clo_follow_ups(panel_id);
```

**Step 2: Run the migration**

Run: `psql $DATABASE_URL -f web/lib/schema.sql`
Expected: Completes with no errors (existing tables get IF NOT EXISTS skipped, new ALTERs apply)

**Step 3: Commit**

```bash
git add web/lib/schema.sql
git commit -m "feat(clo): make follow-up analysis_id nullable and add panel_id for panel-level chat"
```

---

### Task 2: Add verifyPanelAccess helper

**Files:**
- Modify: `web/lib/clo/access.ts` (after `verifyScreeningAccess`, ~line 160)

**Step 1: Add the function**

Add after `verifyScreeningAccess` in `web/lib/clo/access.ts`:

```typescript
export async function verifyPanelAccess(panelId: string, userId: string) {
  const rows = await query<{ id: string }>(
    `SELECT p.id FROM clo_panels p
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE p.id = $1 AND pr.user_id = $2`,
    [panelId, userId]
  );
  return rows.length > 0;
}
```

**Step 2: Commit**

```bash
git add web/lib/clo/access.ts
git commit -m "feat(clo): add verifyPanelAccess helper for panel-level API routes"
```

---

### Task 3: Panel-Level Follow-Up API Route

**Files:**
- Create: `web/app/api/clo/panels/[id]/follow-ups/route.ts`

**Context:** This route follows the same pattern as `web/app/api/clo/analyses/[id]/follow-ups/route.ts` but makes analysis context optional. The existing analysis follow-up route builds a system prompt with: fund profile, member profiles, constraints, analysis raw files (memo, risk, debate, recommendation), and mode instructions. Our new route reuses the same prompt structure but the analysis section is only included when `analysisId` is provided in the request body.

**Step 1: Create the route file**

Create `web/app/api/clo/panels/[id]/follow-ups/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { verifyPanelAccess } from "@/lib/clo/access";
import type { PanelMember } from "@/lib/clo/types";
import { WEB_SEARCH_TOOL, processAnthropicStream } from "@/lib/claude-stream";
import { getLatestBriefing } from "@/lib/briefing";
import { fitDocumentsToPageLimit } from "@/lib/clo/pdf-chunking";

interface FullProfile {
  fund_strategy: string;
  risk_appetite: string;
  target_sectors: string;
  concentration_limits: string;
  rating_thresholds: string;
  spread_targets: string;
  reinvestment_period: string;
  portfolio_description: string;
  beliefs_and_biases: string;
  extracted_constraints: Record<string, unknown>;
  documents: Array<{ name: string; type: string; base64: string }>;
}

function buildPanelFollowUpPrompt(
  mode: string,
  targetMember: string | undefined,
  members: PanelMember[],
  profile: FullProfile,
  analysis?: {
    title: string;
    borrower_name: string;
    raw_files: Record<string, string>;
  }
): string {
  const memberProfiles = members
    .map(
      (m) =>
        `**${m.name}** (${m.role}): ${m.background}\nSpecializations: ${m.specializations.join(", ")}\nRisk personality: ${m.riskPersonality}\nInvestment philosophy: ${m.investmentPhilosophy}`
    )
    .join("\n\n");

  const constraints = profile.extracted_constraints || {};
  const constraintsSection = Object.keys(constraints).length > 0
    ? `\nEXTRACTED VEHICLE CONSTRAINTS:\n${JSON.stringify(constraints, null, 2)}\n`
    : "";

  let modeInstruction = "";
  if (mode === "ask-member" && targetMember) {
    const member = members.find((m) => m.name === targetMember);
    modeInstruction = `Respond ONLY as ${targetMember}. ${member ? `Role: ${member.role}. Specializations: ${member.specializations.join(", ")}. Investment philosophy: ${member.investmentPhilosophy}. Decision style: ${member.decisionStyle}. Risk personality: ${member.riskPersonality}.` : ""}`;
  } else if (mode === "debate") {
    modeInstruction = `Run a structured debate among 3-4 panel members most relevant to the question. Each member should take a clear position, then challenge each other directly. End with a synthesis of convergence and divergence.`;
  } else {
    modeInstruction = `Respond as the full panel. Choose 2-4 members most relevant to the question. Each should give their perspective, with specific reasoning. Members may agree or disagree.`;
  }

  let analysisSection = "";
  if (analysis) {
    const memoContent = analysis.raw_files?.["memo.md"] || "";
    const riskContent = analysis.raw_files?.["risk-assessment.md"] || "";
    const debateContent = analysis.raw_files?.["debate.md"] || "";
    const recommendationContent = analysis.raw_files?.["recommendation.md"] || "";
    analysisSection = `
CREDIT ANALYSIS: ${analysis.title}
Borrower: ${analysis.borrower_name}

CONTEXT (prior analysis):
${memoContent ? `CREDIT MEMO:\n${memoContent}\n` : ""}
${riskContent ? `RISK ASSESSMENT:\n${riskContent}\n` : ""}
${debateContent ? `DEBATE:\n${debateContent}\n` : ""}
${recommendationContent ? `RECOMMENDATION:\n${recommendationContent}\n` : ""}`;
  }

  return `You are an AI credit analysis panel.

CLO PORTFOLIO PROFILE:
Fund strategy: ${profile.fund_strategy}
Risk appetite: ${profile.risk_appetite}
Target sectors: ${profile.target_sectors || "Not specified"}
Concentration limits: ${profile.concentration_limits || "Not specified"}
Rating thresholds: ${profile.rating_thresholds || "Not specified"}
Spread targets: ${profile.spread_targets || "Not specified"}
Reinvestment period: ${profile.reinvestment_period || "Not specified"}
Portfolio description: ${profile.portfolio_description || "Not specified"}
Beliefs & biases: ${profile.beliefs_and_biases || "Not specified"}
${constraintsSection}
PANEL MEMBERS:
${memberProfiles}
${analysisSection}
MODE: ${modeInstruction}

FORMAT:
Start each member's response with their full name in bold: **Name:** followed by their response.
Be substantive and specific.${analysis ? " Reference the prior analysis where relevant." : ""}
Answer the question directly -- no throat-clearing or framework restatement.

QUALITY RULES:
- SOURCE HONESTY: Never fabricate data, studies, statistics, or citations. If you don't have hard data, say "based on professional judgment" or "in my experience."
- STAY ON THE QUESTION: >80% of your response must directly address what was asked. No preamble, no framework restatement unless it changes the answer.
- PRACTICAL OUTPUT: This is for real credit decisions. Be specific, actionable, and concrete.
- PLAINTEXT TEST: If you strip all jargon from a sentence and it says nothing, delete it.
- WEB SEARCH: You have web search available. Use it to verify claims, check recent news about borrowers or sectors, and find current market data. Cite sources.
- Each panel member must stay in character with their established philosophy and risk personality.`;
}

function buildMessages(
  history: { role: string; content: string }[] | undefined,
  question: string
): { role: "user" | "assistant"; content: string }[] {
  if (!history || history.length === 0) {
    return [{ role: "user", content: question }];
  }

  const capped = history.slice(-10);
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
  const hasAccess = await verifyPanelAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const followUps = await query(
    "SELECT * FROM clo_follow_ups WHERE panel_id = $1 ORDER BY created_at ASC",
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
  const hasAccess = await verifyPanelAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { question, mode, targetMember, analysisId, history } = body;

  if (!question || !mode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const panels = await query<{
    members: PanelMember[];
    profile_id: string;
  }>(
    "SELECT members, profile_id FROM clo_panels WHERE id = $1",
    [id]
  );

  if (panels.length === 0) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const members = (panels[0].members || []) as PanelMember[];

  const profiles = await query<FullProfile>(
    `SELECT fund_strategy, risk_appetite, target_sectors, concentration_limits,
            rating_thresholds, spread_targets, reinvestment_period,
            portfolio_description, beliefs_and_biases,
            extracted_constraints, documents
     FROM clo_profiles WHERE id = $1`,
    [panels[0].profile_id]
  );

  const profile: FullProfile = profiles[0] || {
    fund_strategy: "", risk_appetite: "", target_sectors: "",
    concentration_limits: "", rating_thresholds: "", spread_targets: "",
    reinvestment_period: "", portfolio_description: "", beliefs_and_biases: "",
    extracted_constraints: {}, documents: [],
  };

  // Optionally load analysis context
  let analysis: { title: string; borrower_name: string; raw_files: Record<string, string> } | undefined;
  if (analysisId) {
    const analyses = await query<{
      title: string;
      borrower_name: string;
      raw_files: Record<string, string>;
      dynamic_specialists: PanelMember[];
    }>(
      "SELECT title, borrower_name, raw_files, dynamic_specialists FROM clo_analyses WHERE id = $1 AND panel_id = $2",
      [analysisId, id]
    );
    if (analyses.length > 0) {
      analysis = analyses[0];
      // Add dynamic specialists to members list
      const dynamicSpecialists = (analyses[0].dynamic_specialists || []) as PanelMember[];
      members.push(...dynamicSpecialists);
    }
  }

  const briefing = await getLatestBriefing();
  const briefingSection = briefing
    ? `\n\nMARKET INTELLIGENCE (today's briefing — reference when relevant, do not repeat verbatim):\n${briefing}`
    : "";
  const systemPrompt =
    buildPanelFollowUpPrompt(mode, targetMember, members, profile, analysis) +
    briefingSection;

  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);

  const builtMessages = buildMessages(history, question);
  const cloDocuments = await fitDocumentsToPageLimit(profile.documents || []);
  if (cloDocuments.length > 0 && builtMessages.length > 0) {
    const firstUserIdx = builtMessages.findIndex((m) => m.role === "user");
    if (firstUserIdx >= 0) {
      const docBlocks = cloDocuments.map((doc: { type: string; base64: string }) => {
        if (doc.type === "application/pdf") {
          return {
            type: "document" as const,
            source: { type: "base64" as const, media_type: "application/pdf" as const, data: doc.base64 },
          };
        }
        return {
          type: "image" as const,
          source: { type: "base64" as const, media_type: doc.type as "image/jpeg", data: doc.base64 },
        };
      });
      (builtMessages[0] as { role: string; content: unknown }).content = [
        ...docBlocks,
        { type: "text" as const, text: builtMessages[firstUserIdx].content as string },
      ];
    }
  }

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
      messages: builtMessages,
      stream: true,
      tools: [WEB_SEARCH_TOOL],
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const fullText = await processAnthropicStream(reader, controller, encoder);

      try {
        await query(
          `INSERT INTO clo_follow_ups (panel_id, analysis_id, question, mode, target_member, response_md)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, analysisId || null, question, mode, targetMember || null, fullText]
        );
      } catch (err) {
        console.error("[clo/panel-follow-ups] Failed to persist follow-up:", err);
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
```

**Step 2: Verify file compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit web/app/api/clo/panels/\[id\]/follow-ups/route.ts 2>&1 | head -20`
Expected: No type errors (or only pre-existing ones)

**Step 3: Commit**

```bash
git add web/app/api/clo/panels/\[id\]/follow-ups/route.ts
git commit -m "feat(clo): add panel-level follow-up API route with optional analysis context"
```

---

### Task 4: CLO FollowUpModal Component

**Files:**
- Create: `web/components/clo/FollowUpModal.tsx`

**Context:** This mirrors `web/components/FollowUpModal.tsx` (IC version) but adapted for CLO. Key differences: no assembly context, no attachment widget, no challenge button, adds analysis picker dropdown, hits `/api/clo/panels/[panelId]/follow-ups`.

**Step 1: Create the component**

Create `web/components/clo/FollowUpModal.tsx`:

```typescript
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { marked } from "marked";
import type { PanelMember } from "@/lib/clo/types";

type Mode = "ask-panel" | "ask-member" | "debate";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnalysisOption {
  id: string;
  title: string;
  borrowerName: string;
}

interface CloFollowUpModalProps {
  panelId: string;
  members: PanelMember[];
  defaultMember?: string;
  pageType: "member" | "panel";
  analyses?: AnalysisOption[];
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSpeakerBlocks(
  content: string,
  members: PanelMember[]
): { speaker: string; content: string }[] {
  const memberNames = members.map((m) => m.name);
  if (memberNames.length === 0) {
    return [{ speaker: "", content }];
  }
  const pattern = new RegExp(`\\*\\*(${memberNames.map(escapeRegex).join("|")}):\\*\\*`, "g");

  const blocks: { speaker: string; content: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const preceding = content.slice(lastIndex, match.index).trim();
      if (preceding && blocks.length === 0) {
        blocks.push({ speaker: "", content: preceding });
      } else if (preceding && blocks.length > 0) {
        blocks[blocks.length - 1].content += "\n\n" + preceding;
      }
    }
    blocks.push({ speaker: match[1], content: "" });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (blocks.length > 0) {
      blocks[blocks.length - 1].content += remaining;
    } else {
      blocks.push({ speaker: "", content: remaining });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ speaker: "", content });
  }

  return blocks;
}

export default function CloFollowUpModal({
  panelId,
  members,
  defaultMember,
  pageType,
  analyses = [],
}: CloFollowUpModalProps) {
  const isCharacterPage = pageType === "member" && !!defaultMember;

  const [mode, setMode] = useState<Mode>(isCharacterPage ? "ask-member" : "ask-panel");
  const [selectedMember, setSelectedMember] = useState(defaultMember || members[0]?.name || "");
  const [selectedAnalysis, setSelectedAnalysis] = useState("");
  const [question, setQuestion] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    fetch(`/api/clo/panels/${panelId}/follow-ups`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const msgs: ChatMessage[] = [];
          for (const fu of data) {
            msgs.push({ role: "user", content: fu.question });
            if (fu.response_md) msgs.push({ role: "assistant", content: fu.response_md });
          }
          setMessages(msgs);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [panelId]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const handleScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (threadRef.current && isNearBottomRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const activeMode = isCharacterPage ? "ask-member" : mode;

  async function handleSubmit() {
    if (!question.trim() || isStreaming) return;

    const userMessage = question.trim();
    setQuestion("");
    setIsStreaming(true);

    const updatedMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    const body = {
      question: userMessage,
      mode: activeMode,
      targetMember: activeMode === "ask-member" ? selectedMember : undefined,
      analysisId: selectedAnalysis || undefined,
      history,
    };

    const res = await fetch(`/api/clo/panels/${panelId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: Failed to get response" }]);
      setIsStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "searching") {
            setIsSearching(true);
          }
          if (data.type === "text") {
            setIsSearching(false);
            accumulated += data.content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length === updatedMessages.length + 1) {
                return [...prev.slice(0, -1), { role: "assistant", content: accumulated }];
              }
              return [...prev, { role: "assistant", content: accumulated }];
            });
          }
          if (data.type === "done") {
            setIsStreaming(false);
          }
        } catch {
          // skip malformed events
        }
      }
    }

    setIsStreaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function renderAssistantMessage(content: string) {
    const blocks = parseSpeakerBlocks(content, members);
    if (blocks.length === 1 && !blocks[0].speaker) {
      return (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{
            __html: marked.parse(content, { async: false }) as string,
          }}
        />
      );
    }
    return blocks.map((block, i) => {
      if (!block.speaker) {
        return (
          <div key={i} className="markdown-content" dangerouslySetInnerHTML={{
            __html: marked.parse(block.content, { async: false }) as string,
          }} />
        );
      }
      const member = members.find((m) => m.name === block.speaker);
      return (
        <div key={i} className="ic-debate-exchange">
          <div className="ic-debate-speaker">
            {member?.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={block.speaker}
                style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <span className="ic-debate-speaker-dot" />
            )}
            {block.speaker}
          </div>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{
              __html: marked.parse(block.content, { async: false }) as string,
            }}
          />
        </div>
      );
    });
  }

  if (!loaded) return null;

  const heading = isCharacterPage
    ? `Ask ${defaultMember}`
    : "Ask the Panel";

  const placeholder = activeMode === "ask-member"
    ? `Ask ${selectedMember} a question...`
    : activeMode === "debate"
      ? "What should the panel debate?"
      : "Ask the panel a question...";

  return (
    <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "1.5rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: "1rem" }}>
        {heading}
      </h2>

      {analyses.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
            Analysis context
          </label>
          <select
            value={selectedAnalysis}
            onChange={(e) => setSelectedAnalysis(e.target.value)}
            className="chat-input-character-select"
            style={{ width: "100%", maxWidth: "400px" }}
          >
            <option value="">No specific analysis</option>
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.borrowerName})
              </option>
            ))}
          </select>
        </div>
      )}

      {messages.length > 0 && (
        <div ref={threadRef} className="chat-thread">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="chat-message-user">{msg.content}</div>
              ) : (
                <div className="chat-message-assistant">
                  {renderAssistantMessage(msg.content)}
                </div>
              )}
              {msg.role === "assistant" && i < messages.length - 1 && (
                <div className="chat-thread-divider" />
              )}
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="chat-message-assistant">
              <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: "0.85rem" }}>
                {isSearching ? "Searching the web..." : "Panel is deliberating..."}
              </span>
            </div>
          )}
        </div>
      )}

      {!isCharacterPage && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {(["ask-panel", "ask-member", "debate"] as Mode[]).map((m) => (
            <label
              key={m}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.4rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${mode === m ? "var(--color-accent)" : "var(--color-border)"}`,
                background: mode === m ? "var(--color-accent-subtle)" : "transparent",
                color: mode === m ? "var(--color-accent)" : "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              <input
                type="radio"
                name="clo-panel-follow-up-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                style={{ display: "none" }}
              />
              {m === "ask-panel" ? "Ask Panel" : m === "ask-member" ? "Ask Member" : "Request Debate"}
            </label>
          ))}
        </div>
      )}

      <div className="chat-input-container">
        {activeMode === "ask-member" && !isCharacterPage && members.length > 0 && (
          <div className="chat-input-character-row">
            <span className="chat-input-character-label">Speaking with</span>
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="chat-input-character-select"
            >
              {members.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => { setQuestion(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          className="chat-input-textarea"
          placeholder={placeholder}
          rows={2}
          disabled={isStreaming}
        />

        <div className="chat-input-toolbar">
          <div className="chat-input-toolbar-left" />
          <div className="chat-input-toolbar-right">
            <button
              onClick={handleSubmit}
              disabled={isStreaming || !question.trim()}
              className="chat-input-btn chat-input-btn-submit"
            >
              {isStreaming ? "Deliberating..." : "Ask"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/components/clo/FollowUpModal.tsx
git commit -m "feat(clo): add FollowUpModal component for panel-level chat with analysis picker"
```

---

### Task 5: Member Profile Page

**Files:**
- Create: `web/app/clo/panel/[num]/page.tsx`

**Context:** This mirrors `web/app/assembly/[slug]/characters/[num]/page.tsx` but uses CLO data structures. It's a server component that fetches the panel and analyses, then renders the member profile with a client-side FollowUpModal. The profile shows CLO-native fields: background, investmentPhilosophy, specializations, decisionStyle, riskPersonality, notablePositions, blindSpots, fullProfile. It also shows analysis history (debate contributions and individual assessments from `parsed_data`).

**Step 1: Create the page**

Create `web/app/clo/panel/[num]/page.tsx`:

```typescript
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, getPanelForUser } from "@/lib/clo/access";
import { query } from "@/lib/db";
import type { PanelMember, ParsedAnalysis } from "@/lib/clo/types";
import MemberProfileClient from "./MemberProfileClient";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile) {
    redirect("/clo/onboarding");
  }

  const panel = await getPanelForUser(session.user.id);
  if (!panel || panel.status !== "active") {
    redirect("/clo/panel");
  }

  const members = (panel.members || []) as PanelMember[];
  const { num } = await params;
  const memberNum = Number(num);
  const memberIndex = members.findIndex((m) => m.number === memberNum);
  const member = members[memberIndex];

  if (!member) {
    redirect("/clo/panel");
  }

  // Fetch completed analyses for the analysis picker and history
  const analyses = await query<{
    id: string;
    title: string;
    borrower_name: string;
    parsed_data: ParsedAnalysis;
  }>(
    `SELECT id, title, borrower_name, parsed_data
     FROM clo_analyses
     WHERE panel_id = $1 AND status = 'complete'
     ORDER BY created_at DESC`,
    [panel.id]
  );

  const analysisOptions = analyses.map((a) => ({
    id: a.id,
    title: a.title,
    borrowerName: a.borrower_name,
  }));

  // Build analysis history for this member
  const analysisHistory: Array<{
    analysisId: string;
    title: string;
    type: "assessment" | "debate";
    excerpt: string;
  }> = [];

  for (const a of analyses) {
    const pd = a.parsed_data;
    if (pd?.individualAssessments) {
      for (const ia of pd.individualAssessments) {
        if (ia.memberName === member.name) {
          analysisHistory.push({
            analysisId: a.id,
            title: a.title,
            type: "assessment",
            excerpt: ia.raw?.slice(0, 150) || ia.keyPoints?.join("; ")?.slice(0, 150) || ia.position,
          });
        }
      }
    }
    if (pd?.debate) {
      for (const round of pd.debate) {
        for (const ex of round.exchanges) {
          if (ex.speaker === member.name) {
            analysisHistory.push({
              analysisId: a.id,
              title: a.title,
              type: "debate",
              excerpt: ex.content.slice(0, 150),
            });
            break; // one entry per round
          }
        }
      }
    }
  }

  const prev = members[memberIndex - 1] ?? null;
  const next = members[memberIndex + 1] ?? null;

  return (
    <div className="ic-content">
      <MemberProfileClient
        member={member}
        members={members}
        panelId={panel.id}
        prev={prev}
        next={next}
        analyses={analysisOptions}
        analysisHistory={analysisHistory}
      />
    </div>
  );
}
```

**Step 2: Create the client component**

Create `web/app/clo/panel/[num]/MemberProfileClient.tsx`:

```typescript
"use client";

import Link from "next/link";
import { marked } from "marked";
import type { PanelMember } from "@/lib/clo/types";
import CloFollowUpModal from "@/components/clo/FollowUpModal";

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

const RISK_COLORS: Record<string, string> = {
  conservative: "var(--color-high)",
  moderate: "var(--color-medium)",
  aggressive: "var(--color-low)",
};

interface AnalysisOption {
  id: string;
  title: string;
  borrowerName: string;
}

interface AnalysisHistoryEntry {
  analysisId: string;
  title: string;
  type: "assessment" | "debate";
  excerpt: string;
}

interface MemberProfileClientProps {
  member: PanelMember;
  members: PanelMember[];
  panelId: string;
  prev: PanelMember | null;
  next: PanelMember | null;
  analyses: AnalysisOption[];
  analysisHistory: AnalysisHistoryEntry[];
}

export default function MemberProfileClient({
  member,
  members,
  panelId,
  prev,
  next,
  analyses,
  analysisHistory,
}: MemberProfileClientProps) {
  const riskColor = RISK_COLORS[member.riskPersonality?.toLowerCase()] || "var(--color-medium)";

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href="/clo">CLO</Link>
        <span className="separator">/</span>
        <Link href="/clo/panel">Panel</Link>
        <span className="separator">/</span>
        <span className="current">{member.name}</span>
      </div>

      <div className="profile-header">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="profile-avatar"
          />
        ) : (
          <div className="profile-avatar" style={{ background: riskColor }}>
            {member.name.charAt(0)}
          </div>
        )}
        <div>
          <h1 style={{ marginBottom: "0.15rem" }}>{member.name}</h1>
          <div className="profile-meta">
            <span className="badge badge-tag">{member.role}</span>
            <span
              className="ic-risk-dot"
              style={{ background: riskColor }}
              title={`Risk: ${member.riskPersonality}`}
            />
            <span style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
              {member.riskPersonality}
            </span>
          </div>
        </div>
      </div>

      {member.background && (
        <>
          <h2>Background</h2>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: md(member.background) }}
          />
        </>
      )}

      {member.investmentPhilosophy && (
        <>
          <h2>Investment Philosophy</h2>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: md(member.investmentPhilosophy) }}
          />
        </>
      )}

      {member.specializations?.length > 0 && (
        <>
          <h2>Specializations</h2>
          <div className="ic-member-tags">
            {member.specializations.map((s) => (
              <span key={s} className="ic-member-tag">{s}</span>
            ))}
          </div>
        </>
      )}

      {member.decisionStyle && (
        <>
          <h2>Decision Style</h2>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: md(member.decisionStyle) }}
          />
        </>
      )}

      {member.notablePositions?.length > 0 && (
        <>
          <h2>Notable Positions</h2>
          <ol>
            {member.notablePositions.map((p, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: md(p) }} />
            ))}
          </ol>
        </>
      )}

      {member.blindSpots?.length > 0 && (
        <>
          <h2>Blind Spots</h2>
          <ul>
            {member.blindSpots.map((b, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: md(b) }} />
            ))}
          </ul>
        </>
      )}

      {member.fullProfile && (
        <>
          <h2>Full Profile</h2>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: md(member.fullProfile) }}
          />
        </>
      )}

      {analysisHistory.length > 0 && (
        <>
          <h2>Analysis History</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            {analysisHistory.length} contribution{analysisHistory.length !== 1 ? "s" : ""} across analyses
          </p>
          {analysisHistory.map((entry, i) => (
            <details key={i}>
              <summary>
                {entry.title}{" "}
                <span className="badge badge-tag">{entry.type}</span>
              </summary>
              <div className="details-content">
                <p>{entry.excerpt}{entry.excerpt.length >= 150 ? "\u2026" : ""}</p>
                <Link
                  href={`/clo/analyze/${entry.analysisId}/${entry.type === "debate" ? "debate" : "memo"}`}
                  style={{ fontSize: "0.82rem" }}
                >
                  View in context &rarr;
                </Link>
              </div>
            </details>
          ))}
        </>
      )}

      <CloFollowUpModal
        panelId={panelId}
        members={members}
        defaultMember={member.name}
        pageType="member"
        analyses={analyses}
      />

      <hr />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
        {prev ? (
          <Link href={`/clo/panel/${prev.number}`}>
            &larr; {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/clo/panel/${next.number}`}>
            {next.name} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}
```

**Step 3: Commit**

```bash
git add web/app/clo/panel/\[num\]/page.tsx web/app/clo/panel/\[num\]/MemberProfileClient.tsx
git commit -m "feat(clo): add member profile page with analysis history and chat"
```

---

### Task 6: Update PanelMemberCard with Profile Links

**Files:**
- Modify: `web/components/clo/PanelMemberCard.tsx`

**Context:** Currently clicking anywhere on the card toggles expand/collapse. We need to make the member name/avatar navigate to `/clo/panel/[num]` and add a "View profile" link in expanded state. The card click still expands/collapses but name/avatar clicks navigate.

**Step 1: Update PanelMemberCard**

In `web/components/clo/PanelMemberCard.tsx`:

Add `import Link from "next/link";` at the top (line 2, after `"use client";`).

Replace the entire `<div className="ic-member-detail-header">` block (currently lines 44-65) with a version where the avatar and name are wrapped in Links that stop propagation:

```typescript
      <div className="ic-member-detail-header">
        <Link
          href={`/clo/panel/${member.number}`}
          onClick={(e) => e.stopPropagation()}
          style={{ textDecoration: "none" }}
        >
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.name}
              className="ic-member-avatar"
            />
          ) : (
            <div className="ic-member-avatar-placeholder">
              {member.name.charAt(0)}
            </div>
          )}
        </Link>
        <div className="ic-member-detail-info">
          <Link
            href={`/clo/panel/${member.number}`}
            onClick={(e) => e.stopPropagation()}
            className="ic-member-detail-name"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {member.name}
          </Link>
          <div className="ic-member-detail-role">{member.role}</div>
        </div>
        <span
          className="ic-risk-dot"
          style={{ background: riskColor }}
          title={`Risk: ${member.riskPersonality}`}
        />
      </div>
```

Add a "View profile" link at the end of the expanded section. After the blind spots `</div>` (line ~108) and before the closing `</div>` of `ic-member-expanded`, add:

```typescript
          <Link
            href={`/clo/panel/${member.number}`}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: "0.82rem", display: "inline-block", marginTop: "0.5rem" }}
          >
            View profile &rarr;
          </Link>
```

**Step 2: Commit**

```bash
git add web/components/clo/PanelMemberCard.tsx
git commit -m "feat(clo): add profile page links to PanelMemberCard"
```

---

### Task 7: Verify and Test

**Step 1: Build check**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx next build 2>&1 | tail -30`
Expected: Build succeeds with no errors in the new files

**Step 2: Manual verification checklist**

- Navigate to `/clo/panel` — cards should show member names as links
- Click a member name — should navigate to `/clo/panel/[num]`
- Profile page shows: breadcrumb, avatar, name, role, risk personality, all profile sections
- Prev/Next navigation works between members
- Analysis history shows debate and assessment entries (if analyses exist)
- Chat widget appears at bottom with "Ask [Name]" heading
- Analysis picker dropdown shows completed analyses
- Sending a question streams a response with speaker block rendering
- Selecting an analysis in the picker provides that analysis's context to the AI

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(clo): complete interactive panel with member profiles and panel-level chat"
```
