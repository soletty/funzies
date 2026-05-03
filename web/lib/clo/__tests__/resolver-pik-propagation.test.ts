/**
 * Resolver-level coverage of PIK classification + propagation
 * (KI-62 sub-fix A — additive forward PIK rate).
 *
 * Two propagated fields, distinct semantics:
 *   - `isPik` (boolean, observability): "structurally PIK" — pikAmount > 0
 *     OR explicit override. Used by the switch-simulator's pctPik
 *     recompute as the "actively accreting PIK" signal (note: in the
 *     post-KI-62 simulator, `pctPik` is keyed on `pikSpreadBps > 0`, not
 *     on `isPik`).
 *   - `pikSpreadBps` (number, engine dispatch): live forward PIK rate in
 *     basis points (sourced from SDF `Current_Facility_Spread_PIK`).
 *     Engine accretes `par × pikSpreadBps/10000 × dayFrac` to surviving
 *     par each period when > 0.
 *
 * Blocking ladder (anti-pattern #3):
 *   (a) pikAmount < 0                          → block (sign)
 *   (b) pikSpreadBps < 0                       → block (sign)
 *   (c) pikSpreadBps > 1500 (=15%)             → block (implausibility)
 *   (d) isPik=false AND pikAmount > 0          → block (contradiction)
 *   (e) pikAmount > 0 AND pikSpreadBps == null → block (extraction gap)
 *
 * Successful propagation:
 *   - pikAmount > 0 + pikSpreadBps == 0  → isPik=true,  pikSpreadBps=0
 *     (Tele Columbus shape: structurally PIK, toggle currently off)
 *   - pikAmount > 0 + pikSpreadBps > 0   → isPik=true,  pikSpreadBps=N
 *     (Financiere shape: structurally PIK, actively accreting)
 *   - pikAmount in {null,0} + pikSpreadBps unset → isPik=undefined,
 *     pikSpreadBps=undefined (cash-paying, default).
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
    pikSpreadBps: null,
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

describe("resolver — PIK propagation (isPik + pikSpreadBps) + blocking ladder", () => {
  it("explicit isPik=true propagates to ResolvedLoan", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: true })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.isPik).toBe(true);
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount" || w.field === "pikSpreadBps")).toHaveLength(0);
  });

  it("Financiere shape: pikAmount>0 + pikSpreadBps=100 → isPik=true, pikSpreadBps=100", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: 28101.56, pikSpreadBps: 100 })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.isPik).toBe(true);
    expect(loan!.pikSpreadBps).toBe(100);
    // Silent derivation — no warnings.
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount" || w.field === "pikSpreadBps")).toHaveLength(0);
  });

  it("Tele Columbus shape: pikAmount>0 + pikSpreadBps=0 → isPik=true, pikSpreadBps=0 (toggle off)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: 581032.34, pikSpreadBps: 0 })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.isPik).toBe(true);
    expect(loan!.pikSpreadBps).toBe(0);
    // Extraction succeeded (pikSpreadBps=0); no block, no warning.
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount" || w.field === "pikSpreadBps")).toHaveLength(0);
  });

  it("isPik=null + pikAmount>0 + pikSpreadBps=null → blocking error (extraction gap)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: 28101.56 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "pikSpreadBps" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
    expect(blocking[0].message).toContain("missing");
  });

  it("isPik=null + pikAmount=0 → leaves isPik undefined (default cash-paying)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: 0 })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.isPik).toBeUndefined();
    expect(loan!.pikSpreadBps).toBeUndefined();
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount" || w.field === "pikSpreadBps")).toHaveLength(0);
  });

  it("explicit isPik=false propagates to ResolvedLoan as false", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: false, pikAmount: null })];
    const { resolved, warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const loan = resolved.loans.find(l => l.obligorName === "Acme");
    expect(loan).toBeDefined();
    expect(loan!.isPik).toBe(false);
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount" || w.field === "pikSpreadBps")).toHaveLength(0);
  });

  it("isPik=false + pikAmount>0 → blocking error (data-shape contradiction)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: false, pikAmount: 5000 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "isPik" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
    expect(blocking[0].message).toContain("contradict");
  });

  it("pikAmount<0 → blocking error (sign invariant)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: -1000 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "pikAmount" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
    expect(blocking[0].message).toContain("negative");
  });

  it("pikSpreadBps<0 → blocking error (sign invariant)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", pikSpreadBps: -50 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "pikSpreadBps" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
    expect(blocking[0].message).toContain("negative");
  });

  it("pikSpreadBps>1500 → blocking error (implausibility ceiling)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", pikSpreadBps: 1600 })];
    const { warnings } = resolveWaterfallInputs(
      baseConstraints as unknown as ExtractedConstraints,
      { poolSummary: minimalPool as CloPoolSummary, complianceTests: [], concentrations: [] },
      [],
      [],
      holdings,
    );
    const blocking = warnings.filter(
      w => w.field === "pikSpreadBps" && w.blocking && w.message.includes("Acme"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].severity).toBe("error");
    expect(blocking[0].message).toContain("15%");
  });
});
