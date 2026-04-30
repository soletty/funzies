"use client";

import React from "react";
import { formatPct } from "./helpers";

/**
 * Post-v6 plan §9 #5 / option (d): side-by-side IRR cell. Each side accepts
 * `number` (IRR — formatted as a percent), `string` (status fallback like
 * "wiped out" / "no forward data"), or `null` (renders as "—"). The
 * `withCall` parameter can additionally be `undefined`, which means "no
 * with-call companion exists for this deal" and triggers single-column
 * graceful degradation.
 *
 * Conservative encoding: when both sides are numeric, the lower side
 * renders at full strength (bold, full opacity) and the higher side is
 * dimmed (regular weight, ~0.55 opacity). Status text and `null` are
 * incomparable and render at full strength on both sides. The single
 * card-level "(lower = conservative)" legend lives in the consumer
 * (Forward IRR / Since-inception card footers); this component does not
 * repeat the legend per row.
 *
 * Earlier iterations carried an inline "(more conservative)" text marker
 * on the lower side; that produced 3-5 repetitions per card and forced
 * row wrapping on narrow widths. Removed in favor of the weight/opacity
 * contrast above.
 *
 * Extracted from `ProjectionModel.tsx` to enable render-state tests
 * (`__tests__/SideBySideIrr.test.tsx`).
 */
export type IrrCellValue = number | string | null;

const VALUE_BASE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1rem",
  letterSpacing: "-0.02em",
};

export function SideBySideIrr({
  noCall,
  withCall,
}: {
  noCall: IrrCellValue;
  withCall: IrrCellValue | undefined;
}) {
  const fmt = (v: IrrCellValue): string => {
    if (typeof v === "string") return v;
    if (v == null) return "—";
    return formatPct(v * 100);
  };
  if (withCall === undefined) {
    return (
      <strong style={VALUE_BASE_STYLE}>
        {fmt(noCall)}
      </strong>
    );
  }
  const bothNumeric = typeof noCall === "number" && typeof withCall === "number";
  // Conservative = lower numeric value. When sides aren't comparable
  // (status text, null, or equal numbers) both render at full strength.
  const noCallLower = bothNumeric && (noCall as number) < (withCall as number);
  const withCallLower = bothNumeric && (withCall as number) < (noCall as number);
  const renderSide = (v: IrrCellValue, isConservative: boolean, isDimmed: boolean) => (
    <span style={{ ...VALUE_BASE_STYLE, fontWeight: isConservative ? 700 : 500, opacity: isDimmed ? 0.55 : 1 }}>
      {fmt(v)}
    </span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.3rem", justifyContent: "flex-end" }}>
      {renderSide(noCall, noCallLower, withCallLower)}
      <span style={{ opacity: 0.4 }}>{"·"}</span>
      {renderSide(withCall, withCallLower, noCallLower)}
    </span>
  );
}
