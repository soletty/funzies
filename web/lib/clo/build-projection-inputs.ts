import type { ResolvedDealData } from "./resolver-types";
import type { ProjectionInputs } from "./projection";
import { CLO_DEFAULTS } from "./defaults";
import { DEFAULT_RATES_BY_RATING } from "./rating-mapping";

// Empty resolved data — used when no deal data has been loaded yet.
// Produces a ProjectionInputs that will fail validation (initialPar = 0)
// but won't crash. This eliminates the need for a separate safe-default
// code path in the UI component.
export const EMPTY_RESOLVED: ResolvedDealData = {
  tranches: [],
  poolSummary: {
    totalPar: 0, totalPrincipalBalance: 0, wacSpreadBps: 0, warf: 0, walYears: 0, diversityScore: 0, numberOfObligors: 0,
    numberOfAssets: null, totalMarketValue: null, waRecoveryRate: null,
    pctFixedRate: null, pctCovLite: null, pctPik: null, pctCccAndBelow: null,
    pctBonds: null, pctSeniorSecured: null, pctSecondLien: null, pctCurrentPay: null,
  },
  ocTriggers: [],
  icTriggers: [],
  qualityTests: [],
  concentrationTests: [],
  reinvestmentOcTrigger: null,
  dates: { maturity: "", reinvestmentPeriodEnd: null, nonCallPeriodEnd: null, firstPaymentDate: null, currentDate: new Date().toISOString().slice(0, 10) },
  fees: { seniorFeePct: 0, subFeePct: 0, trusteeFeeBps: 0, incentiveFeePct: 0, incentiveFeeHurdleIrr: 0 },
  loans: [],
  metadata: { reportDate: null, dataSource: null, sdfFilesIngested: [], pdfExtracted: [] },
  principalAccountCash: 0,
  preExistingDefaultedPar: 0,
  preExistingDefaultRecovery: 0,
  unpricedDefaultedPar: 0,
  preExistingDefaultOcValue: 0,
  discountObligationHaircut: 0,
  longDatedObligationHaircut: 0,
  impliedOcAdjustment: 0,
  quartersSinceReport: 0,
  ddtlUnfundedPar: 0,
  deferredInterestCompounds: true,
  baseRateFloorPct: null,
};

export interface UserAssumptions {
  baseRatePct: number;
  baseRateFloorPct: number;
  defaultRates: Record<string, number>;
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
  reinvestmentTenorYears: number;
  reinvestmentRating: string | null;
  cccBucketLimitPct: number;
  cccMarketValuePct: number;
  deferredInterestCompounds: boolean;
  postRpReinvestmentPct: number;
  hedgeCostBps: number;
  callDate: string | null;
  callPricePct: number; // liquidation price % (semantics depend on callPriceMode)
  // Call-liquidation pricing semantics (A3):
  //   'multiplier' (default): per-position price = currentPrice × callPricePct/100
  //   'flat': every position sells at callPricePct regardless of market price
  callPriceMode: "multiplier" | "flat";
  ddtlDrawAssumption: 'draw_at_deadline' | 'never_draw' | 'custom_quarter';
  ddtlDrawQuarter: number;
  ddtlDrawPercent: number;
  // Fee overrides — user can adjust these via sliders.
  // Pre-filled from resolved PPM data, but user has final say.
  seniorFeePct: number;
  subFeePct: number;
  trusteeFeeBps: number;
  incentiveFeePct: number;
  incentiveFeeHurdleIrr: number; // as percentage (e.g. 12 for 12%), converted to decimal internally
  // Equity (sub note) entry price in cents of sub note par. Used for secondary-
  // market IRR calc. When set, buildFromResolved converts to an absolute €
  // cost basis = subNotePar × (equityEntryPriceCents / 100). Null = fall back
  // to engine default (bookValue).
  equityEntryPriceCents: number | null;
}

export const DEFAULT_ASSUMPTIONS: UserAssumptions = {
  baseRatePct: CLO_DEFAULTS.baseRatePct,
  baseRateFloorPct: CLO_DEFAULTS.baseRateFloorPct,
  defaultRates: { ...DEFAULT_RATES_BY_RATING },
  cprPct: CLO_DEFAULTS.cprPct,
  recoveryPct: CLO_DEFAULTS.recoveryPct,
  recoveryLagMonths: CLO_DEFAULTS.recoveryLagMonths,
  reinvestmentSpreadBps: CLO_DEFAULTS.reinvestmentSpreadBps,
  reinvestmentTenorYears: CLO_DEFAULTS.reinvestmentTenorYears,
  reinvestmentRating: null,
  cccBucketLimitPct: CLO_DEFAULTS.cccBucketLimitPct,
  cccMarketValuePct: CLO_DEFAULTS.cccMarketValuePct,
  deferredInterestCompounds: true,
  postRpReinvestmentPct: 0,
  hedgeCostBps: 0,
  callDate: null,
  callPricePct: 100,
  callPriceMode: "multiplier",
  ddtlDrawAssumption: 'draw_at_deadline' as const,
  ddtlDrawQuarter: CLO_DEFAULTS.ddtlDrawQuarter,
  ddtlDrawPercent: CLO_DEFAULTS.ddtlDrawPercent,
  seniorFeePct: CLO_DEFAULTS.seniorFeePct,
  subFeePct: CLO_DEFAULTS.subFeePct,
  trusteeFeeBps: CLO_DEFAULTS.trusteeFeeBps,
  incentiveFeePct: CLO_DEFAULTS.incentiveFeePct,
  incentiveFeeHurdleIrr: CLO_DEFAULTS.incentiveFeeHurdleIrr,
  equityEntryPriceCents: null,
};

