/**
 * D6c — Reinvestment calibration from manager's actual BUY trades.
 *
 * Calibrates reinvestment assumption defaults (spread, tenor, rating) by
 * looking at the manager's recent BUY trades and using them as a pre-fill
 * signal in the projection UI.
 *
 * The actual `CloTrade` schema carries obligor + facility names, trade date,
 * and settlement economics — but NOT spread, maturity, or rating. Those are
 * stored on `CloHolding`. This module joins BUY trades to holdings via the
 * `(obligorName, facilityName)` key to enrich each trade, then aggregates.
 *
 * Why the 3-trade floor: with ≤2 BUYs, a single trade dominates the weighted
 * average and the "calibrated" claim overstates what the data supports.
 * Below the floor we return null — partner sees generic defaults, no false
 * precision.
 */

import type { CloTrade, CloHolding } from "@/lib/clo/types";
import { mapToRatingBucket, type RatingBucket } from "@/lib/clo/rating-mapping";
import { BUCKET_WARF_FALLBACK } from "@/lib/clo/pool-metrics";

/** Minimum BUY count required to produce a calibration. Below this, noise
 *  dominates the weighted averages and we'd be over-claiming on sparse data. */
export const MIN_TRADES = 3;

const DAYS_PER_YEAR = 365.25;

export interface ReinvestmentCalibration {
  reinvestmentSpreadBps: number;
  reinvestmentTenorYears: number;
  reinvestmentRating: string;
  tradeCount: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
}

/** BUY-trade detection.
 *
 *  Rules (evaluated in order, all case-insensitive):
 *    - If `tradeType === "PURCHASE"` → buy.
 *    - Else if `description` contains "purchase" but NOT "accrued" → buy.
 *      (Trustee reports label "Security - Purchase (D)" as the BUY event and
 *      "Security - Purchased Accrued Interest (D)" as a separate AI line
 *      item — the latter must NOT count as a BUY trade.)
 *
 *  Observed on Euro XV: `tradeType` is null for every row; BUY detection
 *  relies on the description path. */
function isBuyTrade(t: CloTrade): boolean {
  if (t.tradeType === "PURCHASE") return true;
  const d = (t.description ?? "").toLowerCase();
  return d.includes("purchase") && !d.includes("accrued");
}

/** Par-amount proxy for a trade. CloTrade.parAmount is typically null in
 *  trustee data; back into a par proxy via settlementAmount / settlementPrice
 *  when both are present. Falls back to |settlementAmount|, then to 1 (unit
 *  weight) so a trade without economics still contributes to the modal
 *  rating / min-max date calculations. */
function tradeParWeight(t: CloTrade): number {
  if (t.parAmount != null && t.parAmount > 0) return t.parAmount;
  const settlement = t.settlementAmount;
  const price = t.settlementPrice;
  if (settlement != null && price != null && price > 0) {
    return Math.abs(settlement) / price;
  }
  if (settlement != null) return Math.abs(settlement);
  return 1;
}

function yearsBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return (toMs - fromMs) / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000);
}

interface EnrichedBuy {
  par: number;
  spreadBps: number | null;
  tenorYears: number | null;
  ratingBucket: RatingBucket;
  tradeDate: string;
}

/** Join a BUY trade to the holding that represents the same facility. Matches
 *  on `(obligorName, facilityName)` — the composite key used elsewhere in the
 *  codebase. Returns null if no match (e.g., loan already repaid and no
 *  longer in holdings). */
function enrichBuy(trade: CloTrade, holdings: CloHolding[]): EnrichedBuy | null {
  if (!trade.tradeDate || !trade.obligorName) return null;
  const match = holdings.find(
    (h) =>
      h.obligorName === trade.obligorName &&
      h.facilityName === trade.facilityName,
  );
  if (!match) return null;

  const par = tradeParWeight(trade);
  const tenorYears =
    match.maturityDate != null
      ? yearsBetween(trade.tradeDate, match.maturityDate)
      : null;
  const ratingBucket = mapToRatingBucket(
    match.moodysRating,
    match.spRating,
    match.fitchRating,
    match.compositeRating,
  );
  return {
    par,
    spreadBps: match.spreadBps,
    tenorYears,
    ratingBucket,
    tradeDate: trade.tradeDate,
  };
}

