# Waterfall Transparency Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Transparency" section to the waterfall page with sensitivity analysis, input data provenance, and expandable per-period waterfall traces.

**Architecture:** Three panels inside a single collapsible wrapper, all client-side. One new pure function (`computeSensitivity`) in the projection engine. All UI changes in `ProjectionModel.tsx` using inline helper components (existing pattern). No new API endpoints or engine output changes.

**Tech Stack:** React (client components), TypeScript, inline styles (existing pattern — no CSS modules in this file).

**Spec:** `docs/superpowers/specs/2026-04-09-waterfall-transparency-design.md`

---

### Task 1: Add `computeSensitivity` pure function

**Files:**
- Modify: `web/lib/clo/projection.ts` (append after `calculateIrr`)
- Modify: `web/lib/clo/__tests__/projection.test.ts` (append new describe block)

- [ ] **Step 1: Write the test**

Add to `web/lib/clo/__tests__/projection.test.ts`:

```typescript
describe("computeSensitivity", () => {
  it("returns 5 rows sorted by absolute IRR impact", () => {
    const inputs = makeInputs();
    const baseResult = runProjection(inputs);
    const baseIrr = baseResult.equityIrr!;
    const rows = computeSensitivity(inputs, baseIrr);

    expect(rows.length).toBe(5);
    // Sorted by absolute impact descending
    const impacts = rows.map((r) =>
      Math.max(
        Math.abs((r.downIrr ?? baseIrr) - baseIrr),
        Math.abs((r.upIrr ?? baseIrr) - baseIrr)
      )
    );
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i]).toBeLessThanOrEqual(impacts[i - 1]);
    }
  });

  it("perturbs only one input per scenario", () => {
    const inputs = makeInputs({ cprPct: 15, recoveryPct: 60 });
    const baseResult = runProjection(inputs);
    const rows = computeSensitivity(inputs, baseResult.equityIrr!);

    const cprRow = rows.find((r) => r.assumption === "CPR");
    expect(cprRow).toBeDefined();
    expect(cprRow!.base).toBe("15.0%");
    expect(cprRow!.down).toBe("10.0%");
    expect(cprRow!.up).toBe("20.0%");
  });

  it("handles null base IRR gracefully", () => {
    const inputs = makeInputs();
    const rows = computeSensitivity(inputs, null);
    expect(rows.length).toBe(5);
    // All deltas should be null
    for (const row of rows) {
      expect(row.downIrr).toBeNull();
      expect(row.upIrr).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/clo/__tests__/projection.test.ts`
Expected: FAIL — `computeSensitivity` is not exported

- [ ] **Step 3: Implement `computeSensitivity`**

Add to the bottom of `web/lib/clo/projection.ts`, before the closing of the file (after `calculateIrr`):

