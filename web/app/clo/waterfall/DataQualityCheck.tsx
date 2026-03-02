"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Warning {
  severity: "error" | "warning" | "info";
  message: string;
  action: string;
}

interface Props {
  panelId: string;
  dealContext: Record<string, unknown>;
}

export default function DataQualityCheck({ panelId, dealContext }: Props) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const controller = new AbortController();

    async function check() {
      try {
        const res = await fetch("/api/clo/waterfall/check-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panelId, dealContext }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setError("Could not run data quality check");
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
              if (event.type === "done") break;
            } catch {
              // skip
            }
          }
        }

        const parsed = parseWarnings(fullText);
        setWarnings(parsed);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Data quality check failed");
        }
      } finally {
        setLoading(false);
      }
    }

    check();

    return () => controller.abort();
  }, [panelId, dealContext]);

  if (error) return null;
  if (loading) {
    return (
      <div
        className="wf-section"
        style={{
          padding: "0.85rem 1rem",
          marginBottom: "1.5rem",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text-muted)",
          fontSize: "0.82rem",
          background: "var(--color-surface)",
        }}
      >
        Checking data quality...
      </div>
    );
  }
  if (warnings.length === 0) return null;

  const severityStyles = {
    error: { bg: "var(--color-low-bg)", border: "var(--color-low-border)", text: "var(--color-low)" },
    warning: { bg: "var(--color-medium-bg)", border: "var(--color-medium-border)", text: "var(--color-medium)" },
    info: { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },
  };

  return (
    <div className="wf-section" style={{ marginBottom: "2rem" }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.95rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
        }}
      >
        Data Quality
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {warnings.map((w, i) => {
          const styles = severityStyles[w.severity];
          return (
            <div
              key={i}
              style={{
                padding: "0.65rem 0.85rem",
                background: styles.bg,
                border: `1px solid ${styles.border}`,
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                color: styles.text,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: w.action ? "0.2rem" : 0 }}>{w.message}</div>
              {w.action && (
                <div style={{ fontSize: "0.72rem", opacity: 0.8 }}>
                  {w.action}
                  {w.severity === "error" && (
                    <>
                      {" "}
                      <Link
                        href="/clo/context"
                        style={{ color: styles.text, textDecoration: "underline" }}
                      >
                        Fix in Context Editor
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseWarnings(text: string): Warning[] {
  const warnings: Warning[] = [];

  // Try JSON array parse first
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.severity && item.message) {
            warnings.push({
              severity: item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info",
              message: item.message,
              action: item.action || "",
            });
          }
        }
        return warnings;
      }
    }
  } catch {
    // Fall through to line parsing
  }

  // Fallback: parse line-by-line markdown-style
  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const stripped = line.replace(/^[-*]\s*/, "").trim();
    if (!stripped) continue;

    let severity: Warning["severity"] = "info";
    if (/\b(error|missing|required|blocking)\b/i.test(stripped)) severity = "error";
    else if (/\b(warning|unusual|mismatch|verify|check)\b/i.test(stripped)) severity = "warning";

    const dashIdx = stripped.indexOf("—");
    if (dashIdx > 0) {
      warnings.push({
        severity,
        message: stripped.slice(0, dashIdx).trim(),
        action: stripped.slice(dashIdx + 1).trim(),
      });
    } else {
      warnings.push({ severity, message: stripped, action: "" });
    }
  }

  return warnings;
}
