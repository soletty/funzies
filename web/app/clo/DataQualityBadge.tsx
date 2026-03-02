"use client";

import { useState } from "react";
import Link from "next/link";
import type { DataQuality } from "@/lib/clo/types";

export default function DataQualityBadge({ dataQuality }: { dataQuality: DataQuality | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!dataQuality || dataQuality.checksRun === 0) return null;

  const { score, checksRun, checks } = dataQuality;

  const hasFailures = checks.some((c) => c.status === "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");

  const color = hasFailures
    ? "var(--color-error, #ef4444)"
    : hasWarnings
      ? "var(--color-warning, #eab308)"
      : "var(--color-success, #22c55e)";

  const label = hasFailures || hasWarnings ? "Data Issues" : "Data Verified";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.2rem 0.5rem",
          fontSize: "0.75rem",
          fontWeight: 600,
          color,
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
        }}
      >
        <span style={{
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }} />
        {label} ({score}/{checksRun})
      </button>

      {expanded && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          zIndex: 10,
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "0.75rem",
          minWidth: "320px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
            Cross-validation: {score} of {checksRun} checks passed
            {dataQuality.checksSkipped > 0 && ` (${dataQuality.checksSkipped} skipped — insufficient data)`}
          </div>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {checks.map((c) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0",
                }}
              >
                <span style={{
                  width: "0.45rem",
                  height: "0.45rem",
                  borderRadius: "50%",
                  background: c.status === "pass"
                    ? "var(--color-success, #22c55e)"
                    : c.status === "warn"
                      ? "var(--color-warning, #eab308)"
                      : "var(--color-error, #ef4444)",
                  flexShrink: 0,
                }} />
                <span style={{ color: "var(--color-text)" }}>{c.message}</span>
              </div>
            ))}
          </div>
          {hasFailures && (
            <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--color-border)", fontSize: "0.75rem" }}>
              <Link href="/clo/context" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                Edit extracted data →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