/** Modal rating bucket across enriched BUYs.
 *
 *  Tiebreak: pick the higher-WARF (lower-rating, more conservative) bucket.
 *  Rationale: partner using calibrated reinvestment for stress analysis is
 *  better served by the conservative choice. A 50/50 A-vs-B pool should
 *  default to B (higher hazard) rather than A (lower hazard) for forward
 *  projection. Alphabetical tiebreak was deterministic but not
 *  methodology-defensible — "A" beats "B" alphabetically but represents the
 *  safer rating, which is backwards for conservatism. See the D6c review
 *  note in the Sprint 4 ledger.
 *
 *  NR is excluded from the tiebreak pool unless it's the ONLY candidate —
 *  NR semantically means "unknown rating," not "highest risk," so a partner
 *  seeing calibrated rating = NR is confusing even if the Moody's Caa2
 *  convention (KI-19) maps it to WARF 6500. Non-NR ratings win ties over NR
 *  at equal count. */
function modalRating(enriched: EnrichedBuy[]): RatingBucket {
  const counts = new Map<RatingBucket, number>();
  for (const e of enriched) {
    counts.set(e.ratingBucket, (counts.get(e.ratingBucket) ?? 0) + 1);
  }
  if (counts.size === 0) return "NR";
  const entries = [...counts.entries()];
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // higher count first
    // Tiebreak — push NR to the back.
    if (a[0] === "NR" && b[0] !== "NR") return 1;
    if (b[0] === "NR" && a[0] !== "NR") return -1;
    // Both non-NR (or both NR): pick higher WARF (riskier, conservative).
    const wa = BUCKET_WARF_FALLBACK[a[0]] ?? 0;
    const wb = BUCKET_WARF_FALLBACK[b[0]] ?? 0;
    return wb - wa;
  });
  return entries[0][0];
}

/** Par-weighted average of a nullable numeric field across enriched BUYs.
 *  Falls back to simple mean if every trade has zero par weight.
 *  Returns null if no trade has the field set. */
function weightedAverage(
  enriched: EnrichedBuy[],
  pick: (e: EnrichedBuy) => number | null,
): number | null {
  const present = enriched
    .map((e) => ({ par: e.par, value: pick(e) }))
    .filter((x): x is { par: number; value: number } => x.value != null);
  if (present.length === 0) return null;
  const totalWeight = present.reduce((s, p) => s + p.par, 0);
  if (totalWeight > 0) {
    return present.reduce((s, p) => s + p.par * p.value, 0) / totalWeight;
  }
  return present.reduce((s, p) => s + p.value, 0) / present.length;
}

/**
 * Calibrate reinvestment defaults from the manager's actual BUY trades.
 *
 * Joins each BUY to its holding (by obligor + facility) to pull spread,
 * maturity, and rating, then aggregates:
 *   - spread: par-weighted average, rounded to the nearest integer bp
 *   - tenor:  par-weighted average years from trade date to maturity,
 *             rounded to 1 decimal (365.25 days/year)
 *   - rating: modal coarse bucket (alphabetical tiebreak)
 *
 * Returns null when:
 *   - fewer than MIN_TRADES BUY trades are found (sparse data → no claim);
 *   - every BUY is missing a spread (spread is the primary pre-fill signal).
 */
export function calibrateReinvestmentFromTrades(
  trades: CloTrade[] | null | undefined,
  holdings: CloHolding[] | null | undefined,
  _asOfDate: string,
): ReinvestmentCalibration | null {
  if (!trades || trades.length === 0) return null;
  const holdingsArr = holdings ?? [];

  const buys = trades.filter(isBuyTrade);
  if (buys.length < MIN_TRADES) return null;

  const enriched = buys
    .map((t) => enrichBuy(t, holdingsArr))
    .filter((e): e is EnrichedBuy => e != null);
  if (enriched.length < MIN_TRADES) return null;

  const spread = weightedAverage(enriched, (e) => e.spreadBps);
  if (spread == null) return null;
  const tenor = weightedAverage(enriched, (e) => e.tenorYears);
  if (tenor == null) return null;

  const tradeDates = enriched
    .map((e) => e.tradeDate)
    .filter((d): d is string => !!d)
    .sort();

  return {
    reinvestmentSpreadBps: Math.round(spread),
    reinvestmentTenorYears: Math.round(tenor * 10) / 10,
    reinvestmentRating: modalRating(enriched),
    tradeCount: enriched.length,
    minTradeDate: tradeDates[0] ?? null,
    maxTradeDate: tradeDates[tradeDates.length - 1] ?? null,
  };
}
