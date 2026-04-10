import type { ResolvedDealData } from "./resolver-types";
import type { ProjectionInputs } from "./projection";

export interface UserAssumptions {
  baseRatePct: number;
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
}

export const DEFAULT_ASSUMPTIONS: UserAssumptions = {
  baseRatePct: 2.0,
  defaultRates: {
    AAA: 0,
    AA: 0.02,
    A: 0.06,
    BBB: 0.18,
    BB: 1.06,
    B: 3.41,
    CCC: 10.28,
    NR: 2.0,
  },
  cprPct: 15,
  recoveryPct: 60,
  recoveryLagMonths: 12,
  reinvestmentSpreadBps: 350,
  reinvestmentTenorYears: 5,
  reinvestmentRating: null,
  cccBucketLimitPct: 7.5,
  cccMarketValuePct: 70,
  deferredInterestCompounds: true,
  postRpReinvestmentPct: 0,
  hedgeCostBps: 0,
  callDate: null,
};

export function buildFromResolved(
  resolved: ResolvedDealData,
  userAssumptions: UserAssumptions,
): ProjectionInputs {
  return {
    initialPar: resolved.poolSummary.totalPar,
    wacSpreadBps: resolved.poolSummary.wacSpreadBps,
    baseRatePct: userAssumptions.baseRatePct,
    seniorFeePct: resolved.fees.seniorFeePct,
    subFeePct: resolved.fees.subFeePct,
    trusteeFeeBps: resolved.fees.trusteeFeeBps,
    hedgeCostBps: userAssumptions.hedgeCostBps,
    incentiveFeePct: resolved.fees.incentiveFeePct,
    incentiveFeeHurdleIrr: resolved.fees.incentiveFeeHurdleIrr,
    postRpReinvestmentPct: userAssumptions.postRpReinvestmentPct,
    callDate: userAssumptions.callDate,
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
    loans: resolved.loans,
    defaultRatesByRating: userAssumptions.defaultRates,
    cprPct: userAssumptions.cprPct,
    recoveryPct: userAssumptions.recoveryPct,
    recoveryLagMonths: userAssumptions.recoveryLagMonths,
    reinvestmentSpreadBps: userAssumptions.reinvestmentSpreadBps,
    reinvestmentTenorQuarters: userAssumptions.reinvestmentTenorYears * 4,
    reinvestmentRating: userAssumptions.reinvestmentRating,
    cccBucketLimitPct: userAssumptions.cccBucketLimitPct,
    cccMarketValuePct: userAssumptions.cccMarketValuePct,
    deferredInterestCompounds: userAssumptions.deferredInterestCompounds,
  };
}