```typescript
export interface SensitivityRow {
  assumption: string;
  base: string;
  down: string;
  up: string;
  downIrr: number | null;
  upIrr: number | null;
}

export function computeSensitivity(
  baseInputs: ProjectionInputs,
  baseIrr: number | null,
): SensitivityRow[] {
  const scenarios: { assumption: string; base: string; down: string; up: string; makeDown: () => ProjectionInputs; makeUp: () => ProjectionInputs }[] = [
    {
      assumption: "CDR (uniform)",
      base: formatSensPct(avgCdr(baseInputs.defaultRatesByRating)),
      down: formatSensPct(Math.max(0, avgCdr(baseInputs.defaultRatesByRating) - 1)),
      up: formatSensPct(avgCdr(baseInputs.defaultRatesByRating) + 1),
      makeDown: () => ({ ...baseInputs, defaultRatesByRating: shiftAllRates(baseInputs.defaultRatesByRating, -1) }),
      makeUp: () => ({ ...baseInputs, defaultRatesByRating: shiftAllRates(baseInputs.defaultRatesByRating, 1) }),
    },
    {
      assumption: "CPR",
      base: formatSensPct(baseInputs.cprPct),
      down: formatSensPct(Math.max(0, baseInputs.cprPct - 5)),
      up: formatSensPct(baseInputs.cprPct + 5),
      makeDown: () => ({ ...baseInputs, cprPct: Math.max(0, baseInputs.cprPct - 5) }),
      makeUp: () => ({ ...baseInputs, cprPct: baseInputs.cprPct + 5 }),
    },
    {
      assumption: "Base Rate",
      base: formatSensPct(baseInputs.baseRatePct),
      down: formatSensPct(Math.max(0, baseInputs.baseRatePct - 1)),
      up: formatSensPct(baseInputs.baseRatePct + 1),
      makeDown: () => ({ ...baseInputs, baseRatePct: Math.max(0, baseInputs.baseRatePct - 1) }),
      makeUp: () => ({ ...baseInputs, baseRatePct: baseInputs.baseRatePct + 1 }),
    },
    {
      assumption: "Recovery Rate",
      base: formatSensPct(baseInputs.recoveryPct),
      down: formatSensPct(Math.max(0, baseInputs.recoveryPct - 10)),
      up: formatSensPct(Math.min(100, baseInputs.recoveryPct + 10)),
      makeDown: () => ({ ...baseInputs, recoveryPct: Math.max(0, baseInputs.recoveryPct - 10) }),
      makeUp: () => ({ ...baseInputs, recoveryPct: Math.min(100, baseInputs.recoveryPct + 10) }),
    },
    {
      assumption: "Reinvestment Spread",
      base: `${baseInputs.reinvestmentSpreadBps} bps`,
      down: `${Math.max(0, baseInputs.reinvestmentSpreadBps - 50)} bps`,
      up: `${baseInputs.reinvestmentSpreadBps + 50} bps`,
      makeDown: () => ({ ...baseInputs, reinvestmentSpreadBps: Math.max(0, baseInputs.reinvestmentSpreadBps - 50) }),
      makeUp: () => ({ ...baseInputs, reinvestmentSpreadBps: baseInputs.reinvestmentSpreadBps + 50 }),
    },
  ];

  const rows: SensitivityRow[] = scenarios.map((s) => {
    if (baseIrr === null) {
      return { assumption: s.assumption, base: s.base, down: s.down, up: s.up, downIrr: null, upIrr: null };
    }
    const downResult = runProjection(s.makeDown());
    const upResult = runProjection(s.makeUp());
    return {
      assumption: s.assumption,
      base: s.base,
      down: s.down,
      up: s.up,
      downIrr: downResult.equityIrr,
      upIrr: upResult.equityIrr,
    };
  });

  rows.sort((a, b) => {
    const impactA = Math.max(Math.abs((a.downIrr ?? 0) - (baseIrr ?? 0)), Math.abs((a.upIrr ?? 0) - (baseIrr ?? 0)));
    const impactB = Math.max(Math.abs((b.downIrr ?? 0) - (baseIrr ?? 0)), Math.abs((b.upIrr ?? 0) - (baseIrr ?? 0)));
    return impactB - impactA;
  });

  return rows;
}

function formatSensPct(val: number): string {
  return `${val.toFixed(1)}%`;
}

function avgCdr(rates: Record<string, number>): number {
  const vals = Object.values(rates);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function shiftAllRates(rates: Record<string, number>, delta: number): Record<string, number> {
  const shifted: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) {
    shifted[k] = Math.max(0, v + delta);
  }
  return shifted;
}
```

Also add the import in the test file at the top:

