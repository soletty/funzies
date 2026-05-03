/**
 * Resolver-level coverage of `isPik` propagation + the three-tier
 * blocking rule for PIK-bearing positions.
 *
 * Three-tier rule (anti-pattern #3 — silent fallbacks on extraction
 * failures are bugs, not defaults):
 *   (1) `isPik === true` (explicit) OR `isPik == null AND pikAmount > 0`
 *       → ResolvedLoan.isPik = true. Consumed by the switch-simulator's
 *       `pctPik` delta-recompute. Engine-side PIK accretion is NOT
 *       dispatched (binary boolean is structurally insufficient — see
 *       the active KI on PIK rate modeling).
 *   (2) `isPik === false AND pikAmount > 0` → blocking error (data-shape
 *       contradiction).
 *   (3) `pikAmount < 0` → blocking error (sign invariant).
 *   default: `isPik === false` (explicit) OR `isPik == null AND
 *   pikAmount in {null, 0}` → ResolvedLoan.isPik undefined or false; no
 *   warning (no PIK behavior demonstrated; default cash-paying is safe).
 *
 * The resolver-side derivation matches the parser-side derivation in
 * `parse-asset-level.ts` so existing DB rows ingested before the parser
 * change still surface as PIK in downstream consumers.
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

describe("resolver — isPik propagation + three-tier blocking", () => {
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
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount")).toHaveLength(0);
  });

  it("isPik=null + pikAmount>0 → derives isPik=true (resolver fallback for SDF DB rows)", () => {
    const holdings = [makeHolding({ obligorName: "Acme", isPik: null, pikAmount: 28101.56 })];
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
    // Derivation is silent (no warning) — matches the parser-side derivation.
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount")).toHaveLength(0);
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
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount")).toHaveLength(0);
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
    expect(warnings.filter(w => w.field === "isPik" || w.field === "pikAmount")).toHaveLength(0);
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
});
