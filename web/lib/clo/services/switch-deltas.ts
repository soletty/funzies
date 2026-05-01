// Pure service-layer helper computing switch-vs-base projection deltas.
//
// Why this lives here, not in the UI: per CLAUDE.md principle 4 (display
// equals engine output, always) and the architecture-boundary AST guard,
// UI components must consume engine output directly — they may not perform
// arithmetic on engine values to derive new ones. The switch-simulator UI
// (`SwitchSimulator.tsx`, `SwitchWaterfallImpact.tsx`) previously computed
// `switched.totalEquityDistributions − base.totalEquityDistributions`,
// per-OC-test cushion deltas, and per-period equity distribution deltas
// inline in renderers. This service replaces those inline computations
// with a single pure call that returns every delta the UI needs.

import type { ProjectionResult } from "../projection";

export interface SwitchOcCushionDelta {
  className: string;
  baseActual: number;
  switchedActual: number | null;
  delta: number;
}

export interface SwitchPeriodEquityDelta {
  period: number;
  baseAmount: number;
  switchedAmount: number;
  delta: number;
}

export interface SwitchDeltas {
  /** switched.totalEquityDistributions − base.totalEquityDistributions. */
  totalEquityDistributionsDelta: number;
  /** switched.equityIrr − base.equityIrr; null if either side has no IRR. */
  equityIrrDelta: number | null;
  /** Per-class OC test cushion delta for the first projected period.
   *  null `switchedActual` means the switched run dropped that test (rare). */
  ocCushionDeltasPeriod1: SwitchOcCushionDelta[];
  /** Per-period equity distribution deltas, aligned by period index. */
  equityDistributionDeltasByPeriod: SwitchPeriodEquityDelta[];
}

export function computeSwitchDeltas(
  baseResult: ProjectionResult,
  switchedResult: ProjectionResult,
): SwitchDeltas {
  const totalEquityDistributionsDelta =
    switchedResult.totalEquityDistributions - baseResult.totalEquityDistributions;

  const equityIrrDelta =
    baseResult.equityIrr != null && switchedResult.equityIrr != null
      ? switchedResult.equityIrr - baseResult.equityIrr
      : null;

  const baseOc = baseResult.periods[0]?.ocTests ?? [];
  const switchedOc = switchedResult.periods[0]?.ocTests ?? [];
  const switchedByClass = new Map(switchedOc.map((t) => [t.className, t]));
  const ocCushionDeltasPeriod1: SwitchOcCushionDelta[] = baseOc.map((b) => {
    const s = switchedByClass.get(b.className);
    return {
      className: b.className,
      baseActual: b.actual,
      switchedActual: s?.actual ?? null,
      delta: s ? s.actual - b.actual : 0,
    };
  });

  const periodCount = Math.min(baseResult.periods.length, switchedResult.periods.length);
  const equityDistributionDeltasByPeriod: SwitchPeriodEquityDelta[] = [];
  for (let i = 0; i < periodCount; i++) {
    const b = baseResult.periods[i];
    const s = switchedResult.periods[i];
    equityDistributionDeltasByPeriod.push({
      period: i + 1,
      baseAmount: b.equityDistribution,
      switchedAmount: s.equityDistribution,
      delta: s.equityDistribution - b.equityDistribution,
    });
  }

  return {
    totalEquityDistributionsDelta,
    equityIrrDelta,
    ocCushionDeltasPeriod1,
    equityDistributionDeltasByPeriod,
  };
}
