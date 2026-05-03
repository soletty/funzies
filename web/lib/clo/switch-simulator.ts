import type { ResolvedDealData, ResolvedLoan, ResolutionWarning } from "./resolver-types";
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
 *  didn't populate (NR loans without a rating; see KI-19). Per-agency ratings
 *  and exclusion flags propagate so the helper can apply the PPM Condition 1
 *  Floating WAS / Excess WAC / per-agency Caa-CCC methodology. */
function toQualityMetricLoan(l: ResolvedLoan, currentDate: string) {
  return {
    parBalance: l.parBalance,
    warfFactor: l.warfFactor ?? BUCKET_WARF_FALLBACK[l.ratingBucket] ?? BUCKET_WARF_FALLBACK.NR,
    yearsToMaturity: yearsBetween(currentDate, l.maturityDate),
    spreadBps: l.spreadBps,
    ratingBucket: l.ratingBucket,
    isFixedRate: l.isFixedRate,
    fixedCouponPct: l.fixedCouponPct,
    isDeferring: l.isDeferring,
    isLossMitigationLoan: l.isLossMitigationLoan,
    currency: l.currency,
    moodysRatingFinal: l.moodysRatingFinal,
    fitchRatingFinal: l.fitchRatingFinal,
  };
}

export function applySwitch(
  resolved: ResolvedDealData,
  params: SwitchParams,
  assumptions: UserAssumptions,
  // When threaded, resolver warnings flow into the buildFromResolved
  // gate calls below; a blocking warning then throws IncompleteDataError
  // out of applySwitch. Optional (mirrors buildFromResolved's contract);
  // any new caller must thread warnings or accept that the gate is
  // bypassed for that call path.
  warnings?: ResolutionWarning[],
): SwitchResult {
  const { sellLoanIndex, sellParAmount, buyLoan, sellPrice: _sellPrice, buyPrice: _buyPrice } = params;
  const sellLoan = resolved.loans[sellLoanIndex];

  const baseInputs = buildFromResolved(resolved, assumptions, warnings);

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
  const switchedQuality = computePoolQualityMetrics(qloans, {
    referenceWAFC: resolved.referenceWeightedAverageFixedCoupon ?? undefined,
    dealCurrency: resolved.currency,
  });
  const switchedTop10 = computeTopNObligorsPct(fundedSwitched, 10);
  const switchedTotalPar = switchedLoans.reduce((s, l) => s + l.parBalance, 0);

  // Unique obligor count (funded + unfunded) — partner may care about obligor
  // count changes even when the switch is within the same obligor.
  const switchedObligors = new Set(
    switchedLoans.map((l) => (l.obligorName ?? "").toLowerCase().trim()).filter((s) => s.length > 0),
  ).size;

  // pctCovLite delta-recompute. The deal-level pctCovLite from
  // poolSummary already carries its own coverage (it's sourced from the
  // concentrations table or pool-summary directly). We adjust it for the
  // swap ONLY when both swap legs carry a known isCovLite — otherwise
  // the post-swap share is ambiguous and we inherit the base value with
  // an explicit coverage warning. This avoids both the silent-inflation
  // failure mode (mapping null → false would deflate the share when
  // per-loan coverage is incomplete) and the silent-deflation failure
  // mode (an unconditional recompute from per-loan flags overwrites the
  // resolver's deal-level signal with a possibly-incomplete pool view).
  let switchedPctCovLite: number | null = resolved.poolSummary.pctCovLite;
  if (
    resolved.poolSummary.pctCovLite != null &&
    sellLoan.isCovLite != null &&
    buyLoan.isCovLite != null
  ) {
    const baseCovLitePar =
      (resolved.poolSummary.pctCovLite / 100) * resolved.poolSummary.totalPar;
    const removedCovLitePar = sellLoan.isCovLite ? actualSellPar : 0;
    const addedCovLitePar = buyLoan.isCovLite ? buyLoan.parBalance : 0;
    const newCovLitePar = baseCovLitePar - removedCovLitePar + addedCovLitePar;
    switchedPctCovLite = switchedTotalPar > 0
      ? (newCovLitePar / switchedTotalPar) * 100
      : 0;
  } else if (warnings != null) {
    warnings.push({
      field: "switchedPctCovLite",
      message:
        `applySwitch: cannot delta-recompute pctCovLite — at least one swap leg has unknown isCovLite ` +
        `(sell="${sellLoan.obligorName ?? "?"}".isCovLite=${sellLoan.isCovLite}, ` +
        `buy="${buyLoan.obligorName ?? "?"}".isCovLite=${buyLoan.isCovLite}). ` +
        `Inheriting the base-pool pctCovLite (${resolved.poolSummary.pctCovLite}%); the partner-visible ` +
        `share does not reflect the swap.`,
      severity: "warn",
      blocking: false,
    });
  }

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
      pctCovLite: switchedPctCovLite,
      numberOfObligors: switchedObligors,
      top10ObligorsPct: switchedTop10,
      // Other composition fields (pctFixedRate, pctPik, pctBonds, pctSeniorSecured,
      // pctSecondLien, pctCurrentPay, diversityScore, waRecoveryRate,
      // totalMarketValue, numberOfAssets) are inherited from the base pool via
      // the spread above. pctPik specifically requires `isPik` propagation on
      // ResolvedLoan which lands separately; the rest require additional per-loan
      // flags whose extraction-side coverage isn't yet reliable enough for a
      // delta-recompute (see CLAUDE.md anti-pattern #3 — "silent fallbacks on
      // extraction failures are bugs, not defaults").
    },
  };

  const switchedInputs = buildFromResolved(switchedResolved, assumptions, warnings);

  return {
    baseInputs,
    switchedInputs,
    switchedResolved,
    parDelta,
    spreadDelta: buyLoan.spreadBps - sellLoan.spreadBps,
    ratingChange: { from: sellLoan.ratingBucket, to: buyLoan.ratingBucket },
  };
}
