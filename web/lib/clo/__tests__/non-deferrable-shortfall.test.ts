/**
 * Class A/B (non-deferrable) interest shortfall — engine carry-forward.
 *
 * PPM: missed interest on a non-deferrable tranche is NOT a PIK accrual onto
 * the tranche balance — it's an interest-payment shortfall that the engine
 * MUST carry forward and pay before any junior interest in subsequent
 * periods. The pre-fix engine dropped the shortfall silently (only deferrable
 * tranches accrued PIK; non-deferrable shortfalls vanished into equity).
 *
 * This test exercises the carry-forward invariant on a tunable stress
 * fixture: senior fee high enough that pool interest can't cover Class A's
 * full demand in early periods. The fix tracks `interestShortfall[A]` as
 * state and augments `dueByMember[A]` in the next period with the carried
 * amount.
 */

import { describe, it, expect } from "vitest";
import {
  runProjection,
  addQuarters,
  type ProjectionInputs,
  type LoanInput,
} from "../projection";
import { CLO_DEFAULTS } from "../defaults";
import { DEFAULT_RATES_BY_RATING } from "../rating-mapping";

function makeStressInputs(seniorFeePct: number): ProjectionInputs {
  const loans: LoanInput[] = Array.from({ length: 20 }, (_, i) => ({
    parBalance: 24_500_000,
    maturityDate: addQuarters("2026-03-09", 24 + (i % 8)),
    ratingBucket: "B" as const,
    spreadBps: 410,
  }));
  return {
    initialPar: 490_000_000,
    wacSpreadBps: 410,
    baseRatePct: CLO_DEFAULTS.baseRatePct,
    baseRateFloorPct: CLO_DEFAULTS.baseRateFloorPct,
    seniorFeePct,
    subFeePct: 0,
    trusteeFeeBps: 0,
    hedgeCostBps: 0,
    incentiveFeePct: 0,
    incentiveFeeHurdleIrr: 0,
    postRpReinvestmentPct: 0,
    callMode: "none",
    callDate: null,
    callPricePct: 100,
    callPriceMode: "par",
    reinvestmentOcTrigger: null,
    tranches: [
      { className: "A",   currentBalance: 245_000_000, spreadBps: 110, seniorityRank: 1, isFloating: true,  isIncomeNote: false, isDeferrable: false },
      { className: "B",   currentBalance:  50_000_000, spreadBps: 165, seniorityRank: 2, isFloating: true,  isIncomeNote: false, isDeferrable: false },
      { className: "C",   currentBalance:  50_000_000, spreadBps: 280, seniorityRank: 3, isFloating: true,  isIncomeNote: false, isDeferrable: true  },
      { className: "Sub", currentBalance:  30_000_000, spreadBps:   0, seniorityRank: 4, isFloating: false, isIncomeNote: true,  isDeferrable: false },
    ],
    ocTriggers: [],
    icTriggers: [],
    reinvestmentPeriodEnd: "2030-06-15",
    maturityDate: "2036-06-15",
    currentDate: "2026-03-09",
    loans,
    defaultRatesByRating: { ...DEFAULT_RATES_BY_RATING },
    cprPct: CLO_DEFAULTS.cprPct,
    recoveryPct: CLO_DEFAULTS.recoveryPct,
    recoveryLagMonths: CLO_DEFAULTS.recoveryLagMonths,
    reinvestmentSpreadBps: CLO_DEFAULTS.reinvestmentSpreadBps,
    reinvestmentTenorQuarters: CLO_DEFAULTS.reinvestmentTenorYears * 4,
    reinvestmentRating: null,
    cccBucketLimitPct: CLO_DEFAULTS.cccBucketLimitPct,
    cccMarketValuePct: CLO_DEFAULTS.cccMarketValuePct,
    deferredInterestCompounds: true,
    useLegacyBucketHazard: true,
  };
}

