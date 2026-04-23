/**
 * Shared pure helpers for portfolio-level quality + concentration metrics.
 *
 * Used by:
 *   - `projection.ts` — per-period forward-projected metrics on `PeriodResult.qualityMetrics`.
 *   - `switch-simulator.ts` — pre/post switch pool metrics so the UI can show
 *     compliance impact of a proposed trade.
 *
 * Extracting shared math here avoids the parallel-implementation trap tracked
 * as KI-21: per-period and per-switch metrics must match the engine's
 * definitions exactly. A future refactor can add new metrics here once and
 * have both consumers pick them up.
 *
 * Methodology gaps documented in the ledger:
 *   - KI-17: `wacSpreadBps` engine-vs-trustee ~30 bps drift (fixed-rate
 *     adjustment not applied; defaulted-position exclusion not implemented).
 *   - KI-18: `pctCccAndBelow` coarse-bucket collapse (~±3 pp vs trustee
 *     per-agency max methodology).
 *   - KI-19: NR positions proxied to Caa2 (WARF=6500) per Moody's convention.
 */

/** Portfolio-level quality metrics. Same shape used for forward-projected
 *  periods (`PeriodQualityMetrics`) and for pre/post-switch pool summaries. */
export interface PoolQualityMetrics {
  /** Weighted Average Rating Factor (Moody's, 1=Aaa, 10000=Ca/C). */
  warf: number;
  /** Weighted Average Life of the remaining pool in years. Bullet-maturity
   *  approximation (see projection.ts docstring). */
  walYears: number;
  /** Weighted Average Coupon spread in bps. Subject to KI-17 methodology gap. */
  wacSpreadBps: number;
  /** % of par rated CCC or below (engine coarse bucket). Subject to KI-18. */
  pctCccAndBelow: number;
}

/** Minimum per-loan shape required for quality-metric computation. Both
 *  `projection.ts` (`LoanState`) and `switch-simulator.ts` (`ResolvedLoan`)
 *  map their internal shapes to this for the helper call. */
export interface QualityMetricLoan {
  parBalance: number;
  warfFactor: number;
  yearsToMaturity: number;
  spreadBps: number;
  ratingBucket: string;
}

/** Compute portfolio quality metrics from a flat list of loans. Pure function
 *  — no side effects, no access to closures. Caller is responsible for
 *  filtering out unfunded DDTLs, defaulted positions pending recovery, etc. */
export function computePoolQualityMetrics(loans: QualityMetricLoan[]): PoolQualityMetrics {
  let totalPar = 0;
  let warfSum = 0;
  let walSum = 0;
  let spreadSum = 0;
  let cccAndBelowPar = 0;
  for (const l of loans) {
    const par = l.parBalance;
    if (par <= 0) continue;
    totalPar += par;
    warfSum += par * l.warfFactor;
    walSum += par * l.yearsToMaturity;
    spreadSum += par * l.spreadBps;
    if (l.ratingBucket === "CCC") cccAndBelowPar += par;
  }
  if (totalPar === 0) {
    return { warf: 0, walYears: 0, wacSpreadBps: 0, pctCccAndBelow: 0 };
  }
  return {
    warf: warfSum / totalPar,
    walYears: walSum / totalPar,
    wacSpreadBps: spreadSum / totalPar,
    pctCccAndBelow: (cccAndBelowPar / totalPar) * 100,
  };
}

/** Concentration-test metric: par share held by the top N obligors.
 *  Groups `parBalance` by `obligorName` (case-sensitive, no normalization),
 *  sorts descending, sums the top N, divides by total par. Returns 0 when
 *  there are fewer than N distinct obligors or total par is zero.
 *
 *  N defaults to 10 (the PPM-standard "top 10 obligors" concentration limit). */
export function computeTopNObligorsPct(
  loans: Array<{ parBalance: number; obligorName?: string | null }>,
  n: number = 10,
): number {
  const parByObligor = new Map<string, number>();
  let totalPar = 0;
  for (const l of loans) {
    const par = l.parBalance;
    if (par <= 0) continue;
    totalPar += par;
    const name = l.obligorName ?? "";
    if (!name) continue; // unnamed positions can't be grouped; contribute to total but not to any bucket
    parByObligor.set(name, (parByObligor.get(name) ?? 0) + par);
  }
  if (totalPar === 0) return 0;
  const sorted = Array.from(parByObligor.values()).sort((a, b) => b - a);
  const topSum = sorted.slice(0, n).reduce((s, v) => s + v, 0);
  return (topSum / totalPar) * 100;
}

/** Coarse RatingBucket → Moody's WARF factor fallback. Used when per-position
 *  `warfFactor` is absent (NR loans with no resolver-populated factor,
 *  reinvested synthetic loans). NR→Caa2 (6500) per Moody's CLO methodology
 *  convention; see KI-19. */
export const BUCKET_WARF_FALLBACK: Record<string, number> = {
  AAA: 1,
  AA: 20,
  A: 120,
  BBB: 360,
  BB: 1350,
  B: 2720,
  CCC: 6500,
  NR: 6500,
};
