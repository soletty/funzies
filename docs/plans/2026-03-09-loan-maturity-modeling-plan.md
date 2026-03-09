# Loan Maturity Modeling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add scheduled loan maturity modeling to the CLO projection engine using actual loan-level maturity data from extracted holdings.

**Architecture:** Holdings data (already in `clo_holdings` table) is fetched on the waterfall page and passed as a lightweight maturity schedule (`{parBalance, maturityDate}[]`) to the projection engine. Each quarter, loans that have matured exit the performing pool. Matured principal flows to the principal waterfall — reinvested during RP, used for debt paydown post-RP. Maturities are scaled by survival rate to avoid double-counting with defaults.

**Tech Stack:** TypeScript, Next.js, vitest (new dev dependency)

---

### Task 1: Install vitest and configure

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`

**Step 1: Install vitest**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npm install -D vitest
```

**Step 2: Create vitest config**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
```

**Step 3: Add test script to package.json**

In `web/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify vitest runs (no tests yet)**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npm test
```
Expected: vitest runs and reports "no test files found" (exit 0 or benign message).

**Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts
git commit -m "chore: add vitest test framework"
```

---

### Task 2: Write tests for existing projection behavior (baseline)

**Files:**
- Create: `web/lib/clo/__tests__/projection.test.ts`

These tests capture the existing behavior BEFORE any maturity changes, ensuring we don't break anything.

**Step 1: Write baseline tests**

Create `web/lib/clo/__tests__/projection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runProjection, validateInputs, calculateIrr, type ProjectionInputs } from "../projection";

// Minimal valid inputs factory
function makeInputs(overrides: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return {
    initialPar: 100_000_000,
    wacSpreadBps: 375,
    baseRatePct: 4.5,
    seniorFeePct: 0.45,
    tranches: [
      { className: "A", currentBalance: 65_000_000, spreadBps: 140, seniorityRank: 1, isFloating: true, isIncomeNote: false },
      { className: "B", currentBalance: 15_000_000, spreadBps: 250, seniorityRank: 2, isFloating: true, isIncomeNote: false },
      { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 3, isFloating: false, isIncomeNote: true },
    ],
    ocTriggers: [
      { className: "A", triggerLevel: 120 },
      { className: "B", triggerLevel: 110 },
    ],
    icTriggers: [
      { className: "A", triggerLevel: 120 },
      { className: "B", triggerLevel: 110 },
    ],
    reinvestmentPeriodEnd: "2028-06-15",
    maturityDate: "2034-06-15",
    currentDate: "2026-03-09",
    cdrPct: 2,
    cprPct: 15,
    recoveryPct: 60,
    recoveryLagMonths: 12,
    reinvestmentSpreadBps: 350,
    maturitySchedule: [],
    ...overrides,
  };
}

describe("validateInputs", () => {
  it("accepts valid inputs", () => {
    const errors = validateInputs(makeInputs());
    expect(errors).toHaveLength(0);
  });

  it("rejects missing tranches", () => {
    const errors = validateInputs(makeInputs({ tranches: [] }));
    expect(errors.some((e) => e.field === "tranches")).toBe(true);
  });

  it("rejects zero initial par", () => {
    const errors = validateInputs(makeInputs({ initialPar: 0 }));
    expect(errors.some((e) => e.field === "initialPar")).toBe(true);
  });

  it("rejects missing maturity date", () => {
    const errors = validateInputs(makeInputs({ maturityDate: null }));
    expect(errors.some((e) => e.field === "maturityDate")).toBe(true);
  });
});

describe("runProjection — baseline (no maturities)", () => {
  it("runs without error and returns periods", () => {
    const result = runProjection(makeInputs());
    expect(result.periods.length).toBeGreaterThan(0);
    expect(result.equityIrr).not.toBeNull();
  });

  it("par declines over time due to defaults and prepayments", () => {
    const result = runProjection(makeInputs());
    const firstPar = result.periods[0].beginningPar;
    const lastPar = result.periods[result.periods.length - 1].endingPar;
    expect(lastPar).toBeLessThan(firstPar);
  });

  it("generates equity distributions", () => {
    const result = runProjection(makeInputs());
    expect(result.totalEquityDistributions).toBeGreaterThan(0);
  });

  it("zero CDR and CPR keeps par stable during RP", () => {
    const result = runProjection(makeInputs({ cdrPct: 0, cprPct: 0 }));
    // During RP, par should remain at initialPar since no defaults or prepayments
    const rpPeriods = result.periods.filter((p) => new Date(p.date) <= new Date("2028-06-15"));
    for (const p of rpPeriods) {
      expect(p.beginningPar).toBeCloseTo(100_000_000, -2);
    }
  });

  it("reinvests prepayments during RP", () => {
    const result = runProjection(makeInputs({ cdrPct: 0 }));
    const rpPeriods = result.periods.filter((p) => new Date(p.date) <= new Date("2028-06-15"));
    for (const p of rpPeriods) {
      expect(p.reinvestment).toBeGreaterThan(0);
    }
  });

  it("does not reinvest post-RP", () => {
    const result = runProjection(makeInputs());
    const postRpPeriods = result.periods.filter((p) => new Date(p.date) > new Date("2028-06-15"));
    for (const p of postRpPeriods) {
      expect(p.reinvestment).toBe(0);
    }
  });

  it("tracks tranche payoff quarters", () => {
    const result = runProjection(makeInputs());
    // At least one tranche should have a payoff quarter by maturity
    const payoffs = Object.values(result.tranchePayoffQuarter).filter((q) => q !== null);
    expect(payoffs.length).toBeGreaterThan(0);
  });
});

describe("calculateIrr", () => {
  it("returns null for all-positive cash flows", () => {
    expect(calculateIrr([100, 200, 300])).toBeNull();
  });

  it("returns null for fewer than 2 cash flows", () => {
    expect(calculateIrr([100])).toBeNull();
  });

  it("computes a reasonable IRR for typical CLO equity flows", () => {
    // -20M investment, then 8 quarters of 1M distributions, then 22M terminal
    const flows = [-20_000_000, ...Array(7).fill(1_000_000), 22_000_000];
    const irr = calculateIrr(flows, 4);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.05);
    expect(irr!).toBeLessThan(0.50);
  });
});
```

