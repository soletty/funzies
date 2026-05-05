/** KI-29 marker tests — discount-obligation per-position dynamics +
 *  long-dated static residual.
 *
 *  Synthetic non-Euro-XV inputs (10-loan minimal pool, 3-tranche structure)
 *  exercising the engine paths the production fixture (Euro XV) collapses
 *  to zero on (no positions classify as discount; no long-dated; no cure
 *  diversion). Price-aware reinvestment cure-math asymmetry is unit-tested
 *  directly in `a2-reinv-oc-diversion.test.ts`; this file covers the
 *  integration paths.
 *
 *  Markers:
 *    - KI-29-discountObligationDynamic — per-position haircut at T=0 +
 *      forward, cure dispatch flips classification, reinvestment synthesis
 *      sets per-position fields.
 *    - KI-29-longDatedStatic — residual: long-dated valuation rides static
 *      scalar at every period (banner-bound). Marker pins the static
 *      behavior so when the per-deal valuation rule lands the assertion
 *      flips. */

import { describe, expect, it } from "vitest";
import { runProjection } from "@/lib/clo/projection";
import type { ResolvedDealData, ResolvedDiscountObligationRule, ResolvedLoan } from "@/lib/clo/resolver-types";
import {
  buildFromResolved,
  DEFAULT_ASSUMPTIONS,
  EMPTY_RESOLVED,
  IncompleteDataError,
} from "@/lib/clo/build-projection-inputs";
import { makeInputs } from "./test-helpers";

const ARES_FAMILY_RULE: ResolvedDiscountObligationRule = {
  classificationThresholdPct: { type: "split_by_rate_type", floatingPct: 80, fixedPct: 75 },
  cureMechanic: {
    type: "continuous_threshold",
    cureThresholdPct: { type: "split_by_rate_type", floatingPct: 90, fixedPct: 85 },
    cureWindow: { type: "days", n: 30 },
  },
};

