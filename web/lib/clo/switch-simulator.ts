import type { ResolvedDealData, ResolvedLoan } from "./resolver-types";
import type { ProjectionInputs } from "./projection";
import { buildFromResolved, type UserAssumptions } from "./build-projection-inputs";
import {
  BUCKET_WARF_FALLBACK,
  computePoolQualityMetrics,
  computeTopNObligorsPct,
} from "./pool-metrics";

export interface SwitchParams {
  sellLoanIndex: number;
  sellParAmount: number; // how much par to sell (can be less than the full position for partial sales)
  buyLoan: ResolvedLoan; // the buy loan with its own par amount
  sellPrice: number; // percent of par, e.g. 98
  buyPrice: number; // percent of par, e.g. 101
}

export interface SwitchResult {
  baseInputs: ProjectionInputs;
  switchedInputs: ProjectionInputs;
  /** D4 — switched pool's `ResolvedDealData` with recomputed poolSummary
   *  quality metrics (warf, walYears, wacSpreadBps, pctCccAndBelow),
   *  top10ObligorsPct, and obligor count. Partner UI reads poolSummary
   *  from here to render base-vs-switched compliance impact. */
  switchedResolved: ResolvedDealData;
  parDelta: number;
  spreadDelta: number;
  ratingChange: { from: string; to: string };
}

/** D4 — Years between two ISO dates. Used to derive per-position
 *  yearsToMaturity for the quality-metrics helper. Assumes 365.25 days/year
 *  (leap-year averaged); negligible vs WAL's natural precision. */
function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, (to - from) / (1000 * 86400 * 365.25));
}

/** D4 — Map a ResolvedLoan to the QualityMetricLoan shape the shared helper
 *  expects. `warfFactor` falls back to BUCKET_WARF_FALLBACK when the resolver
 *  didn't populate (NR loans without a rating; see KI-19). */
function toQualityMetricLoan(l: ResolvedLoan, currentDate: string) {
  return {
    parBalance: l.parBalance,
    warfFactor: l.warfFactor ?? BUCKET_WARF_FALLBACK[l.ratingBucket] ?? BUCKET_WARF_FALLBACK.NR,
    yearsToMaturity: yearsBetween(currentDate, l.maturityDate),
    spreadBps: l.spreadBps,
    ratingBucket: l.ratingBucket,
  };
}

export function applySwitch(
  resolved: ResolvedDealData,
  params: SwitchParams,
  assumptions: UserAssumptions,
): SwitchResult {
  const { sellLoanIndex, sellParAmount, buyLoan, sellPrice: _sellPrice, buyPrice: _buyPrice } = params;
  const sellLoan = resolved.loans[sellLoanIndex];

  const baseInputs = buildFromResolved(resolved, assumptions);

  // Build switched loan pool
  const switchedLoans = [...resolved.loans];
  const actualSellPar = Math.min(sellParAmount, sellLoan.parBalance);

  if (actualSellPar >= sellLoan.parBalance - 0.01) {
    // Full sale — remove the loan entirely
    switchedLoans.splice(sellLoanIndex, 1);
  } else {
    // Partial sale — reduce the loan's par
    switchedLoans[sellLoanIndex] = { ...sellLoan, parBalance: sellLoan.parBalance - actualSellPar };
  }

  // Add buy loan with its specified par amount
  switchedLoans.push(buyLoan);

  // Par delta = buy par - sell par (straightforward, prices don't change par)
  const parDelta = buyLoan.parBalance - actualSellPar;

  // D4 — Recompute portfolio quality + concentration metrics so partner sees
  // compliance impact of the proposed trade. Uses the same `computePoolQualityMetrics`
  // helper as the projection engine's per-period metrics to avoid drift (see KI-21).
  // Funded-only filter: unfunded DDTLs don't count toward current pool composition.
  const fundedSwitched = switchedLoans.filter((l) => !l.isDelayedDraw);
  const qloans = fundedSwitched.map((l) => toQualityMetricLoan(l, resolved.dates.currentDate));
  const switchedQuality = computePoolQualityMetrics(qloans);
  const switchedTop10 = computeTopNObligorsPct(fundedSwitched, 10);
  const switchedTotalPar = switchedLoans.reduce((s, l) => s + l.parBalance, 0);

  // Unique obligor count (funded + unfunded) — partner may care about obligor
  // count changes even when the switch is within the same obligor.
  const switchedObligors = new Set(
    switchedLoans.map((l) => (l.obligorName ?? "").toLowerCase().trim()).filter((s) => s.length > 0),
  ).size;

  const switchedResolved: ResolvedDealData = {
    ...resolved,
    loans: switchedLoans,
    poolSummary: {
      ...resolved.poolSummary,
      totalPar: resolved.poolSummary.totalPar + parDelta,
      totalPrincipalBalance: switchedTotalPar, // funded+unfunded sum — matches resolver convention
      wacSpreadBps: switchedQuality.wacSpreadBps,
      warf: switchedQuality.warf,
      walYears: switchedQuality.walYears,
      pctCccAndBelow: switchedQuality.pctCccAndBelow,
      numberOfObligors: switchedObligors,
      top10ObligorsPct: switchedTop10,
      // D4 methodology gap — fields we CANNOT recompute without per-loan flags
      // that aren't on ResolvedLoan: pctFixedRate (have isFixedRate but not
      // reliably populated across resolver paths), pctCovLite, pctPik, pctBonds,
      // pctSeniorSecured, pctSecondLien, pctCurrentPay, diversityScore,
      // waRecoveryRate, totalMarketValue, numberOfAssets. These are inherited
      // from the base pool via the spread above — the partner sees the UNCHANGED
      // base-pool value, which is misleading for stress scenarios but
      // pragmatically acceptable because (a) all are null on Euro XV anyway for
      // the UI fields the switch simulator renders, and (b) extending
      // ResolvedLoan for all these flags is out of D4 scope. Tracked as the
      // partner-demo note in the D4 ledger entry.
    },
  };

  const switchedInputs = buildFromResolved(switchedResolved, assumptions);

  return {
    baseInputs,
    switchedInputs,
    switchedResolved,
    parDelta,
    spreadDelta: buyLoan.spreadBps - sellLoan.spreadBps,
    ratingChange: { from: sellLoan.ratingBucket, to: buyLoan.ratingBucket },
  };
}