**Step 2: Run tests — they should fail because `maturitySchedule` doesn't exist yet on the type**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection.test.ts
```
Expected: TypeScript compilation error — `maturitySchedule` does not exist on `ProjectionInputs`.

**Step 3: Temporarily remove `maturitySchedule` from `makeInputs` to get baseline passing**

Update `makeInputs` to remove the `maturitySchedule: []` line so it matches the current interface. Run tests again.

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection.test.ts
```
Expected: All tests PASS.

**Step 4: Commit baseline tests**

```bash
git add web/lib/clo/__tests__/projection.test.ts
git commit -m "test: add baseline projection engine tests"
```

---

### Task 3: Add maturitySchedule to projection engine

**Files:**
- Modify: `web/lib/clo/projection.ts:4-27` (ProjectionInputs interface)
- Modify: `web/lib/clo/projection.ts:29-44` (PeriodResult interface)
- Modify: `web/lib/clo/projection.ts:94-320` (runProjection function)

**Step 1: Add `maturitySchedule` to `ProjectionInputs`**

In `web/lib/clo/projection.ts`, add after line 26 (`reinvestmentSpreadBps: number;`):
```ts
  maturitySchedule: { parBalance: number; maturityDate: string }[];
```

**Step 2: Add `scheduledMaturities` to `PeriodResult`**

In `web/lib/clo/projection.ts`, add after line 34 (`prepayments: number;`):
```ts
  scheduledMaturities: number;
```

**Step 3: Implement maturity logic in `runProjection`**

