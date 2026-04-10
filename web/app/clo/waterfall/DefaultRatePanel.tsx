"use client";

import React, { useState } from "react";
import { RATING_BUCKETS } from "@/lib/clo/rating-mapping";

export function DefaultRatePanel({
  defaultRates,
  onChange,
  ratingDistribution,
  weightedAvgCdr,
}: {
  defaultRates: Record<string, number>;
  onChange: (rates: Record<string, number>) => void;
  ratingDistribution: Record<string, { count: number; par: number }>;
  weightedAvgCdr: number;
}) {
  const [open, setOpen] = useState(true);
  const [uniformInput, setUniformInput] = useState("");

  const applyUniform = () => {
    const val = parseFloat(uniformInput);
    if (!isNaN(val) && val >= 0) {
      const rates: Record<string, number> = {};
      for (const bucket of RATING_BUCKETS) rates[bucket] = val;
      onChange(rates);
      setUniformInput("");
    }
  };

  const totalPar = Object.values(ratingDistribution).reduce((s, d) => s + d.par, 0);

  return (
    <div
      style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.6rem 0.8rem",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          textAlign: "left",
          fontFamily: "var(--font-body)",
        }}
      >
        <span>
          <span style={{ fontSize: "0.65rem", marginRight: "0.3rem" }}>{open ? "\u25BE" : "\u25B8"}</span>
          Default Rates by Rating
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
          Wtd Avg: {weightedAvgCdr.toFixed(2)}%
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 0.8rem 0.8rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--color-border-light)" }}>
            <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>Set all to:</label>
            <input
              type="number"
              value={uniformInput}
              onChange={(e) => setUniformInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyUniform()}
              placeholder="%"
              style={{
                width: "4rem",
                padding: "0.25rem 0.4rem",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--color-border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-bg)",
              }}
            />
            <button
              onClick={applyUniform}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "0.7rem",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border-light)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Apply
            </button>
          </div>

          {RATING_BUCKETS.filter((b) => ratingDistribution[b]?.par > 0).map((bucket) => {
            const dist = ratingDistribution[bucket];
            const parPct = totalPar > 0 ? (dist.par / totalPar) * 100 : 0;
            return (
              <div key={bucket} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0" }}>
                <div style={{ width: "2.5rem", fontSize: "0.72rem", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                  {bucket}
                </div>
                <div style={{ width: "4rem", fontSize: "0.65rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                  {dist.count > 0 ? `${dist.count} \u00B7 ${parPct.toFixed(0)}%` : "\u2014"}
                </div>
                <input
                  type="range"
                  className="wf-slider"
                  min={0}
                  max={20}
                  step={0.1}
                  value={defaultRates[bucket] ?? 0}
                  onChange={(e) => onChange({ ...defaultRates, [bucket]: parseFloat(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span style={{ width: "3rem", textAlign: "right", fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {(defaultRates[bucket] ?? 0).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