export function buildFromResolved(
  resolved: ResolvedDealData,
  userAssumptions: UserAssumptions,
): ProjectionInputs {
  // Resolve DDTL draw quarter from user assumption
  const ddtlDrawQuarter = userAssumptions.ddtlDrawAssumption === 'never_draw'
    ? 0
    : userAssumptions.ddtlDrawAssumption === 'custom_quarter'
      ? userAssumptions.ddtlDrawQuarter
      : CLO_DEFAULTS.ddtlDrawQuarter; // draw_at_deadline default

  // Set drawQuarter on DDTL loans
  const loans = resolved.loans.map(l => l.isDelayedDraw
    ? { ...l, drawQuarter: ddtlDrawQuarter }
    : l
  );

  // Equity entry price: if user assumption is set in cents, resolve against
  // sub note ORIGINAL par (face at issuance). The buyer's cost basis is a
  // one-time invariant set at the purchase event — using currentBalance
  // would silently drift once the sub note amortizes (post-RP or any
  // principal redemption), producing a lower cost basis than the buyer
  // actually paid and overstating forward IRR.
  // The engine's `ProjectionInputs.equityEntryPrice` field is an absolute €.
  const subNote = resolved.tranches.find(t => t.isIncomeNote);
  const subNoteFaceAtPurchase = subNote?.originalBalance ?? 0;
  const equityEntryPrice =
    userAssumptions.equityEntryPriceCents != null && subNoteFaceAtPurchase > 0
      ? subNoteFaceAtPurchase * (userAssumptions.equityEntryPriceCents / 100)
      : undefined;

  return {
    initialPar: resolved.poolSummary.totalPar,
    wacSpreadBps: resolved.poolSummary.wacSpreadBps,
    baseRatePct: userAssumptions.baseRatePct,
    baseRateFloorPct: userAssumptions.baseRateFloorPct,
    seniorFeePct: userAssumptions.seniorFeePct,
    subFeePct: userAssumptions.subFeePct,
    trusteeFeeBps: userAssumptions.trusteeFeeBps,
    hedgeCostBps: userAssumptions.hedgeCostBps,
    incentiveFeePct: userAssumptions.incentiveFeePct,
    incentiveFeeHurdleIrr: userAssumptions.incentiveFeeHurdleIrr / 100, // convert from % to decimal
    postRpReinvestmentPct: userAssumptions.postRpReinvestmentPct,
    callDate: userAssumptions.callDate,
    callPricePct: userAssumptions.callPricePct,
    callPriceMode: userAssumptions.callPriceMode,
    reinvestmentOcTrigger: resolved.reinvestmentOcTrigger,
    tranches: resolved.tranches.map(t => ({
      className: t.className,
      currentBalance: t.currentBalance,
      spreadBps: t.spreadBps,
      seniorityRank: t.seniorityRank,
      isFloating: t.isFloating,
      isIncomeNote: t.isIncomeNote,
      isDeferrable: t.isDeferrable,
      isAmortising: t.isAmortising,
      amortisationPerPeriod: t.amortisationPerPeriod,
      amortStartDate: t.amortStartDate,
    })),
    ocTriggers: resolved.ocTriggers.map(t => ({
      className: t.className,
      triggerLevel: t.triggerLevel,
      rank: t.rank,
    })),
    icTriggers: resolved.icTriggers.map(t => ({
      className: t.className,
      triggerLevel: t.triggerLevel,
      rank: t.rank,
    })),
    maturityDate: resolved.dates.maturity,
    reinvestmentPeriodEnd: resolved.dates.reinvestmentPeriodEnd,
    currentDate: resolved.dates.currentDate,
    loans,
    defaultRatesByRating: userAssumptions.defaultRates,
    cprPct: userAssumptions.cprPct,
    recoveryPct: userAssumptions.recoveryPct,
    recoveryLagMonths: userAssumptions.recoveryLagMonths,
    reinvestmentSpreadBps: userAssumptions.reinvestmentSpreadBps,
    reinvestmentTenorQuarters: userAssumptions.reinvestmentTenorYears * 4,
    reinvestmentRating: userAssumptions.reinvestmentRating,
    cccBucketLimitPct: userAssumptions.cccBucketLimitPct,
    cccMarketValuePct: userAssumptions.cccMarketValuePct,
    deferredInterestCompounds: userAssumptions.deferredInterestCompounds ?? resolved.deferredInterestCompounds,
    initialPrincipalCash: resolved.principalAccountCash,
    preExistingDefaultedPar: resolved.preExistingDefaultedPar,
    preExistingDefaultRecovery: resolved.preExistingDefaultRecovery,
    unpricedDefaultedPar: resolved.unpricedDefaultedPar,
    preExistingDefaultOcValue: resolved.preExistingDefaultOcValue,
    discountObligationHaircut: resolved.discountObligationHaircut,
    longDatedObligationHaircut: resolved.longDatedObligationHaircut,
    impliedOcAdjustment: resolved.impliedOcAdjustment,
    quartersSinceReport: resolved.quartersSinceReport,
    ddtlDrawPercent: userAssumptions.ddtlDrawPercent,
    ...(equityEntryPrice != null ? { equityEntryPrice } : {}),
  };
}