describe("Non-deferrable interest shortfall — carry-forward", () => {
  it("healthy run: interestShortfall stays empty / all-zero (no false positives)", () => {
    const result = runProjection(makeStressInputs(CLO_DEFAULTS.seniorFeePct));
    for (const p of result.periods) {
      // Healthy senior fee (~0.15%) leaves plenty for A and B every period.
      // The shortfall map should be empty (we filter zero entries on emission).
      expect(p.interestShortfall["A"] ?? 0).toBeCloseTo(0, 2);
      expect(p.interestShortfall["B"] ?? 0).toBeCloseTo(0, 2);
    }
  });

  it("stress: Q1 partial payment to Class A accrues shortfall (non-deferrable, not PIK)", () => {
    // Senior fee 8% per annum on $490M is ~$9.8M/quarter — exceeds the
    // ~$7.6M/quarter pool interest. Class A and B receive nothing; they
    // each accrue their full base demand to interestShortfall.
    const result = runProjection(makeStressInputs(8.0));
    const p1 = result.periods[0];
    const a1 = p1.trancheInterest.find((t) => t.className === "A")!;
    const b1 = p1.trancheInterest.find((t) => t.className === "B")!;

    // Confirm we're in the shortfall regime
    expect(a1.paid).toBeLessThan(a1.due);
    expect(b1.paid).toBeLessThan(b1.due);

    // Shortfall map records the unpaid amounts
    expect(p1.interestShortfall["A"]).toBeGreaterThan(0);
    expect(p1.interestShortfall["B"]).toBeGreaterThan(0);
    expect(p1.interestShortfall["A"]).toBeCloseTo(a1.due - a1.paid, 0);
    expect(p1.interestShortfall["B"]).toBeCloseTo(b1.due - b1.paid, 0);

    // Tranche BALANCE must NOT have grown — non-deferrable shortfall is
    // tracked separately, not PIKed onto principal (the bug shape was to
    // either drop it silently or PIK it incorrectly onto a non-deferrable).
    const aPrincipal = p1.tranchePrincipal.find((t) => t.className === "A")!;
    const bPrincipal = p1.tranchePrincipal.find((t) => t.className === "B")!;
    expect(aPrincipal.endBalance).toBeCloseTo(245_000_000, -3);
    expect(bPrincipal.endBalance).toBeCloseTo(50_000_000, -3);
  });

  it("carry-forward: Q2 effective `due` includes Q1's carried shortfall (engine demand augmented)", () => {
    // The fix's load-bearing invariant: in period N+1, the tranche's
    // `due` reflects base interest PLUS the carried shortfall from period N.
    // This is what makes the unpaid interest recoverable when liquidity
    // returns; without it, the shortfall would be silently lost (the
    // pre-fix bug).
    const result = runProjection(makeStressInputs(8.0));
    const p1 = result.periods[0];
    const p2 = result.periods[1];
    const a1 = p1.trancheInterest.find((t) => t.className === "A")!;
    const a2 = p2.trancheInterest.find((t) => t.className === "A")!;

    // Compute base demand independent of carryforward: A's BOP balance
    // hasn't been paid down (no principal flows in Q1 for fully-performing
    // long-dated loans), so Q2's base demand ≈ Q1's base demand.
    const baseDueQ1 = a1.due; // no carryforward in Q1
    const carriedFromQ1 = p1.interestShortfall["A"] ?? 0;
    expect(carriedFromQ1).toBeGreaterThan(0);

    // Q2 due ≈ base + carried (allowing for small balance drift across
    // the period from defaults / day-count differences).
    expect(a2.due).toBeGreaterThan(baseDueQ1);
    expect(a2.due).toBeCloseTo(baseDueQ1 + carriedFromQ1, -2);
  });

  it("non-deferrable shortfall does NOT mutate tranche balance (sanity vs PIK semantics)", () => {
    // Stricter version of the principal-balance check above: across many
    // periods of stress, A's principal balance only changes from principal
    // paydown (defaults / cure / maturity), never from interest shortfall.
    // This distinguishes the new shortfall mechanic from PIK.
    const result = runProjection(makeStressInputs(8.0));
    for (let i = 0; i < Math.min(8, result.periods.length); i++) {
      const a = result.periods[i].tranchePrincipal.find((t) => t.className === "A")!;
      // No principal proceeds reach A in the early loan-life periods (no
      // maturities, no defaults this severe with default rate set by
      // CLO_DEFAULTS). Balance is stable at original 245M.
      expect(a.endBalance).toBeCloseTo(245_000_000, -3);
    }
  });

  it("deferrable tranche (Class C) still PIKs its shortfall — fix doesn't disturb existing PIK semantics", () => {
    const result = runProjection(makeStressInputs(8.0));
    const p1 = result.periods[0];
    // C is deferrable → PIK accrues onto trancheBalance (compounding mode).
    // The shortfall map is for non-deferrable only and must NOT include C.
    expect(p1.interestShortfall["C"] ?? 0).toBeCloseTo(0, 2);
    // C's balance grew from PIK
    const cPrincipal = p1.tranchePrincipal.find((t) => t.className === "C")!;
    expect(cPrincipal.endBalance).toBeGreaterThan(50_000_000);
  });
});
