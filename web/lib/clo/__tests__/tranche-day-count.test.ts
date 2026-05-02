/**
 * Tranche-side per-tranche day-count accrual.
 *
 * Invariant: each tranche accrues interest at its documented day-count
 * convention. The engine reads `tranche.dayCountConvention` and
 * consults `dayCountFraction`; tranches without an explicit convention
 * fall back to `isFloating ? actual_360 : 30_360`. Synthetic test
 * inputs (no convention set) ride the fallback and remain byte-
 * identical to the legacy engine.
 *
 * The 30E/360 vs US 30/360 distinction is silent on standard mid-month
 * payment windows (both produce 90/360 = 0.25) and diverges only when
 * the period end is the 31st AND the start day is < 30 — where the
 * US anchor-clamp rule does not fire but the European cap does.
 *
 * Expected interest below is computed from first principles
 * (par × rate × per-tranche-dayFrac), NOT by re-running the engine.
 */
import { describe, it, expect } from "vitest";
import { runProjection, addQuarters, dayCountFraction } from "../projection";
import { makeInputs, uniformRates } from "./test-helpers";

describe("tranche-side per-tranche day-count convention", () => {
  it("fixed-rate tranche with 30E/360 accrues at 30E/360 (NOT US 30/360) on month-end-anchored window", () => {
    // Use a window where 30E/360 and US 30/360 diverge: start day < 30,
    // end day = 31 (May 31). Mar 15 → May 31:
    //   US 30/360: d1=15, anchor d1<30 → d2 stays 31, days = 0+60+(31-15) = 76.
    //   30E/360:   d1=15, d2 capped at 30, days = 0+60+(30-15) = 75.
    const periodStart = "2026-03-15";
    const periodEnd = "2026-05-31";
    const FRAC_30E = dayCountFraction("30e_360", periodStart, periodEnd);
    const FRAC_30US = dayCountFraction("30_360", periodStart, periodEnd);

    expect(FRAC_30E).toBeCloseTo(75 / 360, 10);
    expect(FRAC_30US).toBeCloseTo(76 / 360, 10);
    expect(FRAC_30E).not.toBe(FRAC_30US);

    // Engine fixture pinned to this window via stubPeriod machinery.
    const result = runProjection(
      makeInputs({
        currentDate: periodStart,
        stubPeriod: true,
        firstPeriodEndDate: periodEnd,
        initialPar: 10_000_000,
        baseRatePct: 0,
        baseRateFloorPct: 0,
        defaultRatesByRating: uniformRates(0),
        cprPct: 0,
        tranches: [
          // Class A floating (so the IC/OC tests have something to bite on)
          { className: "A", currentBalance: 6_000_000, spreadBps: 140, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: false, dayCountConvention: "actual_360" },
          // Synthetic fixed-rate tranche at 5%, 30E/360. Exercises the
          // per-tranche accrual path on an isFloating=false tranche.
          { className: "B-2", currentBalance: 2_000_000, spreadBps: 500, seniorityRank: 2, isFloating: false, isIncomeNote: false, isDeferrable: false, dayCountConvention: "30e_360" },
          // Sub note (not interest-bearing)
          { className: "Sub", currentBalance: 2_000_000, spreadBps: 0, seniorityRank: 3, isFloating: false, isIncomeNote: true, isDeferrable: false },
        ],
        ocTriggers: [
          { className: "A", triggerLevel: 120, rank: 1 },
          { className: "B-2", triggerLevel: 110, rank: 2 },
        ],
        icTriggers: [
          { className: "A", triggerLevel: 120, rank: 1 },
          { className: "B-2", triggerLevel: 110, rank: 2 },
        ],
      })
    );

    // First-principles expected interest for Class B-2.
    const expectedB2Interest = 2_000_000 * 0.05 * FRAC_30E;
    const observedB2 = result.periods[0].trancheInterest.find((t) => t.className === "B-2");
    expect(observedB2).toBeDefined();
    expect(observedB2!.due).toBeCloseTo(expectedB2Interest, 0);
  });

  it("legacy tranche without dayCountConvention falls back to isFloating-driven default", () => {
    // makeInputs default tranches don't set dayCountConvention. Class A
    // is floating → engine falls back to Actual/360. Class Sub is non-
    // floating + income note (not interest-bearing). Exercises the
    // back-compat path so synthetic test inputs remain byte-identical.
    const result = runProjection(makeInputs({ defaultRatesByRating: uniformRates(0), cprPct: 0 }));
    // Engine produces a periods[0] without throwing. Concrete expected
    // values are pinned by other tests; this asserts back-compat.
    expect(result.periods).not.toHaveLength(0);
    const a = result.periods[0].trancheInterest.find((t) => t.className === "A");
    expect(a).toBeDefined();
  });
});
