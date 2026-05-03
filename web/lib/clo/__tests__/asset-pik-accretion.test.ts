/**
 * Asset-side PIK accretion engine dispatch.
 *
 * Invariant: when `loan.isPik === true`, the period's computed accrual
 * (`coupon × parBalance × dayFrac`, fixed or floating shape) accretes
 * to `loan.survivingPar` and adds zero to `interestCollected`. When
 * `loan.isPik` is false/undefined, the accrual flows as cash interest
 * as today.
 *
 * Pre-fix engine fed every loan's accrual into `interestCollected`
 * regardless of structural PIK status — over-counted cash interest by
 * ~coupon × parBalance × dayFrac per period on every PIK position.
 *
 * **Marker convention.** These tests are synthetic — Euro XV currently
 * has 12 holdings reporting positive `pikAmount` but the cash-flow
 * impact at the harness level is masked by the cascade against trustee
 * (see n1-correctness MAINTENANCE WARNING). The synthetic suite is the
 * load-bearing correctness assertion; absence of an Euro XV diff is
 * correct, not a coverage gap.
 */
import { describe, it, expect } from "vitest";
import { runProjection, addQuarters, dayCountFraction, LoanInput } from "../projection";
import { makeInputs, uniformRates } from "./test-helpers";

const PERIOD_START = "2026-03-09";
const PERIOD_END = "2026-06-09";
const FRAC_360 = dayCountFraction("actual_360", PERIOD_START, PERIOD_END);

describe("asset-side PIK accretion engine dispatch", () => {
  it("PIK loan accretes to survivingPar; non-PIK loan flows to interestCollected", () => {
    const cashLoan: LoanInput = {
      parBalance: 50_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 350,
      // isPik undefined → cash-paying (default)
    };
    const pikLoan: LoanInput = {
      parBalance: 50_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 350,
      isPik: true,
    };

    const result = runProjection(
      makeInputs({
        loans: [cashLoan, pikLoan],
        initialPar: 100_000_000,
        baseRatePct: 2.5,
        baseRateFloorPct: 0,
        defaultRatesByRating: uniformRates(0),
        cprPct: 0,
      })
    );

    // Expected interestCollected: ONLY the cash loan's accrual.
    const expectedCash = 50_000_000 * (2.5 + 3.5) / 100 * FRAC_360;
    expect(result.periods[0].interestCollected).toBeCloseTo(expectedCash, 0);

    // Pre-fix engine would feed BOTH loans' accruals into interestCollected.
    const preFixWrong = expectedCash * 2;
    expect(result.periods[0].interestCollected).not.toBeCloseTo(preFixWrong, 0);
  });

  it("PIK loan's survivingPar grows by the period's accrual", () => {
    const pikLoan: LoanInput = {
      parBalance: 100_000_000,
      maturityDate: addQuarters(PERIOD_START, 40),
      ratingBucket: "B",
      spreadBps: 350,
      isPik: true,
    };

    const result = runProjection(
      makeInputs({
        loans: [pikLoan],
        initialPar: 100_000_000,
        baseRatePct: 2.5,
        baseRateFloorPct: 0,
        defaultRatesByRating: uniformRates(0),
        cprPct: 0,
      })
    );

    // Period 1 accretion: par × allInRate × FRAC_360
    const expectedAccretion = 100_000_000 * (2.5 + 3.5) / 100 * FRAC_360;
    // No cash interest from this loan (PIK).
    expect(result.periods[0].interestCollected).toBeCloseTo(0, 0);
    // Total assets at end of P1 should reflect the par increase.
    // (Indirect check: equity book value or principal balance should
    // include the PIK accretion.)
    const p1 = result.periods[0];
    // The PIK accretion lives in surviving par; total pool par at end of
    // P1 = initialPar + accretion - defaults - prepayments - maturities.
    // With zero CDR/CPR and no Q1 maturity, change ≈ +accretion.
    const parDelta = (p1.endingPar ?? p1.beginningPar) - 100_000_000;
    expect(parDelta).toBeCloseTo(expectedAccretion, -2); // tolerate rounding
  });

  it("fixed-rate PIK loan accretes coupon × par × dayFrac (no spread/base)", () => {
    const fixedPik: LoanInput = {
      parBalance: 50_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 0,
      isFixedRate: true,
      fixedCouponPct: 8.0,
      isPik: true,
    };

    const result = runProjection(
      makeInputs({
        loans: [fixedPik],
        initialPar: 50_000_000,
        baseRatePct: 0, // irrelevant for fixed
        baseRateFloorPct: 0,
        defaultRatesByRating: uniformRates(0),
        cprPct: 0,
      })
    );

    // PIK fixed-rate: zero cash interest collected.
    expect(result.periods[0].interestCollected).toBeCloseTo(0, 0);
    // survivingPar grew by par × 8% × dayFrac.
    const expectedAccretion = 50_000_000 * 0.08 * FRAC_360;
    const parDelta = (result.periods[0].endingPar ?? 0) - 50_000_000;
    expect(parDelta).toBeCloseTo(expectedAccretion, -2);
  });

  it("PIK + cash mixed portfolio: interestCollected sums only cash legs", () => {
    const cashA: LoanInput = {
      parBalance: 100_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 300,
    };
    const cashB: LoanInput = {
      parBalance: 50_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 425,
    };
    const pikLoan: LoanInput = {
      parBalance: 30_000_000,
      maturityDate: addQuarters(PERIOD_START, 20),
      ratingBucket: "B",
      spreadBps: 525,
      isPik: true,
    };

    const result = runProjection(
      makeInputs({
        loans: [cashA, cashB, pikLoan],
        initialPar: 180_000_000,
        baseRatePct: 2.5,
        baseRateFloorPct: 0,
        defaultRatesByRating: uniformRates(0),
        cprPct: 0,
      })
    );

    // Only cash legs feed interestCollected.
    const expected =
      100_000_000 * (2.5 + 3.0) / 100 * FRAC_360 +
      50_000_000 * (2.5 + 4.25) / 100 * FRAC_360;
    expect(result.periods[0].interestCollected).toBeCloseTo(expected, 0);
  });
});
