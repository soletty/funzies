# CLO Monte Carlo Simulation — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Goal:** Add Monte Carlo simulation to the CLO waterfall projection, producing an IRR distribution and OC failure probability timeline from 10,000 stochastic runs.

---

## Architecture

The existing deterministic engine (`projection.ts`) is unchanged except for one new optional parameter. Monte Carlo is a thin wrapper that calls it N times with a stochastic default draw function. A Web Worker runs the computation off the main thread. Two new recharts visualizations display the results.

```
projection.ts (unchanged except defaultDrawFn param)
       ↑
monte-carlo.ts (pure logic: loop + aggregate)
       ↑
monte-carlo.worker.ts (Web Worker: runs off main thread, posts progress)
       ↑
useMonteCarlo hook (debounce 500ms, manages worker lifecycle)
       ↑
ProjectionModel.tsx (renders histogram + OC timeline)
```

**Key principle:** Any change to the waterfall model automatically applies to both deterministic and Monte Carlo paths because Monte Carlo calls the same `runProjection` function.

---

## 1. Engine Change

**File:** `web/lib/clo/projection.ts`

Add optional `defaultDrawFn` parameter:

```typescript
type DefaultDrawFn = (survivingPar: number, hazardRate: number) => number;

export function runProjection(
  inputs: ProjectionInputs,
  defaultDrawFn?: DefaultDrawFn
): ProjectionResult
```

In the per-loan default loop, replace:
```typescript
const loanDefaults = loan.survivingPar * hazard;
```
with:
```typescript
const draw = defaultDrawFn ?? ((par, hz) => par * hz);
const loanDefaults = draw(loan.survivingPar, hazard);
```

No other changes to projection.ts. Existing deterministic callers pass nothing and get identical behavior.

---

## 2. Monte Carlo Core

**File:** `web/lib/clo/monte-carlo.ts`

```typescript
export interface MonteCarloResult {
  runCount: number;
  irrs: Float64Array;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  meanIrr: number;
  ocFailureByQuarter: { quarter: number; failurePct: number }[];
  medianEquityDistributions: number;
}

export function runMonteCarlo(
  inputs: ProjectionInputs,
  runCount: number,
  onProgress?: (completed: number) => void
): MonteCarloResult
```

Implementation details:
- Bernoulli draw function: `Math.random() < hazardRate ? survivingPar : 0` (loan either defaults entirely or survives)
- Store IRRs in `Float64Array(runCount)` — cache-friendly, sortable, no GC pressure
- Per run, only collect: IRR (number) and OC failure flags per quarter (boolean array)
- Discard full `PeriodResult` arrays immediately — do not store N complete projections
- OC failure tracking: per quarter, count runs where any OC test failed, divide by runCount for percentage
- Sort IRRs array and read percentiles by index: P5 = irrs[floor(N * 0.05)], etc.
- Call `onProgress` every 500 runs for UI progress updates

---

## 3. Web Worker

**File:** `web/lib/clo/monte-carlo.worker.ts`

Browser Web Worker that imports `runMonteCarlo` from `monte-carlo.ts`.

Message protocol:
- **Inbound:** `{ type: "run", inputs: ProjectionInputs, runCount: number }`
- **Outbound progress:** `{ type: "progress", completed: number, total: number }`
- **Outbound result:** `{ type: "result", data: MonteCarloResult }`

The worker receives fully serializable `ProjectionInputs` (no functions — the Bernoulli draw is defined inside `monte-carlo.ts`, not passed across the worker boundary).

Progress posts every 500 runs so the UI can show a progress indicator.

**Hook:** `useMonteCarlo(inputs: ProjectionInputs | null, runCount: number)`

Returns: `{ result: MonteCarloResult | null, running: boolean, progress: number }`

Behavior:
- Creates Web Worker on mount, terminates on unmount
- Debounces: when `inputs` change, waits 500ms after last change, then posts to worker
- If inputs change while a run is in progress, terminates the current run (via worker.terminate + recreate) and starts fresh
- `progress` is 0-1 (completed / total), updates as worker posts progress messages
- `result` holds the latest completed result, stays visible while a new run is in progress (so the UI doesn't flash empty)

---

## 4. Visualization

Two new components using recharts (already in package.json, v3.8.0).

### IRR Distribution Histogram

**File:** `web/app/clo/waterfall/MonteCarloChart.tsx`

- Recharts `BarChart` with ~40 bins from -50% to +30% IRR (2% bucket width)
- Y-axis: frequency (% of runs in each bucket)
- Vertical `ReferenceLine` at P5, P50, P95 with labels
- Bars colored: red-tinted below 0%, green-tinted above 0%
- Summary text above chart: "P5: -12% | Median: 11% | P95: 18%"
- While running: subtle progress bar overlay
- Before first run: empty state with muted text

### OC Failure Probability Timeline

**File:** Same component or sub-component

- Recharts `AreaChart` spanning the projection quarters
- Y-axis: 0-100% (probability of any OC test failure)
- Single filled area, amber at low probabilities, red at high
- X-axis labels match the cash flow timeline quarters
- Tooltip: "Q8: 15% of simulations had an OC test failure"

### Layout

New collapsible section "Monte Carlo (10,000 runs)" in the transparency/detail area of ProjectionModel.tsx, placed after the IRR sensitivity table. Contains:
1. Progress indicator (when running)
2. IRR histogram
3. OC failure timeline

The existing deterministic output (IRR card, payoff timeline, cash flows) stays exactly where it is.

---

## 5. Files

| File | Action | Responsibility |
|---|---|---|
| `web/lib/clo/projection.ts` | Modify (1 line) | Add optional `defaultDrawFn` parameter |
| `web/lib/clo/monte-carlo.ts` | Create | Pure Monte Carlo logic: loop + aggregate |
| `web/lib/clo/monte-carlo.worker.ts` | Create | Web Worker wrapper |
| `web/app/clo/waterfall/MonteCarloChart.tsx` | Create | Histogram + OC timeline visualizations |
| `web/app/clo/waterfall/ProjectionModel.tsx` | Modify | Add `useMonteCarlo` hook, render Monte Carlo section |

---

## 6. Performance Budget

| Metric | Target |
|---|---|
| Single deterministic run | < 5ms |
| 10,000 Monte Carlo runs (Web Worker) | < 5s |
| Memory (peak during MC run) | < 50MB |
| Debounce delay | 500ms |
| Progress update frequency | Every 500 runs |
| UI responsiveness during MC | No main thread blocking |

---

## 7. What This Does NOT Include

- Correlated defaults (Gaussian copula) — future enhancement
- Stochastic recovery rates — future enhancement
- Stochastic prepayment rates — future enhancement
- Server-side Monte Carlo — all client-side
- Saving/sharing MC results — ephemeral, recomputed on parameter change
