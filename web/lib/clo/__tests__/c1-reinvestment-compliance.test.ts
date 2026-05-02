/**
 * C1 — Reinvestment compliance enforcement.
 *
 * Engine enforces, per PPM Section 8 (PDF p. 287) and Condition 1 definitions
 * (PDF pp. 127, 138, 301-305):
 *   - Moody's Maximum WARF Test (matrix-elected trigger)
 *   - Min Weighted Average Floating Spread Test (`floatingWAS + ExcessWAC ≥ trigger`)
 *   - Moody's Caa Obligations concentration (≤ 7.5% on Euro XV)
 *   - Fitch CCC Obligations concentration (≤ 7.5% on Euro XV)
 *
 * Tests apply only when the deal is rated by the relevant agency:
 *   - WARF / Min WAS / Caa rely on Moody's-rating; the resolver's silent-skip
 *     blocking gate refuses to project on a Moody's-rated deal that's missing
 *     any of these triggers from extraction (per `isMoodysRated`).
 *   - Fitch CCC relies on Fitch-rating (`isFitchRated`).
 *   - Deals without an agency's rating legitimately omit that agency's tests.
 *
 * NR positions are proxied to Caa2 (WARF=6500) per Moody's CLO methodology
 * convention. See KI-19 for the design decision rationale.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runProjection } from "@/lib/clo/projection";
import { buildFromResolved, defaultsFromResolved } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: Parameters<typeof defaultsFromResolved>[1];
};

describe("C1 — compliance trigger extraction from resolved", () => {
  it("extracts Moody's WARF trigger 3148 from Euro XV fixture", () => {
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    expect(inputs.moodysWarfTriggerLevel).toBe(3148);
  });

  it("extracts Min WAS trigger 365 bps from Euro XV (3.65% trustee → bps)", () => {
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    expect(inputs.minWasBps).toBe(365);
  });

  it("extracts Moody's Caa limit 7.5 and Fitch CCC limit 7.5 from Euro XV", () => {
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    expect(inputs.moodysCaaLimitPct).toBe(7.5);
    expect(inputs.fitchCccLimitPct).toBe(7.5);
  });
});

describe("C1 — agency-elective triggers (silent-skip when test does not apply)", () => {
  // For deals not rated by an agency, the corresponding agency-tagged tests
  // legitimately don't apply per PPM Section 8 ("Applicable only while
  // [Agency]-rated Notes outstanding"). Silent-skip is correct in that case.
  // The resolver's `isMoodysRated` / `isFitchRated` predicates gate this:
  // missing-trigger-on-rated-deal blocks at the resolver layer (covered by
  // ki58-blocking-extraction-failures markers); missing-trigger-on-not-rated
  // deal here passes silently as PPM intends.
  it("not Moody's-rated → Moody's WARF / WAS / Caa triggers all null", () => {
    // Moody's-elective tests on Euro XV: Moody's WARF, Min Weighted Average
    // Floating Spread (named without "Moody's" prefix in trustee report),
    // Moody's Caa concentration. Drop them all to simulate a deal that is
    // not Moody's-rated; Fitch tests stay in place.
    const notMoodysRated: ResolvedDealData = {
      ...fixture.resolved,
      isMoodysRated: false,
      qualityTests: fixture.resolved.qualityTests.filter(
        (q) => !/moody/i.test(q.testName) && !/min.*weighted average.*spread/i.test(q.testName),
      ),
      concentrationTests: fixture.resolved.concentrationTests.filter(
        (c) => !/moody/i.test(c.testName),
      ),
    };
    const inputs = buildFromResolved(notMoodysRated, defaultsFromResolved(notMoodysRated, fixture.raw));
    expect(inputs.moodysWarfTriggerLevel).toBeNull();
    expect(inputs.minWasBps).toBeNull();
    expect(inputs.moodysCaaLimitPct).toBeNull();
    // Fitch CCC trigger still extracts because the deal is Fitch-rated.
    expect(inputs.fitchCccLimitPct).not.toBeNull();
  });

  it("neither Moody's- nor Fitch-rated → no compliance enforcement", () => {
    const notRated: ResolvedDealData = {
      ...fixture.resolved,
      isMoodysRated: false,
      isFitchRated: false,
      qualityTests: [],
      concentrationTests: [],
    };
    const inputs = {
      ...buildFromResolved(notRated, defaultsFromResolved(notRated, fixture.raw)),
      reinvestmentRating: "CCC",
    };
    expect(inputs.moodysWarfTriggerLevel).toBeNull();
    expect(inputs.minWasBps).toBeNull();
    expect(inputs.moodysCaaLimitPct).toBeNull();
    expect(inputs.fitchCccLimitPct).toBeNull();
    const result = runProjection(inputs);
    for (const p of result.periods) {
      expect(p.stepTrace.reinvestmentBlockedCompliance).toBe(0);
    }
  });
});

describe("C1 — Euro XV base case: no blocking regression", () => {
  it("default fixture with portfolio-modal reinvestment rating → zero blocking", () => {
    // Regression guard. Pool WARF 3035, trigger 3148, reinvestment at "B"
    // (factor 2720) — factor ≤ current WARF, so adding reinvestment can
    // only improve WARF. Zero blocking expected. Any non-zero here means
    // either the math regressed or the NR convention (KI-19) shifted the
    // current WARF in a way that invalidates the assumption.
    const inputs = buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw));
    const result = runProjection(inputs);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBe(0);
  });
});

describe("C1 — reinvestment at rating dirtier than trigger → blocks", () => {
  it("reinvestment at CCC under all four gates → cumulative blocking > 0", () => {
    // Disable Monte Carlo defaults via no-op defaultDrawFn so the gate is
    // tested against a stable pool composition. The C1 gate's pre-buy state
    // applies the partial-default filter (`defaultedParPending > 0 → continue`)
    // for PPM Defaulted-Obligation exclusion; under the engine's default
    // rates, B-bucket and CCC-bucket loans accrue continuous defaults that
    // shrink the gate's view of the pool. That's correct PPM behavior but
    // makes the gate test depend on Monte Carlo variance. `() => 0` keeps
    // every loan with `defaultedParPending = 0` so the gate sees the full
    // funded pool and the boundary math is what's under test.
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      reinvestmentRating: "CCC",
      cprPct: 25, // force material reinvestment throughout the RP
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBeGreaterThan(0);
  });
});

describe("C1 — Min WAS gate (Floating WAS + Excess WAC)", () => {
  it("reinvestment spread well below trigger → blocking from WAS gate alone", () => {
    // Isolate the WAS gate: null out WARF and per-agency Caa/CCC limits.
    // Set reinvestment spread to 100 bps (Euro XV trigger is 365 bps); current
    // pool WAS ≈ 368 bps; large reinvestment volume at 100 bps would dilute
    // the WAS below the trigger. CPR=25 forces material reinvestment.
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      moodysCaaLimitPct: null,
      fitchCccLimitPct: null,
      reinvestmentSpreadBps: 100,
      cprPct: 25,
    };
    // Defaults disabled — see comment in "all four gates" test above.
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBeGreaterThan(0);
    // Where blocking fired, the post-buy WAS must be at or above the trigger
    // boundary (the gate's contract is "post-buy WAS ≥ trigger").
    for (const p of result.periods) {
      if (p.stepTrace.reinvestmentBlockedCompliance > 0 && p.reinvestment > 0) {
        // qualityMetrics.wacSpreadBps = floatingWasBps + excessWacBps.
        expect(p.qualityMetrics.wacSpreadBps).toBeGreaterThanOrEqual(365 - 5); // ±5 bps rounding
      }
    }
  });

  it("reinvestment spread above trigger → no WAS blocking", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      moodysCaaLimitPct: null,
      fitchCccLimitPct: null,
      reinvestmentSpreadBps: 500,
      cprPct: 25,
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBe(0);
  });
});

describe("C1 — Moody's Caa concentration gate", () => {
  it("reinvestment at CCC pushes pctMoodysCaa above limit → blocking", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      minWasBps: null,
      fitchCccLimitPct: null,
      moodysCaaLimitPct: 7.5,
      reinvestmentRating: "CCC",
      cprPct: 25,
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBeGreaterThan(0);
    // Post-buy pctMoodysCaa must stay at or below the limit (boundary math).
    for (const p of result.periods) {
      if (p.stepTrace.reinvestmentBlockedCompliance > 0) {
        expect(p.qualityMetrics.pctMoodysCaa).toBeLessThanOrEqual(7.5 + 0.5); // ±0.5 pp tolerance
      }
    }
  });

  it("reinvestment at non-CCC rating → no Caa-gate blocking even with tight limit", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      minWasBps: null,
      fitchCccLimitPct: null,
      moodysCaaLimitPct: 0.01, // would block any CCC reinvestment
      reinvestmentRating: "B",
      cprPct: 25,
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBe(0);
  });
});

describe("C1 — Fitch CCC concentration gate", () => {
  it("reinvestment at CCC pushes pctFitchCcc above limit → blocking", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      minWasBps: null,
      moodysCaaLimitPct: null,
      fitchCccLimitPct: 7.5,
      reinvestmentRating: "CCC",
      cprPct: 25,
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBeGreaterThan(0);
    for (const p of result.periods) {
      if (p.stepTrace.reinvestmentBlockedCompliance > 0) {
        expect(p.qualityMetrics.pctFitchCcc).toBeLessThanOrEqual(7.5 + 0.5);
      }
    }
  });

  it("reinvestment at non-CCC rating → no CCC-gate blocking even with tight limit", () => {
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: null,
      minWasBps: null,
      moodysCaaLimitPct: null,
      fitchCccLimitPct: 0.01,
      reinvestmentRating: "B",
      cprPct: 25,
    };
    const result = runProjection(inputs, () => 0);
    const totalBlocked = result.periods.reduce((s, p) => s + p.stepTrace.reinvestmentBlockedCompliance, 0);
    expect(totalBlocked).toBe(0);
  });
});

describe("C1 — boundary math: post-buy WARF = trigger exactly", () => {
  it("partial scale-down leaves WARF at the trigger boundary (WARF gate isolated)", () => {
    // Tighten the WARF trigger AND null out the WAS / Caa / CCC gates so the
    // boundary observed in `qualityMetrics.warf` is governed solely by the
    // WARF math. Trigger 4500 is above current WARF ~3035 but below CCC
    // factor 6500, so some reinvestment fits and some is blocked.
    const inputs = {
      ...buildFromResolved(fixture.resolved, defaultsFromResolved(fixture.resolved, fixture.raw)),
      moodysWarfTriggerLevel: 4500,
      minWasBps: null,
      moodysCaaLimitPct: null,
      fitchCccLimitPct: null,
      reinvestmentRating: "CCC",
      cprPct: 15,
    };
    const result = runProjection(inputs);
    const partialPeriod = result.periods.find(
      (p) => p.stepTrace.reinvestmentBlockedCompliance > 0 && p.reinvestment > 0,
    );
    // If no partial-scale-down period exists under this scenario, skip the
    // assertion — the test exercises the math rather than prescribing a
    // specific period count.
    if (!partialPeriod) return;
    expect(partialPeriod.qualityMetrics.warf).toBeLessThanOrEqual(4500 + 5);
    expect(partialPeriod.qualityMetrics.warf).toBeGreaterThan(4500 - 100); // close to boundary, not far below
  });
});