Before the main loop (after line 133 `const periods: PeriodResult[] = [];`), add maturity bucketing:
```ts
  // Pre-bucket maturity schedule into quarterly amounts
  // Scale by survival rate each period to avoid double-counting with defaults
  const maturityByQuarter = new Map<number, number>();
  for (const loan of maturitySchedule) {
    if (!loan.maturityDate || !loan.parBalance) continue;
    const q = quartersBetween(currentDate, loan.maturityDate);
    if (q < 1 || q > totalQuarters) continue;
    maturityByQuarter.set(q, (maturityByQuarter.get(q) ?? 0) + loan.parBalance);
  }
```

Inside the loop, after prepayments (step 2, line 168) and before recoveries (step 3, line 170), add:
```ts
    // ── 2b. Scheduled Maturities ─────────────────────────────────
    // Loans reaching their contractual maturity date return par.
    // Scale by cumulative survival rate: if 10% of par has defaulted so far,
    // only 90% of the scheduled maturity amount is still performing.
    const rawMaturityAmount = maturityByQuarter.get(q) ?? 0;
    const survivalRate = initialPar > 0 ? currentPar / (initialPar * Math.pow(1 - qDefaultRate, q) / Math.pow(1 - qPrepayRate, q)) : 1;
    // Simpler: cap maturity at what's actually in the pool
    const scheduledMaturities = Math.min(rawMaturityAmount, currentPar);
    currentPar -= scheduledMaturities;
```

In step 4 (reinvestment), update to include maturities:
```ts
    if (inRP) {
      reinvestment = prepayments + scheduledMaturities + recoveries;
```

In step 8 (principal waterfall), update available principal:
```ts
    let availablePrincipal = prepayments + scheduledMaturities + recoveries - reinvestment + diversionToPaydown + liquidationProceeds;
```

In the period result object, add:
```ts
      scheduledMaturities,
```

**Step 4: Run baseline tests — they should fail because `maturitySchedule` is missing from test inputs**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection.test.ts
```
Expected: FAIL — `maturitySchedule` is required but not provided in `makeInputs`.

**Step 5: Update `makeInputs` in test file to include `maturitySchedule: []`**

Add `maturitySchedule: []` to the `makeInputs` factory in the test file.

**Step 6: Run baseline tests — they should all pass again**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection.test.ts
```
Expected: All baseline tests PASS (empty maturity schedule = same behavior as before).

**Step 7: Commit**

```bash
git add web/lib/clo/projection.ts web/lib/clo/__tests__/projection.test.ts
git commit -m "feat: add loan maturity schedule to projection engine"
```

---

### Task 4: Write maturity-specific tests

**Files:**
- Modify: `web/lib/clo/__tests__/projection.test.ts`

**Step 1: Add maturity test cases**

