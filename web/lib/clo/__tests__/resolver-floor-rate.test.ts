/**
 * Resolver-level coverage of per-loan floorRate sign + scale invariants.
 *
 * Boundary contract (anti-pattern #5: boundaries assert sign and scale):
 *   - SDF Collateral File parser delivers `floor_rate` in PERCENT scale
 *     (0.5 = 50bp, NOT 50%) and rejects > 50% via magnitude validator.
 *   - Resolver propagates floorRate to ResolvedLoan unchanged.
 *   - Sign: negative → blocking error (structurally meaningless).
 *   - Implausibility: > 5% → severity:"warn" (typical 0.0–1.0%; anything
 *     above is likely a scale or locale mis-parse that the magnitude
 *     validator's wider 50% band missed).
 *
 * These tests are a structural pin: a future refactor that drops the
 * sign or implausibility checks would silently regress the boundary.
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints, CloHolding, CloPoolSummary } from "@/lib/clo/types";

function makeHolding(overrides: Partial<CloHolding>): CloHolding {
  return {
    id: "h-" + (overrides.obligorName ?? "x"),
    reportPeriodId: "rp-1",
    obligorName: "Test Obligor",
    facilityName: null,
    isin: null,
    lxid: null,
    assetType: "Loan",
    currency: "EUR",
    country: null,
    industryCode: null,
    industryDescription: null,
    moodysIndustry: null,
    spIndustry: null,
    isCovLite: null,
    isRevolving: null,
    isDelayedDraw: false,
    isDefaulted: false,
    isPik: null,
    isFixedRate: false,
    isDiscountObligation: null,
    isLongDated: null,
    settlementStatus: null,
    acquisitionDate: null,
    maturityDate: "2031-12-15",
    parBalance: 5_000_000,
    principalBalance: 5_000_000,
    marketValue: 99,
    purchasePrice: null,
    currentPrice: 99,
    accruedInterest: null,
    referenceRate: "EURIBOR",
    indexRate: null,
    spreadBps: 350,
    allInRate: null,
    floorRate: null,
    moodysRating: "B2",
    moodysRatingSource: null,
    spRating: "B",
    spRatingSource: null,
    fitchRating: "B",
    compositeRating: "B",
    ratingFactor: null,
    recoveryRateMoodys: null,
    recoveryRateSp: null,
    recoveryRateFitch: null,
    remainingLifeYears: null,
    warfContribution: null,
    diversityScoreGroup: null,
    premiumDiscountAmount: null,
    discountAmount: null,
    premiumAmount: null,
    grossPurchasePrice: null,
    unfundedCommitment: null,
    nativeCurrencyBalance: null,
    nativeCurrency: "EUR",
    issueDate: null,
    nextPaymentDate: null,
    defaultDate: null,
    defaultReason: null,
    accrualBeginDate: null,
    accrualEndDate: null,
    callDate: null,
    putDate: null,
    moodysIssuerRating: null,
    moodysIssuerSrUnsecRating: null,
    spIssuerRating: null,
    fitchIssuerRating: null,
    moodysSecurityRating: null,
    spSecurityRating: null,
    fitchSecurityRating: null,
    moodysRatingFinal: null,
    spRatingFinal: null,
    fitchRatingFinal: null,
    moodysDpRating: null,
    moodysRatingUnadjusted: null,
    moodysIssuerWatch: null,
    moodysSecurityWatch: null,
    spIssuerWatch: null,
    spSecurityWatch: null,
    securityLevelMoodys: null,
    securityLevelSp: null,
    securityLevel: null,
    lienType: null,
    spPriorityCategory: null,
    spIndustryCode: null,
    moodysIndustryCode: null,
    fitchIndustryCode: null,
    kbraRating: null,
    kbraRecoveryRate: null,
    kbraIndustry: null,
    pikAmount: null,
    creditSpreadAdj: null,
    affiliateId: null,
    guarantor: null,
    isSovereign: null,
    isEnhancedBond: null,
    isCurrentPay: null,
    isInterestOnly: null,
    isPrincipalOnly: null,
    ...overrides,
  } as CloHolding;
}

const baseConstraints = {
  deal: null,
  keyDates: null,
  payFreqMonths: null,
  feeSchedule: { fees: [] },
  ocTests: { tests: [] },
  icTests: { tests: [] },
  concentrations: { limits: [] },
  waterfall: { clauses: [] },
  ccc: { bucketLimitPct: null, valuationPct: null, valuationMode: null },
  waterfallType: null,
};

const minimalPool: Partial<CloPoolSummary> = {
  totalPar: 5_000_000,
  totalPrincipalBalance: 5_000_000,
  wacSpread: 3.5,
  warf: 3000,
  walYears: 4.0,
  diversityScore: 60,
  numberOfObligors: 1,
};

describe("resolver — per-loan floorRate sign + scale invariants", () => {
  it("propagates a valid PERCENT-scale floorRate to ResolvedLoan unchanged", () => {
    const holdings = [makeHolding({ obligorName: "Acme", floorRate: 0.5 })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.floorRate).toBe(0.5);
    const floorWarns = warnings.filter(w => w.field === "floorRate");
    expect(floorWarns).toHaveLength(0);
  });

  it("propagates undefined when floorRate is null (legacy / no-floor positions)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", floorRate: null })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.floorRate).toBeUndefined();
    const floorWarns = warnings.filter(w => w.field === "floorRate");
    expect(floorWarns).toHaveLength(0);
  });

  it("emits blocking error on negative floorRate (sign invariant)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", floorRate: -0.1 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "floorRate" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
  });

  it("emits non-blocking warn on implausibly-high floorRate (>5%)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", floorRate: 7.0 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const warns = warnings.filter(
      w => w.field === "floorRate" && !w.blocking && w.message.includes("Acme"),
    );
    expect(warns).toHaveLength(1);
    expect(warns[0].severity).toBe("warn");
    expect(warns[0].message).toContain("implausibly high");
  });
});
