/**
 * C2 — Quality/concentration forward-projection.
 *
 * Engine now emits `PeriodResult.qualityMetrics` = { warf, walYears,
 * wacSpreadBps, pctCccAndBelow } each period. Mirrors the shape of
 * `resolved.poolSummary.{warf,walYears,wacSpreadBps,pctCccAndBelow}` so
 * partners can watch compliance drift over the projection instead of only
 * seeing T=0 numbers.
 *
 * What these tests guard:
 * - T=0 parity: forward-projected period-1 metrics should match the resolver's
 *   reported metrics within day-count tolerance (pool hasn't amortised yet).
 * - Reinvestment sensitivity: if `reinvestmentSpreadBps` is high, WAS at a
 *   future period should trend upward as reinvested collateral replaces
 *   amortising originals.
 * - Default sensitivity: heavy defaults shrink the remaining pool. Metrics
 *   remain finite (no NaN from empty-pool division) and track the surviving
 *   composition.
 * - WAL monotonicity: forward periods shouldn't suddenly report a LONGER WAL
 *   than T=0 (absent reinvestment), because every loan's time-to-maturity
 *   shortens by exactly 0.25y per quarter.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DefaultDrawFn } from "@/lib/clo/projection";
import { runProjection } from "@/lib/clo/projection";
import { buildFromResolved, defaultsFromResolved } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: Parameters<typeof defaultsFromResolved>[1];
};

// Forced-default helper: every loan loses `frac` of par in period 1. Used to
// exercise the "heavy defaults" path without relying on Monte Carlo variance.
const forceFrac = (frac: number, onlyPeriod: number = 1): DefaultDrawFn => {
  let period = 0;
  let lastSurvivingPar = Infinity;
  return (survivingPar: number) => {
    if (survivingPar > lastSurvivingPar) period++;
    lastSurvivingPar = survivingPar;
    return period === onlyPeriod - 1 ? survivingPar * frac : 0;
  };
};

describe("C2 — qualityMetrics emitted each period", () => {
  it("every period has a qualityMetrics object with finite numbers", () => {
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    const result = runProjection(inputs);
    for (const p of result.periods) {
      expect(p.qualityMetrics).toBeDefined();
      expect(Number.isFinite(p.qualityMetrics.warf)).toBe(true);
      expect(Number.isFinite(p.qualityMetrics.walYears)).toBe(true);
      expect(Number.isFinite(p.qualityMetrics.wacSpreadBps)).toBe(true);
      expect(Number.isFinite(p.qualityMetrics.pctCccAndBelow)).toBe(true);
      expect(p.qualityMetrics.warf).toBeGreaterThanOrEqual(0);
      expect(p.qualityMetrics.pctCccAndBelow).toBeGreaterThanOrEqual(0);
      expect(p.qualityMetrics.pctCccAndBelow).toBeLessThanOrEqual(100);
    }
  });
});

describe("C2 — T=0 parity with resolver poolSummary", () => {
  it("period-1 WARF, WAL, WAS match resolver within day-count tolerance", () => {
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    // Disable Monte Carlo defaults so the period-1 emit reflects a static-pool
    // snapshot comparable to the trustee's pre-default poolSummary. Without
    // this, the engine's deterministic default-draw `(par, hz) => par * hz`
    // applied to Euro XV's B-heavy bucket (3.41% annualized CDR) produces
    // partial defaults on every B-rated loan in period 1; the new partial-
    // default filter at projection.ts:1421 (`defaultedParPending > 0 → continue`)
    // then drops those loans from the qualityMetrics view, skewing the pool
    // composition reported in period 1 away from the trustee snapshot. The
    // T=0 parity check is about methodology alignment, not default mechanics.
    const result = runProjection(inputs, () => 0);
    const p1 = result.periods[0];

    // Resolver poolSummary values (from trustee report):
    //   warf: 3035, walYears: 4.15, wacSpreadBps: 368, pctCccAndBelow: 6.92
    const { warf, walYears, wacSpreadBps, pctCccAndBelow } = fixture.resolved.poolSummary;

    // WARF: per-position warfFactor flows from ResolvedLoan. Engine average
    // should be very close to trustee. Use a ±10% tolerance because of the
    // (documented) NR-bucket proxy and any unresolved ratings.
    expect(p1.qualityMetrics.warf).toBeGreaterThan(warf * 0.9);
    expect(p1.qualityMetrics.warf).toBeLessThan(warf * 1.1);

    // WAL: engine measures from q=1 (end of period 1), trustee measures from
    // determination date. One quarter = 0.25y difference — stay within ±0.5y.
    expect(Math.abs(p1.qualityMetrics.walYears - walYears)).toBeLessThan(0.5);

    // WAS: engine implements PPM Condition 1 (PDF pp. 302-305) Floating WAS +
    // Excess WAC. On Euro XV the engine reports ~367 bps vs trustee 368 bps —
    // a ~1 bps drift well within ±5 bps tolerance. Remaining drift reflects
    // small numerical differences (e.g. par rounding, day-count edge effects).
    expect(Math.abs(p1.qualityMetrics.wacSpreadBps - wacSpreadBps)).toBeLessThan(5);

    // pctCccAndBelow: trustee reports max across agencies. Engine implements
    // per-agency Caa/CCC rollups (PPM Condition 1, PDF pp. 127, 138) and
    // takes the max. The rating ladder (resolve-rating.ts) now resolves
    // Moody's/Fitch via SDF channels → Intex shadow channels → cross-agency
    // derivation. On Euro XV the ~1.3pp residual drift is closed once the
    // fixture's `raw.intexPositions` carries the Apollo / Awaze / Mar Bidco
    // shadow ratings (BNY trustee redacts these as `***`; only Intex
    // publishes them). Tolerance stays at ±2pp until the fixture is
    // regenerated with Intex positions; tightening to ±0.1pp is a
    // mechanical follow-up at that point.
    if (pctCccAndBelow != null) {
      expect(Math.abs(p1.qualityMetrics.pctCccAndBelow - pctCccAndBelow)).toBeLessThan(2);
    }
  });
});

describe("C2 — WAL monotonicity without reinvestment", () => {
  it("WAL decreases (or holds) across periods in an amortise-only scenario", () => {
    // Turn off post-RP reinvestment so amortising loans purely shorten WAL.
    const inputs = buildFromResolved(fixture.resolved, {
      ...defaultsFromResolved(fixture.resolved, fixture.raw),
      postRpReinvestmentPct: 0,
      cprPct: 0,
    });
    const result = runProjection(inputs);
    // Find periods AFTER reinvestment ends (all reinvestment is done in RP
    // via OC cures + reinv diversion; outside RP the pool strictly shortens).
    const reinvEnd = inputs.reinvestmentPeriodEnd ? new Date(inputs.reinvestmentPeriodEnd).getTime() : 0;
    const postRpPeriods = result.periods.filter((p) => new Date(p.date).getTime() > reinvEnd);
    if (postRpPeriods.length < 2) return; // deal too short; nothing to check
    // Each post-RP period's WAL should be ≤ the previous (within 0.3y slack
    // for rounding and partial-period boundary effects).
    for (let i = 1; i < postRpPeriods.length; i++) {
      expect(postRpPeriods[i].qualityMetrics.walYears).toBeLessThanOrEqual(
        postRpPeriods[i - 1].qualityMetrics.walYears + 0.3,
      );
    }
  });
});

describe("C2 — reinvestment composition tracking", () => {
  it("WAS trends toward reinvestmentSpreadBps when reinvestment is aggressive", () => {
    // Force post-RP reinvestment at a spread materially different from the
    // portfolio WAC (368 bps on Euro XV). Use 600 bps so the delta is visible.
    const reinvestmentSpreadBps = 600;
    const inputs = buildFromResolved(fixture.resolved, {
      ...defaultsFromResolved(fixture.resolved, fixture.raw),
      reinvestmentSpreadBps,
      postRpReinvestmentPct: 100,
      cprPct: 20, // boost amortisation so reinvestment is material
    });
    // Disable defaults — see T=0 parity test above for the rationale. With
    // defaults active, both periods see only the surviving non-defaulted-
    // pending portion of the pool, which converges to the reinvestment
    // composition (all 600 bps) much faster than this directional test
    // expects, producing equality (`600 to be greater than 600`).
    const result = runProjection(inputs, () => 0);
    // Pool WAS at T=0 (368) should be lower than WAS several years out as
    // reinvested positions enter. Check the delta is directionally correct
    // rather than pinning a specific number.
    const p1 = result.periods[0];
    const pLate = result.periods[Math.min(result.periods.length - 1, 15)]; // ~3-4 years out
    expect(pLate.qualityMetrics.wacSpreadBps).toBeGreaterThan(p1.qualityMetrics.wacSpreadBps);
  });
});

describe("C2 — heavy defaults don't break metrics", () => {
  it("forced 30% default in period 1 leaves metrics finite + consistent", () => {
    const inputs = buildFromResolved(fixture.resolved, {
      ...defaultsFromResolved(fixture.resolved, fixture.raw),
      recoveryPct: 40,
      cprPct: 0,
    });
    const result = runProjection(inputs, forceFrac(0.3, 1));
    for (const p of result.periods) {
      expect(Number.isFinite(p.qualityMetrics.warf)).toBe(true);
      expect(Number.isFinite(p.qualityMetrics.walYears)).toBe(true);
      expect(p.qualityMetrics.wacSpreadBps).toBeGreaterThanOrEqual(0);
    }
  });
});