```typescript
import {
  validateInputs,
  runProjection,
  calculateIrr,
  addQuarters,
  computeSensitivity,
  ProjectionInputs,
  LoanInput,
} from "../projection";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/clo/__tests__/projection.test.ts`
Expected: ALL PASS (32 existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add web/lib/clo/projection.ts web/lib/clo/__tests__/projection.test.ts
git commit -m "feat: add computeSensitivity for IRR impact analysis"
```

---

### Task 2: Add Transparency wrapper and Sensitivity table to ProjectionModel

**Files:**
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx`

- [ ] **Step 1: Add the sensitivity import and useMemo**

In the imports at top of `ProjectionModel.tsx`, add `computeSensitivity` and `SensitivityRow`:

```typescript
import {
  runProjection,
  validateInputs,
  computeSensitivity,
  type ProjectionInputs,
  type ProjectionResult,
  type PeriodResult,
  type SensitivityRow,
  type LoanInput,
} from "@/lib/clo/projection";
```

Then inside the `ProjectionModel` component, after the existing `result` useMemo (around line 289-292), add:

```typescript
  const sensitivity: SensitivityRow[] = useMemo(
    () => {
      if (!result || result.equityIrr === null) return [];
      return computeSensitivity(inputs, result.equityIrr);
    },
    [inputs, result]
  );
```

- [ ] **Step 2: Add `showTransparency` state**

Add near the other `useState` declarations (around line 195):

```typescript
  const [showTransparency, setShowTransparency] = useState(false);
```

- [ ] **Step 3: Add the SensitivityTable helper component**

Add after the `SummaryCard` component (after line ~1122), before the file's closing:

```typescript
function SensitivityTable({
  rows,
  baseIrr,
}: {
  rows: SensitivityRow[];
  baseIrr: number | null;
}) {
  if (rows.length === 0 || baseIrr === null) return null;

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
        IRR Sensitivity
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.75rem",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "right" }}>
            <th style={{ padding: "0.4rem 0.6rem", textAlign: "left", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>Assumption</th>
            <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>Base</th>
            <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>Down</th>
            <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>Up</th>
            <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>IRR Impact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const downDelta = row.downIrr !== null ? (row.downIrr - baseIrr) * 100 : null;
            const upDelta = row.upIrr !== null ? (row.upIrr - baseIrr) * 100 : null;
            return (
              <tr key={row.assumption} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                <td style={{ padding: "0.45rem 0.6rem", fontWeight: 500 }}>{row.assumption}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.base}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.down}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{row.up}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                  {downDelta !== null && upDelta !== null ? (
                    <>
                      <span style={{ color: downDelta >= 0 ? "var(--color-high)" : "var(--color-low)" }}>
                        {downDelta >= 0 ? "+" : ""}{downDelta.toFixed(2)}%
                      </span>
                      {" / "}
                      <span style={{ color: upDelta >= 0 ? "var(--color-high)" : "var(--color-low)" }}>
                        {upDelta >= 0 ? "+" : ""}{upDelta.toFixed(2)}%
                      </span>
                    </>
                  ) : "N/A"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Wire the Transparency wrapper into the results section**

In the results JSX, find the section after the summary cards grid (after line ~555, the closing `</div>` of the 3-column grid). Replace the existing cash flow table section (lines ~705-785) by moving it into the Transparency wrapper. The new structure goes between the summary cards grid and `<ModelAssumptions />`:

```typescript
          {/* Transparency section */}
          <div
            style={{
              marginBottom: "1.5rem",
              border: "1px solid var(--color-border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
            }}
          >
            <button
              onClick={() => setShowTransparency(!showTransparency)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.6rem 0.8rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                textAlign: "left",
                fontFamily: "var(--font-body)",
              }}
            >
              <span style={{ fontSize: "0.65rem" }}>{showTransparency ? "▾" : "▸"}</span>
              Transparency
            </button>

            {showTransparency && (
              <div style={{ padding: "0 0.8rem 0.8rem" }}>
                <SensitivityTable rows={sensitivity} baseIrr={result.equityIrr} />
                {/* Model Inputs and Cash Flow panels added in Tasks 3 & 4 */}
              </div>
            )}
          </div>
```

Remove the old standalone cash flow table toggle button and table (the `<div>` starting around line 706 with the "Show Cash Flow Detail" button through its closing `</div>` around line 785).

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add web/app/clo/waterfall/ProjectionModel.tsx
git commit -m "feat: add Transparency wrapper with sensitivity table"
```

---

### Task 3: Add Model Inputs panel

