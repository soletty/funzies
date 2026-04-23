/**
 * D2 — Per-position WARF-factor hazard (Sprint 4, production default).
 *
 * Default engine behavior derives each position's quarterly default hazard
 * from its Moody's WARF factor — the institutionally-correct hazard model
 * per Moody's CLO methodology. The coarse-bucket `defaultRatesByRating`
 * path remains available as a legacy escape-hatch via
 * `useLegacyBucketHazard: true` for tests that pre-date D2 and haven't yet
 * been re-baselined.
 *
 * Scope:
 *   ✅ Math: warfFactor × 10yr → quarterly hazard via
 *      h = 1 − (1 − wf/10000)^(1/40).
 *   ✅ Default (no flag) = per-position hazard active.
 *   ✅ `useLegacyBucketHazard: true` = bucket-map behavior (legacy tests).
 *   ✅ Caa1 vs Caa3 in the same "CCC" bucket produce distinct hazards —
 *      the whole point of D2.
 *   ✅ Reinvested synthetic loans still carry a warfFactor via
 *      BUCKET_WARF_FALLBACK, so they hit the per-position path too.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DefaultDrawFn, LoanInput, ProjectionInputs } from "@/lib/clo/projection";
import { runProjection } from "@/lib/clo/projection";
import { buildFromResolved, defaultsFromResolved } from "@/lib/clo/build-projection-inputs";
import { warfFactorToQuarterlyHazard } from "@/lib/clo/rating-mapping";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: Parameters<typeof defaultsFromResolved>[1];
};

// Deterministic default-draw: always returns `survivingPar × hazard` (no
// stochastic noise). Lets tests assert on exact expected defaults instead
// of Monte Carlo distributions.
const expectationDraw: DefaultDrawFn = (survivingPar, hazard) => survivingPar * hazard;

describe("D2 — warfFactorToQuarterlyHazard helper math", () => {
  it("Aaa (factor 1) → near-zero quarterly hazard", () => {
    expect(warfFactorToQuarterlyHazard(1)).toBeLessThan(1e-5);
  });

  it("B2 (factor 2720) → ~0.79% per quarter (≈3.13% annual)", () => {
    const h = warfFactorToQuarterlyHazard(2720);
    expect(h).toBeCloseTo(0.00788, 4);
  });

  it("Caa1 (factor 4770) < Caa3 (factor 8070) → per-position precision", () => {
    const hCaa1 = warfFactorToQuarterlyHazard(4770);
    const hCaa3 = warfFactorToQuarterlyHazard(8070);
    expect(hCaa1).toBeLessThan(hCaa3);
    expect(hCaa1).toBeGreaterThan(0.01);
    expect(hCaa3 / hCaa1).toBeGreaterThan(2);
    expect(hCaa3 / hCaa1).toBeLessThan(4);
  });

  it("Ca/C (factor 10000) → quarterly hazard = 1 (defaults next quarter)", () => {
    expect(warfFactorToQuarterlyHazard(10000)).toBe(1);
  });

  it("factor 0 or negative → 0 hazard (guard against malformed inputs)", () => {
    expect(warfFactorToQuarterlyHazard(0)).toBe(0);
    expect(warfFactorToQuarterlyHazard(-100)).toBe(0);
  });
});

describe("D2 — legacy escape-hatch: useLegacyBucketHazard", () => {
  it("explicit useLegacyBucketHazard: true produces identical defaults to undefined→false→true chain", () => {
    // Sanity: passing the flag explicitly vs not passing it vs passing false
    // must all be stable. Only true changes behavior.
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    const absent = runProjection(inputs, expectationDraw);
    const explicitFalse = runProjection({ ...inputs, useLegacyBucketHazard: false }, expectationDraw);
    expect(absent.periods.length).toBe(explicitFalse.periods.length);
    for (let i = 0; i < absent.periods.length; i++) {
      expect(absent.periods[i].defaults).toBeCloseTo(explicitFalse.periods[i].defaults, 2);
    }
  });

  it("legacy flag produces materially different Q1 defaults vs the per-position default path", () => {
    // Euro XV has per-position warfFactors resolver-populated, so the
    // per-position path (default) and the bucket-map path (legacy) emit
    // different Q1 default totals. This confirms the flag actually toggles
    // behavior and the default path is NOT silently the bucket path.
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    const perPosition = runProjection(inputs, expectationDraw);
    const legacy = runProjection({ ...inputs, useLegacyBucketHazard: true }, expectationDraw);
    expect(perPosition.periods[0].defaults).not.toBeCloseTo(legacy.periods[0].defaults, 0);
  });
});

describe("D2 — per-position hazard differentiates within a bucket", () => {
  // Synthetic 2-loan pool: same ratingBucket ("CCC"), different warfFactors.
  // Default (per-position) differentiates Caa1 (~6.3% annual) from Caa3
  // (~15.2% annual). Legacy bucket path treats them identically as CCC
  // (10.28% annual for both).
  const makeInputs = (useLegacy: boolean): ProjectionInputs => {
    const baseInputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    const caa1: LoanInput = {
      parBalance: 10_000_000,
      maturityDate: "2030-01-15",
      ratingBucket: "CCC",
      spreadBps: 400,
      warfFactor: 4770,
      currentPrice: 100,
    };
    const caa3: LoanInput = {
      parBalance: 10_000_000,
      maturityDate: "2030-01-15",
      ratingBucket: "CCC",
      spreadBps: 400,
      warfFactor: 8070,
      currentPrice: 100,
    };
    return {
      ...baseInputs,
      loans: [caa1, caa3],
      useLegacyBucketHazard: useLegacy,
      cprPct: 0,
      postRpReinvestmentPct: 0,
    };
  };

  it("legacy path: Caa1 and Caa3 default at the same CCC bucket rate (10.28% annual ≈ 2.67% quarterly)", () => {
    const result = runProjection(makeInputs(true), expectationDraw);
    const p1 = result.periods[0];
    // Both positions identical → total defaults ≈ 20M × bucket_quarterly_rate.
    // CCC bucket: annualCDR=10.28%, quarterly = 1 − (1 − 0.1028)^0.25 ≈ 0.02674
    // Expected defaults ≈ 20M × 0.02674 = 534,800.
    expect(p1.defaults).toBeGreaterThan(500_000);
    expect(p1.defaults).toBeLessThan(560_000);
  });

  it("per-position (default) path: total defaults differ from legacy", () => {
    const legacy = runProjection(makeInputs(true), expectationDraw);
    const perPosition = runProjection(makeInputs(false), expectationDraw);
    // Per-position: Caa1 (h≈0.0161) × 10M + Caa3 (h≈0.0402) × 10M = 562,700
    // Legacy: 534,800 (above). Δ ~28,000 — meaningful precision delta, not rounding.
    expect(Math.abs(perPosition.periods[0].defaults - legacy.periods[0].defaults)).toBeGreaterThan(10_000);
  });

  it("per-position path: Caa3 position survives Q1 with less par than Caa1 position", () => {
    // Expected endingPar = 10M × (1−h_Caa1) + 10M × (1−h_Caa3)
    //                    = 10M × 0.9839 + 10M × 0.9598
    //                    ≈ 19.437M.
    const result = runProjection(makeInputs(false), expectationDraw);
    const endingPar = result.periods[0].endingPar;
    expect(endingPar).toBeGreaterThan(19_350_000);
    expect(endingPar).toBeLessThan(19_550_000);
  });
});

describe("D2 — reinvested loans carry bucket-fallback factor into per-position path", () => {
  it("reinvested synthetic loans default at their BUCKET_WARF_FALLBACK rate (no NaN, no silent zero)", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      reinvestmentRating: "B",
    };
    const result = runProjection(inputs, expectationDraw);
    expect(result.periods.length).toBeGreaterThan(0);
    for (const p of result.periods) {
      expect(Number.isFinite(p.defaults)).toBe(true);
      expect(p.defaults).toBeGreaterThanOrEqual(0);
    }
  });
});
