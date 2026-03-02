"use client";

import { useState } from "react";

interface Scenario {
  name: string;
  cdrPct: number;
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
  reasoning: string;
}

interface Props {
  panelId: string;
  dealContext: Record<string, unknown>;
  onApply: (assumptions: {
    cdrPct: number;
    cprPct: number;
    recoveryPct: number;
    recoveryLagMonths: number;
    reinvestmentSpreadBps: number;
  }) => void;
}

export default function SuggestAssumptions({ panelId, dealContext, onApply }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

  async function suggest() {
    setLoading(true);
    setError(null);
    setScenarios([]);
    setAppliedIdx(null);

    try {
      const res = await fetch("/api/clo/waterfall/suggest-assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelId, dealContext }),
      });

      if (!res.ok) {
        setError("Failed to get suggestions");
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.type === "text") {
              fullText += event.content;
            }
          } catch {
            // skip
          }
        }
      }

      const parsed = parseScenarios(fullText);
      setScenarios(parsed);
    } catch {
      setError("Suggestion request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <button
        onClick={suggest}
        disabled={loading}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.82rem",
          fontFamily: "var(--font-body)",
          background: loading ? "var(--color-surface-alt)" : "var(--color-surface)",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          cursor: loading ? "default" : "pointer",
          color: loading ? "var(--color-text-muted)" : "var(--color-text-secondary)",
          transition: "background 0.15s ease",
        }}
      >
        {loading ? "Generating scenarios..." : "Suggest Assumptions"}
      </button>

      {error && (
        <div style={{ color: "var(--color-low)", fontSize: "0.8rem", marginTop: "0.5rem" }}>{error}</div>
      )}

      {scenarios.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {scenarios.map((s, i) => {
            const isApplied = appliedIdx === i;
            return (
              <div
                key={i}
                className="wf-scenario-card"
                style={{
                  padding: "1rem",
                  border: isApplied ? "2px solid var(--color-accent)" : "1px solid var(--color-border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-surface)",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                  {s.name}
                </div>
                <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", marginBottom: "0.5rem", color: "var(--color-text-secondary)" }}>
                  <div>CDR: {s.cdrPct}% &middot; CPR: {s.cprPct}%</div>
                  <div>Recovery: {s.recoveryPct}% @ {s.recoveryLagMonths}mo lag</div>
                  <div>Reinvestment: {s.reinvestmentSpreadBps}bps</div>
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.75rem",
                    lineHeight: 1.4,
                  }}
                >
                  {s.reasoning}
                </div>
                <button
                  onClick={() => {
                    onApply({
                      cdrPct: s.cdrPct,
                      cprPct: s.cprPct,
                      recoveryPct: s.recoveryPct,
                      recoveryLagMonths: s.recoveryLagMonths,
                      reinvestmentSpreadBps: s.reinvestmentSpreadBps,
                    });
                    setAppliedIdx(i);
                  }}
                  style={{
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-body)",
                    background: isApplied ? "var(--color-accent)" : "transparent",
                    color: isApplied ? "#fff" : "var(--color-text-secondary)",
                    border: `1px solid ${isApplied ? "var(--color-accent)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isApplied ? "Applied" : "Apply"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parseScenarios(text: string): Scenario[] {
  // Try JSON parse first
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((s) => s.name && typeof s.cdrPct === "number")
          .map((s) => ({
            name: s.name,
            cdrPct: s.cdrPct,
            cprPct: s.cprPct ?? 15,
            recoveryPct: s.recoveryPct ?? 60,
            recoveryLagMonths: s.recoveryLagMonths ?? 12,
            reinvestmentSpreadBps: s.reinvestmentSpreadBps ?? 350,
            reasoning: s.reasoning ?? "",
          }));
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: try to extract JSON objects individually
  const scenarios: Scenario[] = [];
  const objectPattern = /\{[^{}]*"name"[^{}]*\}/g;
  let match;
  while ((match = objectPattern.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.name && typeof obj.cdrPct === "number") {
        scenarios.push({
          name: obj.name,
          cdrPct: obj.cdrPct,
          cprPct: obj.cprPct ?? 15,
          recoveryPct: obj.recoveryPct ?? 60,
          recoveryLagMonths: obj.recoveryLagMonths ?? 12,
          reinvestmentSpreadBps: obj.reinvestmentSpreadBps ?? 350,
          reasoning: obj.reasoning ?? "",
        });
      }
    } catch {
      continue;
    }
  }

  return scenarios;
}