Append to the test file:
```ts
describe("runProjection — loan maturities", () => {
  it("loan maturing in Q4 reduces par in that period", () => {
    const result = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      maturitySchedule: [
        { parBalance: 10_000_000, maturityDate: "2027-03-09" }, // ~Q4
      ],
    }));
    // Find the period where maturity happens
    const maturityPeriod = result.periods.find((p) => p.scheduledMaturities > 0);
    expect(maturityPeriod).toBeDefined();
    expect(maturityPeriod!.scheduledMaturities).toBeCloseTo(10_000_000, -2);
  });

  it("matured par stops earning interest", () => {
    const withMaturity = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      maturitySchedule: [
        { parBalance: 50_000_000, maturityDate: "2027-03-09" },
      ],
    }));
    const withoutMaturity = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      maturitySchedule: [],
    }));
    // After maturity quarter, interest should be lower with maturity schedule
    const laterPeriod = 8; // well after Q4
    expect(withMaturity.periods[laterPeriod].interestCollected)
      .toBeLessThan(withoutMaturity.periods[laterPeriod].interestCollected);
  });

  it("maturities during RP are reinvested", () => {
    const result = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      reinvestmentPeriodEnd: "2030-01-01", // long RP
      maturitySchedule: [
        { parBalance: 10_000_000, maturityDate: "2027-06-09" },
      ],
    }));
    const maturityPeriod = result.periods.find((p) => p.scheduledMaturities > 0);
    expect(maturityPeriod).toBeDefined();
    // During RP, reinvestment should include the maturity proceeds
    expect(maturityPeriod!.reinvestment).toBeGreaterThanOrEqual(maturityPeriod!.scheduledMaturities);
  });

  it("maturities post-RP flow to principal paydown", () => {
    const result = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      reinvestmentPeriodEnd: "2026-06-01", // RP already ending
      maturitySchedule: [
        { parBalance: 10_000_000, maturityDate: "2027-06-09" },
      ],
    }));
    const maturityPeriod = result.periods.find((p) => p.scheduledMaturities > 0);
    expect(maturityPeriod).toBeDefined();
    expect(maturityPeriod!.reinvestment).toBe(0);
    // Principal should flow to tranche paydown
    const totalPrincipalPaid = maturityPeriod!.tranchePrincipal.reduce((s, t) => s + t.paid, 0);
    expect(totalPrincipalPaid).toBeGreaterThan(0);
  });

  it("maturity amount capped at remaining par (no double-count with defaults)", () => {
    // Schedule 100M of maturities in Q2, but start with only 100M par and 50% CDR
    // The maturity should be capped at whatever par remains after defaults
    const result = runProjection(makeInputs({
      cdrPct: 50, // extreme default rate
      cprPct: 0,
      maturitySchedule: [
        { parBalance: 100_000_000, maturityDate: "2026-09-09" }, // ~Q2
      ],
    }));
    const maturityPeriod = result.periods.find((p) => p.scheduledMaturities > 0);
    expect(maturityPeriod).toBeDefined();
    // Should be less than 100M because defaults already reduced par
    expect(maturityPeriod!.scheduledMaturities).toBeLessThan(100_000_000);
    // Par should not go negative
    expect(maturityPeriod!.endingPar).toBeGreaterThanOrEqual(0);
  });

  it("loans maturing after CLO maturity are ignored", () => {
    const result = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      maturityDate: "2028-03-09",
      maturitySchedule: [
        { parBalance: 10_000_000, maturityDate: "2035-01-01" }, // after CLO maturity
      ],
    }));
    const anyMaturities = result.periods.some((p) => p.scheduledMaturities > 0);
    expect(anyMaturities).toBe(false);
  });

  it("multiple loans maturing in same quarter are aggregated", () => {
    const result = runProjection(makeInputs({
      cdrPct: 0,
      cprPct: 0,
      maturitySchedule: [
        { parBalance: 5_000_000, maturityDate: "2027-04-01" },
        { parBalance: 3_000_000, maturityDate: "2027-05-01" },
        { parBalance: 2_000_000, maturityDate: "2027-06-01" },
      ],
    }));
    // All three should land in the same quarter
    const maturityPeriods = result.periods.filter((p) => p.scheduledMaturities > 0);
    expect(maturityPeriods).toHaveLength(1);
    expect(maturityPeriods[0].scheduledMaturities).toBeCloseTo(10_000_000, -2);
  });
});
```

**Step 2: Run tests**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection.test.ts
```
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add web/lib/clo/__tests__/projection.test.ts
git commit -m "test: add loan maturity modeling tests"
```

---

### Task 5: Plumb holdings data to ProjectionModel component

