import React from "react";
import type { SensitivityRow } from "@/lib/clo/projection";

export function SensitivityTable({ rows, baseIrr }: { rows: SensitivityRow[]; baseIrr: number | null }) {
  if (rows.length === 0 || baseIrr === null) return null;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
        IRR Sensitivity
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "right" }}>
            {["Assumption", "Base", "Down", "Up", "IRR Impact"].map((h) => (
              <th key={h} style={{ padding: "0.4rem 0.6rem", textAlign: h === "Assumption" ? "left" : "right", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const downDelta = row.downIrr !== null ? (row.downIrr - baseIrr) * 100 : null;
            const upDelta = row.upIrr !== null ? (row.upIrr - baseIrr) * 100 : null;
            return (
              <tr key={row.assumption} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                <td style={{ padding: "0.45rem 0.6rem", fontWeight: 500 }}>{row.assumption}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.base}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.down}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.up}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                  {downDelta !== null && upDelta !== null ? (
                    <>
                      <span style={{ color: downDelta >= 0 ? "var(--color-high)" : "var(--color-low)" }}>
                        {downDelta >= 0 ? "+" : ""}{downDelta.toFixed(2)}%
                      </span>
                      {" / "}
                      <span style={{ color: upDelta >= 0 ? "var(--color-high)" : "var(--color-low)" }}>
                        {upDelta >= 0 ? "+" : ""}{upDelta.toFixed(2)}%
                      </span>
                    </>
                  ) : "N/A"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
