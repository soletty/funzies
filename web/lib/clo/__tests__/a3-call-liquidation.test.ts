/**
 * A3 — Call liquidation at per-position market value.
 *
 * Before A3: engine liquidated pool at a flat `endingPar × callPricePct/100`,
 * ignoring per-position `currentPrice`. For Euro XV at callPricePct=100 this
 * overstated liquidation proceeds by ~€24M (par €491M vs MtM €468M).
 *
 * A3 adds:
 *   - `LoanInput.currentPrice?: number | null` + `LoanState.currentPrice`
 *   - `UserAssumptions.callPriceMode: 'multiplier' | 'flat'` (default 'multiplier')
 *   - `computeCallLiquidation` pure helper (tested here)
 *
 * Under 'multiplier' (default), callPricePct=100 means "sell at current
 * market"; callPricePct=95 means "5% haircut on market". Under 'flat',
 * every position sells at callPricePct regardless of market.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeCallLiquidation, runProjection } from "@/lib/clo/projection";
import { buildFromResolved, DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
};

describe("A3 — computeCallLiquidation (pure helper)", () => {
  it("multiplier mode, callPricePct=100 → sum of (par × currentPrice/100)", () => {
    const loans = [
      { survivingPar: 100, currentPrice: 95 },   // 95c
      { survivingPar: 200, currentPrice: 98 },   // 98c
      { survivingPar: 300, currentPrice: 100 },  // at par
    ];
    // expected: 100×0.95 + 200×0.98 + 300×1.00 = 95 + 196 + 300 = 591
    expect(computeCallLiquidation(loans, 100, "multiplier")).toBeCloseTo(591, 6);
  });

  it("multiplier mode, callPricePct=95 → 5% haircut on market", () => {
    const loans = [
      { survivingPar: 100, currentPrice: 98 },
      { survivingPar: 200, currentPrice: 100 },
    ];
    // expected: 100×(98×0.95/100) + 200×(100×0.95/100) = 100×0.931 + 200×0.95 = 93.1 + 190 = 283.1
    expect(computeCallLiquidation(loans, 95, "multiplier")).toBeCloseTo(283.1, 6);
  });

  it("flat mode, callPricePct=98 → every position at 98c regardless of market", () => {
    const loans = [
      { survivingPar: 100, currentPrice: 80 },   // market 80c, ignored
      { survivingPar: 200, currentPrice: 100 },  // market 100c, ignored
    ];
    // expected: (100 + 200) × 0.98 = 294
    expect(computeCallLiquidation(loans, 98, "flat")).toBeCloseTo(294, 6);
  });

  it("mixed priced + unpriced (reinvested) positions fall back to par", () => {
    // Reinvestment-period scenario: some loans from original pool (carry
    // currentPrice), some added via reinvestment (no currentPrice, should
    // default to par 100).
    const loans = [
      { survivingPar: 100, currentPrice: 95 },              // priced
      { survivingPar: 50 },                                  // reinvested — no price
      { survivingPar: 200, currentPrice: null },            // no-price explicit null
      { survivingPar: 30, currentPrice: 102 },              // priced above par
    ];
    // multiplier=100: 100×0.95 + 50×1.00 + 200×1.00 + 30×1.02 = 95 + 50 + 200 + 30.6 = 375.6
    expect(computeCallLiquidation(loans, 100, "multiplier")).toBeCloseTo(375.6, 6);
  });

  it("skips unfunded DDTL positions (no deployed collateral)", () => {
    const loans = [
      { survivingPar: 100, currentPrice: 95 },
      { survivingPar: 50, currentPrice: 100, isDelayedDraw: true }, // unfunded
      { survivingPar: 200, currentPrice: 100 },
    ];
    // expected: 100×0.95 + 200×1.00 = 95 + 200 = 295 (50 excluded)
    expect(computeCallLiquidation(loans, 100, "multiplier")).toBeCloseTo(295, 6);
  });

  it("zero-par position contributes nothing", () => {
    const loans = [
      { survivingPar: 100, currentPrice: 95 },
      { survivingPar: 0, currentPrice: 50 },
      { survivingPar: -1, currentPrice: 50 }, // defensive guard on negatives
    ];
    expect(computeCallLiquidation(loans, 100, "multiplier")).toBeCloseTo(95, 6);
  });

  it("empty pool → 0 (no crash)", () => {
    expect(computeCallLiquidation([], 100, "multiplier")).toBe(0);
    expect(computeCallLiquidation([], 98, "flat")).toBe(0);
  });
});

describe("A3 — integration: Euro XV call at MtM vs at flat par", () => {
  // Euro XV sub note par = €44.8M; pool par €491.4M; pool MtM ≈ €467.9M.
  // Call at multiplier=100 uses per-position currentPrice → liquidation ≈ €467.9M.
  // Call at flat=100 treats every position at 100c → liquidation = €491.4M.
  // The ~€23.5M difference flows through the waterfall; equity (sub note) is
  // the residual bucket so most of the swing hits totalEquityDistributions.

  const callDate = "2026-07-15"; // one quarter out
  const assumptionsMultiplier = {
    ...DEFAULT_ASSUMPTIONS,
    callDate,
    callPricePct: 100,
    callPriceMode: "multiplier" as const,
  };
  const assumptionsFlat = {
    ...DEFAULT_ASSUMPTIONS,
    callDate,
    callPricePct: 100,
    callPriceMode: "flat" as const,
  };

  it("call at MtM yields LESS equity than call at flat par (pool trades below par)", () => {
    const resultMtM = runProjection(buildFromResolved(fixture.resolved, assumptionsMultiplier));
    const resultFlat = runProjection(buildFromResolved(fixture.resolved, assumptionsFlat));
    expect(resultMtM.totalEquityDistributions).toBeLessThan(resultFlat.totalEquityDistributions);
  });

  it("flat − multiplier equity delta ≈ €23.98M (empirical anchor)", () => {
    // Empirical measurement: Euro XV at callDate=2026-07-15, default other
    // assumptions. The raw pool par-vs-MtM gap is ~€23.5M (€491.4M − €467.9M),
    // and the engine's equity-side delta ends up slightly higher at €23.98M
    // — the difference flows partly through incentive-fee mechanics before
    // settling as residual equity. Anchoring to the measured value pins both
    // the direction AND the magnitude; ±€50k tolerance is tight enough to
    // catch material changes to either the liquidation math or the
    // downstream waterfall flow.
    const resultMtM = runProjection(buildFromResolved(fixture.resolved, assumptionsMultiplier));
    const resultFlat = runProjection(buildFromResolved(fixture.resolved, assumptionsFlat));
    const equityGap = resultFlat.totalEquityDistributions - resultMtM.totalEquityDistributions;
    expect(equityGap).toBeCloseTo(23_979_615.50, -5); // ±€50k tolerance
  });
});