**Files:**
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx`

- [ ] **Step 1: Add the ModelInputsPanel helper component**

Add after `SensitivityTable` component:

```typescript
function ModelInputsPanel({
  resolved,
  inputs,
}: {
  resolved: ResolvedDealData;
  inputs: ProjectionInputs;
}) {
  const [open, setOpen] = useState(false);

  const sourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      snapshot: "var(--color-high)",
      compliance: "var(--color-high)",
      db_tranche: "var(--color-accent)",
      ppm: "var(--color-warning, #d97706)",
      default: "var(--color-low)",
    };
    return (
      <span
        style={{
          fontSize: "0.6rem",
          fontWeight: 600,
          padding: "0.1rem 0.35rem",
          borderRadius: "3px",
          background: `${colors[source] ?? "var(--color-text-muted)"}18`,
          color: colors[source] ?? "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {source}
      </span>
    );
  };

  const kvStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.3rem 0",
    fontSize: "0.73rem",
    borderBottom: "1px solid var(--color-border-light)",
  };
  const kvLabel: React.CSSProperties = { color: "var(--color-text-muted)" };
  const kvValue: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 500 };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.3rem 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "0.75rem",
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-body)",
        }}
      >
        <span style={{ fontSize: "0.6rem" }}>{open ? "▾" : "▸"}</span>
        Model Inputs
      </button>

      {open && (
        <div style={{ marginTop: "0.5rem" }}>
          {/* Capital Structure */}
          <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
            Capital Structure
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.73rem", fontVariantNumeric: "tabular-nums", marginBottom: "1rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "right" }}>
                <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Class</th>
                <th style={{ padding: "0.35rem 0.5rem", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Balance</th>
                <th style={{ padding: "0.35rem 0.5rem", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Spread</th>
                <th style={{ padding: "0.35rem 0.5rem", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Type</th>
                <th style={{ padding: "0.35rem 0.5rem", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Defer.</th>
                <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {resolved.tranches.map((t) => (
                <tr key={t.className} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                  <td style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>{t.className}</td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(t.currentBalance)}</td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                    {t.isIncomeNote ? "—" : t.isFloating ? `${t.spreadBps} bps` : `Fixed ${(t.spreadBps / 100).toFixed(2)}%`}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontSize: "0.72rem" }}>{t.isFloating ? "Float" : "Fixed"}</td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontSize: "0.72rem" }}>{t.isDeferrable ? "Yes" : "No"}</td>
                  <td style={{ padding: "0.35rem 0.5rem" }}>{sourceBadge(t.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Fees & Dates & Pool */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Fees</div>
              <div style={kvStyle}><span style={kvLabel}>Senior Mgmt</span> <span style={kvValue}>{resolved.fees.seniorFeePct}%</span></div>
              <div style={kvStyle}><span style={kvLabel}>Sub Mgmt</span> <span style={kvValue}>{resolved.fees.subFeePct}%</span></div>
              <div style={kvStyle}><span style={kvLabel}>Trustee/Admin</span> <span style={kvValue}>{resolved.fees.trusteeFeeBps} bps</span></div>
              <div style={kvStyle}><span style={kvLabel}>Incentive</span> <span style={kvValue}>{resolved.fees.incentiveFeePct > 0 ? `${resolved.fees.incentiveFeePct}%` : "None"}</span></div>
              <div style={kvStyle}><span style={kvLabel}>Hedge Cost</span> <span style={kvValue}>{inputs.hedgeCostBps} bps</span></div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Dates</div>
              <div style={kvStyle}><span style={kvLabel}>Maturity</span> <span style={kvValue}>{resolved.dates.maturity}</span></div>
              <div style={kvStyle}><span style={kvLabel}>RP End</span> <span style={kvValue}>{resolved.dates.reinvestmentPeriodEnd ?? "N/A"}</span></div>
              <div style={kvStyle}><span style={kvLabel}>Non-Call</span> <span style={kvValue}>{resolved.dates.nonCallPeriodEnd ?? "N/A"}</span></div>
              <div style={kvStyle}><span style={kvLabel}>Call Date</span> <span style={kvValue}>{inputs.callDate ?? "Not set"}</span></div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Pool</div>
              <div style={kvStyle}><span style={kvLabel}>Initial Par</span> <span style={kvValue}>{formatAmount(resolved.poolSummary.totalPar)}</span></div>
              <div style={kvStyle}><span style={kvLabel}>WAC Spread</span> <span style={kvValue}>{resolved.poolSummary.wacSpreadBps} bps</span></div>
              <div style={kvStyle}><span style={kvLabel}>Loans</span> <span style={kvValue}>{resolved.loans.length}</span></div>
            </div>
          </div>

          {/* Triggers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>OC Triggers</div>
              {resolved.ocTriggers.map((t) => (
                <div key={t.className} style={kvStyle}><span style={kvLabel}>{t.className}</span> <span style={kvValue}>{t.triggerLevel}% {sourceBadge(t.source)}</span></div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>IC Triggers</div>
              {resolved.icTriggers.map((t) => (
                <div key={t.className} style={kvStyle}><span style={kvLabel}>{t.className}</span> <span style={kvValue}>{t.triggerLevel}% {sourceBadge(t.source)}</span></div>
              ))}
              {resolved.reinvestmentOcTrigger && (
                <>
                  <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginTop: "0.5rem", marginBottom: "0.4rem" }}>Reinvestment OC</div>
                  <div style={kvStyle}><span style={kvLabel}>Trigger</span> <span style={kvValue}>{resolved.reinvestmentOcTrigger.triggerLevel}%</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire ModelInputsPanel into the Transparency wrapper**

Inside the Transparency section's `{showTransparency && (...)}` block, after `<SensitivityTable>`, add:

```typescript
                {resolved && <ModelInputsPanel resolved={resolved} inputs={inputs} />}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/app/clo/waterfall/ProjectionModel.tsx
git commit -m "feat: add Model Inputs provenance panel to Transparency"
```

---

### Task 4: Add expandable period waterfall trace to cash flow table

**Files:**
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx`

- [ ] **Step 1: Add `expandedPeriod` state**

Add near the other `useState` declarations:

```typescript
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
```

- [ ] **Step 2: Add the PeriodTrace helper component**

Add after `ModelInputsPanel`:

```typescript
function PeriodTrace({
  period,
  inputs,
}: {
  period: PeriodResult;
  inputs: ProjectionInputs;
}) {
  const beginPar = period.beginningPar;
  const trusteeFee = beginPar * (inputs.trusteeFeeBps / 10000) / 4;
  const seniorFee = beginPar * (inputs.seniorFeePct / 100) / 4;
  const hedgeCost = beginPar * (inputs.hedgeCostBps / 10000) / 4;
  const subFee = beginPar * (inputs.subFeePct / 100) / 4;
  const availableAfterSenior = period.interestCollected - trusteeFee - seniorFee - hedgeCost;

  const trancheInterestTotal = period.trancheInterest.reduce((s, t) => s + t.paid, 0);
  const equityFromInterest = period.equityDistribution - (period.beginningPar > 0
    ? Math.max(0, period.prepayments + period.scheduledMaturities + period.recoveries - period.reinvestment)
    : 0);

  const lineStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.2rem 0",
    fontSize: "0.72rem",
    fontFamily: "var(--font-mono)",
    fontVariantNumeric: "tabular-nums",
  };
  const indent: React.CSSProperties = { paddingLeft: "1.2rem" };
  const labelStyle: React.CSSProperties = { color: "var(--color-text-muted)" };
  const feeColor = "var(--color-low)";
  const eqColor = "var(--color-high)";
  const dividerStyle: React.CSSProperties = { borderTop: "1px solid var(--color-border-light)", margin: "0.3rem 0" };

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        background: "var(--color-surface-alt, var(--color-surface))",
        borderTop: "1px dashed var(--color-border-light)",
        fontSize: "0.72rem",
      }}
    >
      {/* Interest waterfall */}
      <div style={{ fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
        Interest Waterfall
      </div>
      <div style={lineStyle}>
        <span>Interest Collected</span>
        <span>{formatAmount(period.interestCollected)}</span>
      </div>
      <div style={{ ...lineStyle, ...indent }}>
        <span style={{ color: feeColor }}>Trustee/Admin ({inputs.trusteeFeeBps} bps)</span>
        <span style={{ color: feeColor }}>-{formatAmount(trusteeFee)}</span>
      </div>
      <div style={{ ...lineStyle, ...indent }}>
        <span style={{ color: feeColor }}>Senior Mgmt Fee ({inputs.seniorFeePct}%)</span>
        <span style={{ color: feeColor }}>-{formatAmount(seniorFee)}</span>
      </div>
      {hedgeCost > 0 && (
        <div style={{ ...lineStyle, ...indent }}>
          <span style={{ color: feeColor }}>Hedge Costs ({inputs.hedgeCostBps} bps)</span>
          <span style={{ color: feeColor }}>-{formatAmount(hedgeCost)}</span>
        </div>
      )}
      <div style={{ ...lineStyle, ...indent, fontWeight: 500 }}>
        <span>Available for tranches</span>
        <span>{formatAmount(Math.max(0, availableAfterSenior))}</span>
      </div>

      {period.trancheInterest.map((t) => (
        <div key={t.className} style={{ ...lineStyle, ...indent }}>
          <span style={labelStyle}>{t.className} interest{t.paid < t.due ? ` (shortfall: ${formatAmount(t.due - t.paid)})` : ""}</span>
          <span>{t.paid > 0 ? `-${formatAmount(t.paid)}` : "—"}</span>
        </div>
      ))}

      {/* OC/IC test results */}
      {(period.ocTests.length > 0 || period.icTests.length > 0) && (
        <div style={{ ...lineStyle, ...indent, flexWrap: "wrap", gap: "0.4rem" }}>
          {period.ocTests.map((t) => (
            <span key={`oc-${t.className}`} style={{ color: t.passing ? "var(--color-high)" : "var(--color-low)", fontSize: "0.68rem" }}>
              {t.passing ? "\u2713" : "\u2717"} {t.className} OC {t.actual.toFixed(1)}%
            </span>
          ))}
          {period.icTests.map((t) => (
            <span key={`ic-${t.className}`} style={{ color: t.passing ? "var(--color-high)" : "var(--color-low)", fontSize: "0.68rem" }}>
              {t.passing ? "\u2713" : "\u2717"} {t.className} IC {t.actual.toFixed(1)}%
            </span>
          ))}
        </div>
      )}

      <div style={{ ...lineStyle, ...indent }}>
        <span style={{ color: feeColor }}>Sub Mgmt Fee ({inputs.subFeePct}%)</span>
        <span style={{ color: feeColor }}>-{formatAmount(subFee)}</span>
      </div>

      <div style={dividerStyle} />
      <div style={{ ...lineStyle, fontWeight: 600 }}>
        <span style={{ color: eqColor }}>Equity (from interest)</span>
        <span style={{ color: eqColor }}>{formatAmount(Math.max(0, equityFromInterest))}</span>
      </div>

      {/* Principal waterfall */}
      <div style={{ fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginTop: "0.75rem", marginBottom: "0.4rem" }}>
        Principal Waterfall
      </div>
      <div style={lineStyle}>
        <span>Prepayments</span>
        <span>{formatAmount(period.prepayments)}</span>
      </div>
      <div style={lineStyle}>
        <span>Maturities</span>
        <span>{formatAmount(period.scheduledMaturities)}</span>
      </div>
      <div style={lineStyle}>
        <span>Recoveries</span>
        <span>{formatAmount(period.recoveries)}</span>
      </div>
      {period.reinvestment > 0 && (
        <div style={{ ...lineStyle, ...indent }}>
          <span style={{ color: feeColor }}>Reinvested</span>
          <span style={{ color: feeColor }}>-{formatAmount(period.reinvestment)}</span>
        </div>
      )}

      {period.tranchePrincipal.filter((t) => t.paid > 0).map((t) => (
        <div key={t.className} style={{ ...lineStyle, ...indent }}>
          <span style={labelStyle}>{t.className} principal</span>
          <span>-{formatAmount(t.paid)}</span>
        </div>
      ))}

      <div style={dividerStyle} />
      <div style={{ ...lineStyle, fontWeight: 700 }}>
        <span style={{ color: eqColor }}>Total Equity Distribution</span>
        <span style={{ color: eqColor }}>{formatAmount(period.equityDistribution)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Move the cash flow table into Transparency and add expandable rows**

Inside the Transparency section's `{showTransparency && (...)}` block, after the `ModelInputsPanel`, add the cash flow table. This is the same table as before but with click-to-expand rows:

```typescript
                {/* Cash Flow Table */}
                <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.5rem", marginTop: "0.5rem" }}>
                  Cash Flow Detail
                </div>
                <div
                  style={{
                    overflowX: "auto",
                    overflowY: "auto",
                    maxHeight: "600px",
                    border: "1px solid var(--color-border-light)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <table
                    className="wf-table"
                    style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}
                  >
                    {/* Same thead as existing table */}
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "right", background: "var(--color-surface)", position: "sticky", top: 0, zIndex: 1 }}>
                        {["Date", "Beg Par", "Defaults", "Prepays", "Maturities", "Recoveries", "Reinvest", "End Par", "Beg Liab", "End Liab", "Interest", "Equity"].map((h) => (
                          <th key={h} style={{ padding: "0.5rem 0.6rem", textAlign: h === "Date" ? "left" : "right", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.periods.map((p) => (
                        <>
                          <tr
                            key={p.periodNum}
                            onClick={() => setExpandedPeriod(expandedPeriod === p.periodNum ? null : p.periodNum)}
                            style={{ borderBottom: "1px solid var(--color-border-light)", cursor: "pointer", background: expandedPeriod === p.periodNum ? "var(--color-surface-alt, var(--color-surface))" : undefined }}
                          >
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                              <span style={{ fontSize: "0.6rem", marginRight: "0.3rem" }}>{expandedPeriod === p.periodNum ? "▾" : "▸"}</span>
                              {formatDate(p.date)}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.beginningPar)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: p.defaults > 0 ? "var(--color-low)" : undefined }}>{formatAmount(p.defaults)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.prepayments)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.scheduledMaturities)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.recoveries)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.reinvestment)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.endingPar)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.beginningLiabilities)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.endingLiabilities)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.interestCollected)}</td>
                            <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: p.equityDistribution > 0 ? "var(--color-high)" : undefined, fontWeight: p.equityDistribution > 0 ? 600 : undefined }}>{formatAmount(p.equityDistribution)}</td>
                          </tr>
                          {expandedPeriod === p.periodNum && (
                            <tr key={`trace-${p.periodNum}`}>
                              <td colSpan={12} style={{ padding: 0 }}>
                                <PeriodTrace period={p} inputs={inputs} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
```

- [ ] **Step 4: Remove the old standalone `showCashFlows` state and toggle button**

Delete the `showCashFlows` useState declaration and the entire old cash flow table div that was previously at lines ~705-785. It's now inside Transparency.

- [ ] **Step 5: Run TypeScript check and test**

Run: `npx tsc --noEmit && npx vitest run lib/clo/__tests__/projection.test.ts`
Expected: TypeScript clean, all tests pass

- [ ] **Step 6: Commit**

```bash
git add web/app/clo/waterfall/ProjectionModel.tsx
git commit -m "feat: add expandable period waterfall trace to cash flow table"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run lib/clo/__tests__/
```

Expected: All tests pass (32 existing projection + 3 new sensitivity + 7 rating = 42 total)

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Visual smoke test**

Open the waterfall page for any CLO deal. Verify:
1. Results grid shows IRR, distributions, periods as before
2. "Transparency" collapsible appears below results
3. Opening Transparency shows sensitivity table with 5 rows
4. "Model Inputs" sub-collapsible shows resolved capital structure, fees, dates, triggers
5. Cash flow table has clickable rows
6. Clicking a row expands to show the period waterfall trace
7. The old standalone "Show Cash Flow Detail" button is gone

- [ ] **Step 4: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: complete waterfall transparency panel"
```