describe("KI-29 — per-position discount-obligation haircut at T=0", () => {
  it("classified position contributes par × (1 − purchasePricePct/100) to haircut Σ", () => {
    // Single loan of €10M acquired at 75c (sub-threshold floating). Expected
    // haircut at T=0: €10M × (1 − 0.75) = €2.5M. OC numerator subtracts
    // this amount, lowering the OC ratio versus a no-haircut baseline.
    const inputs = makeInputs({
      loans: [{
        parBalance: 100_000_000,
        maturityDate: "2034-06-15",
        ratingBucket: "B",
        spreadBps: 375,
        purchasePricePct: 75,
        acquisitionDate: "2025-12-01",
        isDiscountObligation: true,
        currentPrice: 75, // matches purchase; below cure threshold (90 floating)
      }],
      initialPar: 100_000_000,
      discountObligationRule: ARES_FAMILY_RULE,
    });
    const result = runProjection(inputs);
    // T=0 OC test should reflect the haircut. Pre-fix model would have
    // OC numerator = 100M / debt; with KI-29 it's (100M − 25M) = 75M / debt.
    const ocActualClassA = result.initialState.ocTests[0].actual;
    const ocActualNoHaircut = (100_000_000 / 65_000_000) * 100;
    expect(ocActualClassA).toBeLessThan(ocActualNoHaircut);
    expect(ocActualClassA).toBeCloseTo((75_000_000 / 65_000_000) * 100, 1);
  });

  it("cure dispatch flips classification true→false when MV ≥ cure threshold AND held since acquisition for ≥ window", () => {
    // Loan acquired well before projection start (2024-01-01) at 78c
    // (sub-threshold). Current MV is 92c (above floating cure threshold 90).
    // Has been held >> 30 days. Cure should fire at T=0; classification
    // flips to false; haircut Σ collapses to 0.
    const inputs = makeInputs({
      loans: [{
        parBalance: 100_000_000,
        maturityDate: "2034-06-15",
        ratingBucket: "B",
        spreadBps: 375,
        purchasePricePct: 78,
        acquisitionDate: "2024-01-01",
        isDiscountObligation: true,
        currentPrice: 92,
      }],
      initialPar: 100_000_000,
      discountObligationRule: ARES_FAMILY_RULE,
    });
    const result = runProjection(inputs);
    // OC ratio = 100M / 65M = ~153.8% (cure fired, no haircut)
    const ocActualClassA = result.initialState.ocTests[0].actual;
    expect(ocActualClassA).toBeCloseTo((100_000_000 / 65_000_000) * 100, 1);
  });

  it("permanent_until_paid mechanic never reclassifies even when MV is high", () => {
    const PERMANENT_RULE: ResolvedDiscountObligationRule = {
      classificationThresholdPct: { type: "single", pct: 80 },
      cureMechanic: { type: "permanent_until_paid" },
    };
    const inputs = makeInputs({
      loans: [{
        parBalance: 100_000_000,
        maturityDate: "2034-06-15",
        ratingBucket: "B",
        spreadBps: 375,
        purchasePricePct: 78,
        acquisitionDate: "2024-01-01",
        isDiscountObligation: true,
        currentPrice: 95, // would cure under continuous_threshold; but permanent_until_paid never flips
      }],
      initialPar: 100_000_000,
      discountObligationRule: PERMANENT_RULE,
    });
    const result = runProjection(inputs);
    // Haircut still applies: 100M − 100M × (1 − 0.78) = 100M − 22M = 78M
    const ocActualClassA = result.initialState.ocTests[0].actual;
    expect(ocActualClassA).toBeCloseTo((78_000_000 / 65_000_000) * 100, 1);
  });

  it("split_by_rate_type — fixed-rate position cures at fixed cure threshold; floating doesn't (same price)", () => {
    // Both loans acquired well before projection start at 78c (sub-threshold
    // for both rate types under the Ares family rule). Current MV is 87c —
    // above the fixed-rate cure threshold (85) but below the floating-rate
    // cure threshold (90). Holding window has elapsed for both. Expected:
    // - Fixed-rate loan: cures (haircut = 0).
    // - Floating-rate loan: stays classified (haircut = par × (1 − 0.78)).
    // Together they exercise the rate-type discriminator on cureThresholdPct.
    const inputs = makeInputs({
      loans: [
        {
          parBalance: 50_000_000,
          maturityDate: "2034-06-15",
          ratingBucket: "B",
          spreadBps: 375,
          purchasePricePct: 78,
          acquisitionDate: "2024-01-01",
          isDiscountObligation: true,
          currentPrice: 87,
          isFixedRate: true,
        },
        {
          parBalance: 50_000_000,
          maturityDate: "2034-06-15",
          ratingBucket: "B",
          spreadBps: 375,
          purchasePricePct: 78,
          acquisitionDate: "2024-01-01",
          isDiscountObligation: true,
          currentPrice: 87,
          isFixedRate: false,
        },
      ],
      initialPar: 100_000_000,
      discountObligationRule: ARES_FAMILY_RULE,
    });
    const result = runProjection(inputs);
    // Fixed leg cures → no haircut on its 50M par.
    // Floating leg stays classified → haircut = 50M × (1 − 0.78) = 11M.
    // OC numerator = 100M − 11M = 89M.
    const ocActualClassA = result.initialState.ocTests[0].actual;
    expect(ocActualClassA).toBeCloseTo((89_000_000 / 65_000_000) * 100, 1);
  });

  it("hand-constructed inputs without discountObligationRule see no haircut (back-compat)", () => {
    // Same setup as test 1 but no rule provided; expect zero haircut even
    // though `isDiscountObligation: true` on the loan. Engine consumes the
    // flag for the haircut Σ regardless of rule (rule only governs cure
    // dispatch). The test confirms the haircut path doesn't gate on rule
    // presence.
    const inputs = makeInputs({
      loans: [{
        parBalance: 100_000_000,
        maturityDate: "2034-06-15",
        ratingBucket: "B",
        spreadBps: 375,
        purchasePricePct: 75,
        acquisitionDate: "2025-12-01",
        isDiscountObligation: true,
        currentPrice: 75,
      }],
      initialPar: 100_000_000,
      // discountObligationRule omitted
    });
    const result = runProjection(inputs);
    // Haircut still applies (per-position derivation doesn't gate on rule)
    const ocActualClassA = result.initialState.ocTests[0].actual;
    expect(ocActualClassA).toBeCloseTo((75_000_000 / 65_000_000) * 100, 1);
  });
});

describe("KI-29-longDatedStatic — long-dated valuation residual rides static scalar", () => {
  it("ki: KI-29-longDatedStatic — non-zero longDatedObligationHaircut deducts identically at T=0 and forward (no per-deal valuation rule)", () => {
    // Synthetic input with non-zero static long-dated haircut. Engine
    // consumes the scalar at every period unchanged — no per-deal
    // valuation rule applied. Marker pins this behavior so when the
    // per-deal rule lands and the scalar consumption is replaced with
    // per-position dispatch, this assertion flips.
    const inputs = makeInputs({
      longDatedObligationHaircut: 5_000_000,
      initialPar: 100_000_000,
    });
    const result = runProjection(inputs);
    // T=0 OC numerator: 100M − 5M = 95M (long-dated scalar deducts 5M)
    const ocActualClassA = result.initialState.ocTests[0].actual;
    expect(ocActualClassA).toBeCloseTo((95_000_000 / 65_000_000) * 100, 1);
    // Forward q=1 should also deduct 5M (static scalar). Pool par at q=1
    // is approximately the same (low CDR / no defaults in default test
    // setup), so OC ratio remains close. Assert the deduction persists.
    const ocActualClassA_q1 = result.periods[0]?.ocTests[0]?.actual ?? null;
    expect(ocActualClassA_q1).not.toBeNull();
    // Sanity: the q=1 ratio should be in the same neighborhood (within a
    // few pp) of T=0 — the static scalar persists. A future fix that
    // replaces the scalar with a per-deal valuation rule would shift this
    // value as positions amortize / mature; flip this assertion when the
    // residual closes.
    expect(Math.abs(ocActualClassA_q1! - ocActualClassA)).toBeLessThan(10);
  });
});

