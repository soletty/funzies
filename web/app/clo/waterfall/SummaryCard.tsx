import React from "react";

export function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: "1.25rem",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "1.15rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
