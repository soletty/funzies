import React from "react";

export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  hint?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <label style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", fontWeight: 500 }}>{label}</label>
        <span
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--color-text)",
          }}
        >
          {value}{suffix}
        </span>
      </div>
      {hint && <div style={{ fontSize: "0.62rem", color: "var(--color-text-muted)", marginBottom: "0.3rem", lineHeight: 1.4, opacity: 0.8 }}>{hint}</div>}
      <input
        type="range"
        className="wf-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <label style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", fontWeight: 500 }}>{label}</label>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "0.35rem 0.5rem",
          fontSize: "0.82rem",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