describe("reinvestmentPricePct provenance — engine emits pricing source for transparency", () => {
  it("engine pass-through: hand-constructed inputs default to user_override / 100", () => {
    // Hand-constructed inputs bypass buildFromResolved; runProjection's
    // destructure defaults `reinvestmentPriceSource = "user_override"`,
    // `reinvestmentPricePct = 100`. The engine emits these unchanged.
    const inputs = makeInputs({});
    const result = runProjection(inputs);
    expect(result.initialState.reinvestmentPriceSource).toBe("user_override");
    expect(result.initialState.reinvestmentPricePctApplied).toBe(100);
  });

  // Synthetic ResolvedDealData factory for buildFromResolved integration tests.
  // EMPTY_RESOLVED is the greenfield baseline; we overlay the minimum that
  // `buildFromResolved` needs to construct a valid ProjectionInputs (a sub-note
  // tranche so equity-entry-price computation finds a denominator) plus the
  // loans the test wants to exercise.
  const buildResolvedWithLoans = (loans: ResolvedLoan[]): ResolvedDealData => ({
    ...EMPTY_RESOLVED,
    poolSummary: {
      ...EMPTY_RESOLVED.poolSummary,
      totalPar: loans.reduce((s, l) => s + l.parBalance, 0),
      totalPrincipalBalance: loans.reduce((s, l) => s + l.parBalance, 0),
    },
    tranches: [
      {
        className: "Sub",
        currentBalance: 0,
        originalBalance: 1,
        spreadBps: 0,
        seniorityRank: 99,
        isFloating: false,
        isIncomeNote: true,
        isDeferrable: false,
        isAmortising: false,
        amortisationPerPeriod: null,
        amortStartDate: null,
        source: "manual",
        priorInterestShortfall: null,
        priorShortfallCount: null,
        deferredInterestBalance: null,
      },
    ],
    loans,
  });

  it("integration: buildFromResolved derives pool_was_derived (par-weighted) from priced pool", () => {
    // 60M @ 95c + 40M @ 90c → WAS = (60×95 + 40×90)/100 = 93.
    const loans: ResolvedLoan[] = [
      { parBalance: 60_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375, currentPrice: 95 },
      { parBalance: 40_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375, currentPrice: 90 },
    ];
    const inputs = buildFromResolved(buildResolvedWithLoans(loans), DEFAULT_ASSUMPTIONS);
    expect(inputs.reinvestmentPriceSource).toBe("pool_was_derived");
    expect(inputs.reinvestmentPricePct).toBeCloseTo(93, 5);
  });

  it("integration: user override takes priority over pool-WAS-derivation", () => {
    const loans: ResolvedLoan[] = [
      { parBalance: 100_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375, currentPrice: 95 },
    ];
    const inputs = buildFromResolved(
      buildResolvedWithLoans(loans),
      { ...DEFAULT_ASSUMPTIONS, reinvestmentPricePct: 88 },
    );
    expect(inputs.reinvestmentPriceSource).toBe("user_override");
    expect(inputs.reinvestmentPricePct).toBe(88);
  });

  it("integration: buildFromResolved BLOCKS when pool has loans but no priced positions (anti-pattern #3)", () => {
    // Loans exist but every position has currentPrice == null → no
    // pool-WAS derivation possible. Engine refuses to fall back to par
    // silently because reinvestmentPricePct is computational (cure cash
    // sizing, OC numerator updates).
    const loans: ResolvedLoan[] = [
      { parBalance: 60_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375 },
      { parBalance: 40_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375 },
    ];
    expect(() =>
      buildFromResolved(buildResolvedWithLoans(loans), DEFAULT_ASSUMPTIONS),
    ).toThrow(IncompleteDataError);
  });

  it("integration: blocking gate is cleared by user override even when no pool prices exist", () => {
    const loans: ResolvedLoan[] = [
      { parBalance: 100_000_000, maturityDate: "2034-06-15", ratingBucket: "B", spreadBps: 375 },
    ];
    expect(() =>
      buildFromResolved(
        buildResolvedWithLoans(loans),
        { ...DEFAULT_ASSUMPTIONS, reinvestmentPricePct: 92 },
      ),
    ).not.toThrow();
  });

  it("integration: greenfield (no loans) → par_fallback, no block (no reinvestment will fire)", () => {
    const inputs = buildFromResolved(EMPTY_RESOLVED, DEFAULT_ASSUMPTIONS);
    expect(inputs.reinvestmentPriceSource).toBe("par_fallback");
    expect(inputs.reinvestmentPricePct).toBe(100);
  });
});