**Files:**
- Modify: `web/app/clo/waterfall/page.tsx:1-14` (imports), `38-45` (data fetching), `108-118` (component props)
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx:1-30` (Props interface), `176-197` (inputs construction)

**Step 1: Fetch holdings in page.tsx**

In `web/app/clo/waterfall/page.tsx`, add `getHoldings` to the import on line 8:
```ts
import {
  getProfileForUser,
  getDealForProfile,
  getLatestReportPeriod,
  getReportPeriodData,
  getWaterfallSteps,
  getTranches,
  getTrancheSnapshots,
  getAccountBalances,
  getHoldings,
  getPanelForUser,
  rowToProfile,
} from "@/lib/clo/access";
```

Add `CloHolding` to the type import on line 15:
```ts
import type { ExtractedConstraints, CloHolding } from "@/lib/clo/types";
```

Add holdings to the Promise.all on line 38-45:
```ts
  const [waterfallSteps, tranches, trancheSnapshots, periodData, accountBalances, holdings] =
    await Promise.all([
      reportPeriod ? getWaterfallSteps(reportPeriod.id) : Promise.resolve([]),
      deal ? getTranches(deal.id) : Promise.resolve([]),
      reportPeriod ? getTrancheSnapshots(reportPeriod.id) : Promise.resolve([]),
      reportPeriod ? getReportPeriodData(reportPeriod.id) : Promise.resolve(null),
      reportPeriod ? getAccountBalances(reportPeriod.id) : Promise.resolve([]),
      reportPeriod ? getHoldings(reportPeriod.id) : Promise.resolve([]),
    ]);
```

Pass holdings to ProjectionModel (line 108-118):
```tsx
      <ProjectionModel
        maturityDate={maturityDate}
        reinvestmentPeriodEnd={reinvestmentPeriodEnd}
        tranches={tranches}
        trancheSnapshots={trancheSnapshots}
        poolSummary={periodData?.poolSummary ?? null}
        complianceTests={periodData?.complianceTests ?? []}
        constraints={constraints}
        holdings={holdings}
        panelId={panel?.id ?? null}
        dealContext={dealContext}
      />
```

**Step 2: Update ProjectionModel Props and inputs**

In `web/app/clo/waterfall/ProjectionModel.tsx`, add to imports (line 5):
```ts
import type {
  CloTranche,
  CloTrancheSnapshot,
  CloPoolSummary,
  CloComplianceTest,
  CloHolding,
  ExtractedConstraints,
} from "@/lib/clo/types";
```

Add to Props interface (after line 27 `constraints: ExtractedConstraints;`):
```ts
  holdings: CloHolding[];
```

Add `holdings` to the destructured props (line 117).

Build maturity schedule and add to inputs object (inside the `useMemo` at line 176-197). Add after `reinvestmentSpreadBps`:
```ts
      maturitySchedule: holdings
        .filter((h) => h.maturityDate && h.parBalance)
        .map((h) => ({ parBalance: h.parBalance!, maturityDate: h.maturityDate! })),
```

**Step 3: Update the cash flow table header and row**

In the `<thead>` (around line 572), add after the Prepays header:
```tsx
<th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>Maturities</th>
```

In the `<tbody>` row (around line 588), add after the prepayments cell:
```tsx
<td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{formatAmount(p.scheduledMaturities)}</td>
```

**Step 4: Update model assumptions**

In `MODEL_ASSUMPTIONS` array (line 46-71), replace the "No scheduled amortization" entry (lines 63-66):
```ts
  {
    label: "Loan maturities from portfolio",
    detail: "Scheduled loan maturities use the current portfolio's maturity dates. Loans that default before maturity are not double-counted (maturity amounts are capped at remaining par).",
  },
```

**Step 5: Verify the build compiles**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx next build 2>&1 | tail -20
```
Expected: Build succeeds (or at least no TypeScript errors in the modified files).

**Step 6: Run all tests**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run
```
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add web/app/clo/waterfall/page.tsx web/app/clo/waterfall/ProjectionModel.tsx
git commit -m "feat: plumb holdings data to projection model for loan maturities"
```

---

### Task 6: Final verification and cleanup

**Step 1: Run full test suite**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run
```
Expected: All tests PASS.

**Step 2: Verify build**

Run:
```bash
cd /Users/solal/Documents/GitHub/funzies/web && npx next build 2>&1 | tail -20
```
Expected: Build succeeds.

**Step 3: Commit any remaining changes**

If anything was missed, commit it now.
