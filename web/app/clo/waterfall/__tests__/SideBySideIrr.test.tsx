/**
 * SideBySideIrr render tests — post-v6 plan §9 #5 / option (d).
 *
 * Pins the three render states of the hero card's IRR cell that surfaced
 * during the (d) ship's iteration:
 *
 *   1. **healthy**   — numeric noCall + numeric withCall: both percents
 *      shown, "(more conservative)" marker on the lower side.
 *   2. **wiped-out** — noCall and withCall = "wiped out" status string:
 *      text propagates per column (regression: original (d) ship dropped
 *      these to "— · —" with no signal).
 *   3. **no-inception** — noCall numeric + withCall = `undefined`:
 *      single column renders (graceful degradation when the deal has no
 *      `nonCallPeriodEnd`).
 *
 * Uses `react-dom/server`'s `renderToStaticMarkup` so the tests run in
 * the standard Node test environment — no jsdom / happy-dom dep added.
 * Inline-style strings remain stable across React 18/19 (they're written
 * as the user wrote them); attribute ordering is React-version stable
 * for static markup.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SideBySideIrr } from "../SideBySideIrr";

describe("SideBySideIrr render states", () => {
  describe("healthy fixture (numeric · numeric)", () => {
    it("renders both IRR percents", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={0.125} withCall={0.142} />,
      );
      // 12.5% formatted (no-call); 14.2% formatted (with-call).
      // formatPct typically formats to 1 decimal place.
      expect(html).toContain("12.5");
      expect(html).toContain("14.2");
      expect(html).toContain("%");
      // Side-by-side separator dot rendered.
      expect(html).toContain("·");
    });

    it("encodes the lower (conservative) side with bold weight; higher side is dimmed", () => {
      // No-call is lower → no-call gets bold (700); with-call dims (opacity 0.55).
      const noCallLowerHtml = renderToStaticMarkup(
        <SideBySideIrr noCall={0.10} withCall={0.15} />,
      );
      expect(noCallLowerHtml).toMatch(/font-weight:\s*700[^"]*"[^>]*>10\.00%/);
      expect(noCallLowerHtml).toMatch(/font-weight:\s*500[^"]*"[^>]*>15\.00%/);
      expect(noCallLowerHtml).toMatch(/opacity:\s*0\.55[^"]*"[^>]*>15\.00%/);
      // With-call is lower → with-call gets bold; no-call dims.
      const withCallLowerHtml = renderToStaticMarkup(
        <SideBySideIrr noCall={0.18} withCall={0.12} />,
      );
      expect(withCallLowerHtml).toMatch(/font-weight:\s*700[^"]*"[^>]*>12\.00%/);
      expect(withCallLowerHtml).toMatch(/opacity:\s*0\.55[^"]*"[^>]*>18\.00%/);
    });

    it("does not encode either side as conservative when noCall === withCall", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={0.13} withCall={0.13} />,
      );
      // Equal values: neither side is "lower" → both render with regular
      // weight (500) at full opacity. No bold (700), no dim (0.55).
      expect(html).not.toMatch(/font-weight:\s*700/);
      expect(html).not.toMatch(/opacity:\s*0\.55/);
    });

    it("does not include the legacy '(more conservative)' inline text", () => {
      // Replaced by weight/opacity encoding + a single card-level legend.
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={0.10} withCall={0.15} />,
      );
      expect(html).not.toContain("(more conservative)");
    });
  });

  describe("wiped-out fixture (status string · status string)", () => {
    it("renders 'wiped out' text per column", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall="wiped out" withCall="wiped out" />,
      );
      // Both columns carry the status text — this is the regression fix.
      // Original (d) ship dropped status to "— · —" because IrrCellValue
      // accepted only number | null.
      const occurrences = html.match(/wiped out/g) ?? [];
      expect(occurrences.length).toBe(2);
    });

    it("does not encode either column as conservative when status is text", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall="wiped out" withCall="wiped out" />,
      );
      // Status text is incomparable — no numeric ordering, no bold/dim.
      expect(html).not.toMatch(/font-weight:\s*700/);
      expect(html).not.toMatch(/opacity:\s*0\.55/);
    });

    it("supports mixed status / numeric (no-realized-data on one side, computed on the other)", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall="no forward data" withCall={0.12} />,
      );
      expect(html).toContain("no forward data");
      expect(html).toContain("12");
      // Mixed types are not comparable → no encoding.
      expect(html).not.toMatch(/font-weight:\s*700/);
      expect(html).not.toMatch(/opacity:\s*0\.55/);
    });

    it("renders 'no forward data' text", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall="no forward data" withCall="no forward data" />,
      );
      expect(html).toContain("no forward data");
    });
  });

  describe("no-inception fixture (numeric · undefined → single column)", () => {
    it("renders only the noCall value when withCall is undefined", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={0.125} withCall={undefined} />,
      );
      expect(html).toContain("12.5");
      // Single-column path: no separator dot, no second column.
      expect(html).not.toContain("·");
    });

    it("renders status text in single-column mode", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall="wiped out" withCall={undefined} />,
      );
      expect(html).toContain("wiped out");
      expect(html).not.toContain("·");
    });

    it("renders em-dash for null noCall in single-column mode", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={null} withCall={undefined} />,
      );
      expect(html).toContain("—");
    });

    it("never applies dim/bold conservative encoding in single-column mode", () => {
      const html = renderToStaticMarkup(
        <SideBySideIrr noCall={0.125} withCall={undefined} />,
      );
      // Single column has no comparison → no bold/dim.
      expect(html).not.toMatch(/opacity:\s*0\.55/);
    });
  });

  describe("null vs undefined for withCall (semantic distinction)", () => {
    it("withCall=null renders the second column with em-dash, not collapses to single column", () => {
      // null = "with-call exists but produced no IRR" — render as "—"
      // in second column (so partner sees the comparison structure).
      // undefined = "no with-call companion exists" — single column.
      const nullHtml = renderToStaticMarkup(
        <SideBySideIrr noCall={0.125} withCall={null} />,
      );
      expect(nullHtml).toContain("·");
      expect(nullHtml).toContain("—");
      const undefHtml = renderToStaticMarkup(
        <SideBySideIrr noCall={0.125} withCall={undefined} />,
      );
      expect(undefHtml).not.toContain("·");
    });
  });
});
