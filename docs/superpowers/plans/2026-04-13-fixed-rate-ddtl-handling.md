# Fixed-Rate & DDTL Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the projection engine correctly handle fixed-rate bonds (flat coupon, no EURIBOR sensitivity) and DDTLs (unfunded commitments that earn nothing until drawn).

**Architecture:** Extend `ResolvedLoan` → `LoanInput` → `LoanState` with `isFixedRate`/`fixedCouponPct` and `isDelayedDraw`/`ddtlSpreadBps`/`drawQuarter` fields. The resolver maps extraction data to these fields; the projection engine branches on them during interest calculation and skips DDTLs for defaults/prepayments until drawn. OC numerator gets a dynamic DDTL deduction replacing the static `impliedOcAdjustment` portion.

**Tech Stack:** TypeScript, Vitest, React (UI panel)

**Spec:** `docs/superpowers/specs/2026-04-13-fixed-rate-ddtl-handling-design.md`

---

### Task 1: Extend data model types

**Files:**
- Modify: `web/lib/clo/resolver-types.ts`
- Modify: `web/lib/clo/projection.ts:6-11` (LoanInput interface)

- [ ] **Step 1: Add fixed-rate and DDTL fields to ResolvedLoan**

In `web/lib/clo/resolver-types.ts`, add to the `ResolvedLoan` interface:

```typescript
export interface ResolvedLoan {
  parBalance: number;
  maturityDate: string;
  ratingBucket: string;
  spreadBps: number;
  obligorName?: string;
  isFixedRate?: boolean;       // true = flat coupon, no EURIBOR sensitivity
  fixedCouponPct?: number;     // e.g. 8.0 for 8%. Only meaningful when isFixedRate=true
  isDelayedDraw?: boolean;     // true = unfunded commitment, no interest until drawn
  ddtlSpreadBps?: number;      // spread from parent facility, applied at draw
  drawQuarter?: number;        // quarter in which the DDTL converts to funded
}
```

- [ ] **Step 2: Add matching fields to LoanInput in projection.ts**

In `web/lib/clo/projection.ts`, update the `LoanInput` interface (lines 6-11):

```typescript
export interface LoanInput {
  parBalance: number;
  maturityDate: string;
  ratingBucket: string;
  spreadBps: number;
  isFixedRate?: boolean;
  fixedCouponPct?: number;
  isDelayedDraw?: boolean;
  ddtlSpreadBps?: number;
  drawQuarter?: number;
}
```

- [ ] **Step 3: Add ddtlUnfundedPar to ResolvedDealData**

In `web/lib/clo/resolver-types.ts`, add to `ResolvedDealData`:

```typescript
ddtlUnfundedPar: number; // total DDTL commitment par (for dynamic OC deduction in projection)
```

- [ ] **Step 4: Update EMPTY_RESOLVED in build-projection-inputs.ts**

In `web/lib/clo/build-projection-inputs.ts`, add to the `EMPTY_RESOLVED` constant:

```typescript
ddtlUnfundedPar: 0,
```

- [ ] **Step 5: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/resolver-types.ts web/lib/clo/projection.ts web/lib/clo/build-projection-inputs.ts && git commit -m "feat(clo): add fixed-rate and DDTL fields to loan data model"
```

---

### Task 2: Add DDTL user assumptions

**Files:**
- Modify: `web/lib/clo/defaults.ts`
- Modify: `web/lib/clo/build-projection-inputs.ts`

- [ ] **Step 1: Add DDTL defaults**

In `web/lib/clo/defaults.ts`, add inside the `CLO_DEFAULTS` object before the closing `} as const`:

```typescript
  // DDTL draw assumptions
  ddtlDrawQuarter: 4,       // default: assume drawn after 1 year
  ddtlDrawPercent: 100,     // default: 100% of commitment drawn
```

- [ ] **Step 2: Add DDTL fields to UserAssumptions**

In `web/lib/clo/build-projection-inputs.ts`, add to the `UserAssumptions` interface:

```typescript
  ddtlDrawAssumption: 'draw_at_deadline' | 'never_draw' | 'custom_quarter';
  ddtlDrawQuarter: number;   // only used if 'custom_quarter'
  ddtlDrawPercent: number;   // what % of commitment is drawn (0-100)
```

- [ ] **Step 3: Add DDTL fields to DEFAULT_ASSUMPTIONS**

In `web/lib/clo/build-projection-inputs.ts`, add to `DEFAULT_ASSUMPTIONS`:

```typescript
  ddtlDrawAssumption: 'draw_at_deadline' as const,
  ddtlDrawQuarter: CLO_DEFAULTS.ddtlDrawQuarter,
  ddtlDrawPercent: CLO_DEFAULTS.ddtlDrawPercent,
```

- [ ] **Step 4: Add ddtlUnfundedPar and ddtlDrawPercent to ProjectionInputs passthrough**

In `web/lib/clo/build-projection-inputs.ts`, update the `buildFromResolved` function return to include:

```typescript
    ddtlUnfundedPar: resolved.ddtlUnfundedPar,
    ddtlDrawPercent: userAssumptions.ddtlDrawPercent,
```

These go into `ProjectionInputs` (added in Task 4).

- [ ] **Step 5: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/defaults.ts web/lib/clo/build-projection-inputs.ts && git commit -m "feat(clo): add DDTL user assumptions and defaults"
```

---

### Task 3: Update resolver for fixed-rate and DDTL detection

**Files:**
- Modify: `web/lib/clo/resolver.ts:548-558` (loan mapping)
- Modify: `web/lib/clo/resolver.ts:611-621` (impliedOcAdjustment)
- Modify: `web/lib/clo/resolver.ts:637-639` (return statement)

- [ ] **Step 1: Update loan mapping to detect fixed-rate positions**

Replace the loan mapping block at `web/lib/clo/resolver.ts` lines 548-558:

```typescript
  // --- Loans ---
  const fallbackMaturity = resolvedMaturity;

  // Separate DDTLs for parent facility matching
  const nonDdtlHoldings = holdings.filter(h => !h.isDelayedDraw && !h.isDefaulted && h.parBalance != null && h.parBalance > 0);

  const loans: ResolvedLoan[] = holdings
    .filter(h => h.parBalance != null && h.parBalance > 0 && !h.isDefaulted)
    .map(h => {
      // Fixed-rate detection: use allInRate as the flat coupon
      const isFixed = h.isFixedRate === true;
      let fixedCouponPct: number | undefined;
      if (isFixed) {
        if (h.allInRate != null && h.allInRate > 0) {
          fixedCouponPct = h.allInRate;
        } else if (h.spreadBps != null && h.spreadBps > 0) {
          // Some reports encode fixed coupons in the spread column as a percentage
          fixedCouponPct = h.spreadBps / 100;
          warnings.push({ field: "fixedCouponPct", message: `Fixed-rate position "${h.obligorName}" has no allInRate — using spreadBps (${h.spreadBps}) as proxy. Verify the coupon is ${fixedCouponPct.toFixed(2)}%.`, severity: "warn" });
        } else {
          fixedCouponPct = wacSpreadBps / 100;
          warnings.push({ field: "fixedCouponPct", message: `Fixed-rate position "${h.obligorName}" has no allInRate or spreadBps — falling back to WAC spread as coupon (${(wacSpreadBps / 100).toFixed(2)}%).`, severity: "warn" });
        }
      }

      // DDTL detection: find parent facility spread
      const isDdtl = h.isDelayedDraw === true;
      let ddtlSpreadBps: number | undefined;
      if (isDdtl) {
        // Match parent facility by obligor name among non-DDTL, non-defaulted holdings
        const candidates = nonDdtlHoldings.filter(c => c.obligorName === h.obligorName);
        if (candidates.length > 1) {
          // Tiebreaker: closest maturity, then largest par
          candidates.sort((a, b) => {
            if (h.maturityDate && a.maturityDate && b.maturityDate) {
              const diffA = Math.abs(new Date(a.maturityDate).getTime() - new Date(h.maturityDate).getTime());
              const diffB = Math.abs(new Date(b.maturityDate).getTime() - new Date(h.maturityDate).getTime());
              if (diffA !== diffB) return diffA - diffB;
            }
            return (b.parBalance ?? 0) - (a.parBalance ?? 0);
          });
          warnings.push({ field: "ddtlParentMatch", message: `DDTL "${h.obligorName}" has ${candidates.length} candidate parent facilities — matched to "${candidates[0].facilityName ?? candidates[0].obligorName}" by maturity proximity. Verify spread (${candidates[0].spreadBps ?? 'null'} bps).`, severity: "info" });
        }
        const parent = candidates[0];
        ddtlSpreadBps = parent?.spreadBps ?? wacSpreadBps;
        if (!parent) {
          warnings.push({ field: "ddtlParentMatch", message: `DDTL "${h.obligorName}" has no matching parent facility — falling back to WAC spread (${wacSpreadBps} bps).`, severity: "warn" });
        }
      }

      return {
        parBalance: h.parBalance!,
        maturityDate: h.maturityDate ?? fallbackMaturity,
        ratingBucket: mapToRatingBucket(h.moodysRating ?? null, h.spRating ?? null, h.fitchRating ?? null, h.compositeRating ?? null),
        spreadBps: isFixed ? 0 : (isDdtl ? 0 : (h.spreadBps ?? wacSpreadBps)),
        obligorName: h.obligorName ?? undefined,
        isFixedRate: isFixed || undefined,
        fixedCouponPct: fixedCouponPct,
        isDelayedDraw: isDdtl || undefined,
        ddtlSpreadBps: ddtlSpreadBps,
      };
    });
```

- [ ] **Step 2: Compute ddtlUnfundedPar and adjust impliedOcAdjustment**

After the existing `impliedOcAdjustment` computation (around line 620), add:

```typescript
  // Carve out DDTL unfunded par from impliedOcAdjustment so the projection
  // engine can manage the deduction dynamically (disappears when DDTLs draw/expire).
  const ddtlUnfundedPar = loans
    .filter(l => l.isDelayedDraw)
    .reduce((s, l) => s + l.parBalance, 0);
  if (ddtlUnfundedPar > 0 && impliedOcAdjustment > 0) {
    // The implied adjustment likely includes the DDTL unfunded amount.
    // Remove it so the engine handles it dynamically.
    impliedOcAdjustment = Math.max(0, impliedOcAdjustment - ddtlUnfundedPar);
  }
```

- [ ] **Step 3: Add ddtlUnfundedPar to the return statement**

Update the return object at line ~638 to include `ddtlUnfundedPar`:

```typescript
  return {
    resolved: { tranches, poolSummary, ocTriggers, icTriggers, reinvestmentOcTrigger, dates, fees, loans, principalAccountCash, preExistingDefaultedPar, preExistingDefaultRecovery, unpricedDefaultedPar, preExistingDefaultOcValue, impliedOcAdjustment, deferredInterestCompounds, baseRateFloorPct, ddtlUnfundedPar },
    warnings,
  };
```

- [ ] **Step 4: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/resolver.ts && git commit -m "feat(clo): resolver detects fixed-rate positions and DDTL parent facilities"
```

---

### Task 4: Write failing tests for fixed-rate and DDTL projection logic

**Files:**
- Modify: `web/lib/clo/__tests__/test-helpers.ts`
- Create: `web/lib/clo/__tests__/projection-fixed-rate-ddtl.test.ts`

- [ ] **Step 1: Update test helpers with new LoanInput fields**

In `web/lib/clo/__tests__/test-helpers.ts`, the existing `makeInputs` helper needs `ddtlUnfundedPar` and `ddtlDrawPercent` in its defaults. Add them to the return object:

```typescript
    ddtlUnfundedPar: 0,
    ddtlDrawPercent: 100,
    ...overrides,
```

These go right before the `...overrides` spread.

- [ ] **Step 2: Write fixed-rate interest test**

Create `web/lib/clo/__tests__/projection-fixed-rate-ddtl.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runProjection, addQuarters } from "../projection";
import { makeInputs, uniformRates } from "./test-helpers";

describe("Fixed-rate loan interest", () => {
  it("earns flat coupon regardless of base rate", () => {
    const fixedLoan = {
      parBalance: 10_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isFixedRate: true,
      fixedCouponPct: 8.0,
    };

    // Run with base rate 2.5%
    const result1 = runProjection(makeInputs({
      loans: [fixedLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
    }));

    // Run with base rate 5.0%
    const result2 = runProjection(makeInputs({
      loans: [fixedLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 5.0,
    }));

    // Both should produce the same interest: 10M * 8% / 4 = 200,000
    expect(result1.periods[0].interestCollected).toBeCloseTo(200_000, 0);
    expect(result2.periods[0].interestCollected).toBeCloseTo(200_000, 0);
    expect(result1.periods[0].interestCollected).toEqual(result2.periods[0].interestCollected);
  });

  it("mixed portfolio: fixed + floating produce correct combined interest", () => {
    const floatingLoan = {
      parBalance: 9_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 375,
    };
    const fixedLoan = {
      parBalance: 1_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isFixedRate: true,
      fixedCouponPct: 8.0,
    };

    const result = runProjection(makeInputs({
      loans: [floatingLoan, fixedLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
    }));

    // Floating: 9M * (2.5 + 3.75) / 100 / 4 = 9M * 6.25 / 400 = 140,625
    // Fixed: 1M * 8.0 / 100 / 4 = 20,000
    // Total: 160,625
    expect(result.periods[0].interestCollected).toBeCloseTo(160_625, 0);
  });
});

describe("DDTL projection", () => {
  it("earns no interest before draw quarter", () => {
    const ddtlLoan = {
      parBalance: 500_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 4,
    };

    const result = runProjection(makeInputs({
      loans: [ddtlLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
    }));

    // Q1-Q3: no interest from DDTL
    expect(result.periods[0].interestCollected).toBeCloseTo(0, 0);
    expect(result.periods[1].interestCollected).toBeCloseTo(0, 0);
    expect(result.periods[2].interestCollected).toBeCloseTo(0, 0);
  });

  it("earns parent spread after draw quarter", () => {
    const ddtlLoan = {
      parBalance: 500_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 2,
    };

    const result = runProjection(makeInputs({
      loans: [ddtlLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
      ddtlDrawPercent: 100,
    }));

    // Q1: no interest
    expect(result.periods[0].interestCollected).toBeCloseTo(0, 0);

    // Q2: draw happens, loan earns interest for the quarter
    // 500K * (2.5 + 3.5) / 100 / 4 = 500K * 6.0 / 400 = 7,500
    expect(result.periods[1].interestCollected).toBeCloseTo(7_500, 0);

    // Q3: normal floating loan
    expect(result.periods[2].interestCollected).toBeCloseTo(7_500, 0);
  });

  it("never_draw removes par at Q1", () => {
    // When drawQuarter is 0, the DDTL is excluded (never_draw).
    // The resolver handles this by filtering out DDTLs before they enter the engine
    // when the user selects never_draw. We test the engine behavior: a loan with
    // drawQuarter=0 should be removed immediately.
    const normalLoan = {
      parBalance: 10_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 375,
    };
    const ddtlLoan = {
      parBalance: 500_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 0, // never_draw: engine removes at Q1
    };

    const result = runProjection(makeInputs({
      loans: [normalLoan, ddtlLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
    }));

    // Only the normal loan's interest should appear
    // 10M * (2.5 + 3.75) / 100 / 4 = 156,250
    expect(result.periods[0].interestCollected).toBeCloseTo(156_250, 0);

    // Par should reflect only the normal loan
    expect(result.periods[0].beginningPar).toBeCloseTo(10_000_000, 0);
  });

  it("partial draw reduces par", () => {
    const ddtlLoan = {
      parBalance: 500_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 2,
    };

    const result = runProjection(makeInputs({
      loans: [ddtlLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      baseRatePct: 2.5,
      ddtlDrawPercent: 60,
    }));

    // Q2: 60% drawn = 300K funded, 200K expires
    // Interest: 300K * (2.5 + 3.5) / 100 / 4 = 4,500
    expect(result.periods[1].interestCollected).toBeCloseTo(4_500, 0);

    // Par after draw should be 300K (the funded portion)
    expect(result.periods[1].endingPar).toBeCloseTo(300_000, 0);
  });

  it("DDTL is not subject to defaults or prepayments before draw", () => {
    const ddtlLoan = {
      parBalance: 1_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "CCC", // high default rate
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 4,
    };

    const result = runProjection(makeInputs({
      loans: [ddtlLoan],
      defaultRatesByRating: uniformRates(5), // 5% CDR
      cprPct: 20,
    }));

    // Q1-Q3: no defaults, no prepayments on unfunded DDTL
    expect(result.periods[0].defaults).toBeCloseTo(0, 0);
    expect(result.periods[0].prepayments).toBeCloseTo(0, 0);
    expect(result.periods[1].defaults).toBeCloseTo(0, 0);
    expect(result.periods[2].defaults).toBeCloseTo(0, 0);
  });
});

describe("DDTL dynamic OC deduction", () => {
  it("unfunded DDTL par is excluded from OC numerator", () => {
    const normalLoan = {
      parBalance: 10_000_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 375,
    };
    const ddtlLoan = {
      parBalance: 500_000,
      maturityDate: addQuarters("2026-03-09", 20),
      ratingBucket: "B",
      spreadBps: 0,
      isDelayedDraw: true,
      ddtlSpreadBps: 350,
      drawQuarter: 8,
    };

    const result = runProjection(makeInputs({
      loans: [normalLoan, ddtlLoan],
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      ddtlUnfundedPar: 500_000,
    }));

    // Q1 OC numerator should NOT include the 500K DDTL par.
    // With 10M normal par, OC numerator ~10M (not 10.5M).
    // OC test: numerator / denominator. Denominator = Class A (65M) = way above numerator,
    // so the ratio is below trigger. The key test: OC numerator should reflect 10M not 10.5M.
    const q1 = result.periods[0];
    // With 10M par and 65M class A, OC = 10M/65M*100 ≈ 15.38
    // If DDTL par were included: 10.5M/65M*100 ≈ 16.15
    expect(q1.ocTests[0].actual).toBeCloseTo(10_000_000 / 65_000_000 * 100, 1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection-fixed-rate-ddtl.test.ts`

Expected: FAIL — the projection engine doesn't yet handle the new fields.

- [ ] **Step 4: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/__tests__/projection-fixed-rate-ddtl.test.ts web/lib/clo/__tests__/test-helpers.ts && git commit -m "test(clo): add failing tests for fixed-rate and DDTL projection logic"
```

---

### Task 5: Implement projection engine changes

**Files:**
- Modify: `web/lib/clo/projection.ts`

This is the core task. Changes to `LoanState`, interest calculation, DDTL draw/expire logic, and dynamic OC deduction.

- [ ] **Step 1: Add new fields to ProjectionInputs and LoanState**

In `web/lib/clo/projection.ts`, add to `ProjectionInputs` (after `impliedOcAdjustment` around line 63):

```typescript
  ddtlUnfundedPar?: number;    // total DDTL commitment par (for dynamic OC deduction)
  ddtlDrawPercent?: number;    // % of DDTL commitment drawn at draw quarter (default 100)
```

Update the `LoanState` interface (inside `runProjection`, around line 171):

```typescript
  interface LoanState {
    survivingPar: number;
    maturityQuarter: number;
    ratingBucket: string;
    spreadBps: number;
    isFixedRate?: boolean;
    fixedCouponPct?: number;
    isDelayedDraw?: boolean;
    ddtlSpreadBps?: number;
    drawQuarter?: number;
  }
```

- [ ] **Step 2: Update LoanState initialization**

Update the `loanStates` mapping (around line 178) to carry the new fields:

```typescript
  const loanStates: LoanState[] = loans.map((l) => ({
    survivingPar: l.parBalance,
    maturityQuarter: Math.max(1, quartersBetween(currentDate, l.maturityDate)),
    ratingBucket: l.ratingBucket,
    spreadBps: l.spreadBps,
    isFixedRate: l.isFixedRate,
    fixedCouponPct: l.fixedCouponPct,
    isDelayedDraw: l.isDelayedDraw,
    ddtlSpreadBps: l.ddtlSpreadBps,
    drawQuarter: l.drawQuarter,
  }));
```

- [ ] **Step 3: Add DDTL draw percent destructuring**

In the destructuring at line 150, add:

```typescript
    ddtlUnfundedPar = 0, ddtlDrawPercent = 100,
```

After `impliedOcAdjustment = 0`.

- [ ] **Step 4: Handle never_draw DDTLs (drawQuarter=0) — remove at init**

Right after the `loanStates` initialization (after line ~186), add:

```typescript
  // Remove never_draw DDTLs (drawQuarter <= 0) — commitment expires, par exits portfolio
  for (let i = loanStates.length - 1; i >= 0; i--) {
    if (loanStates[i].isDelayedDraw && (loanStates[i].drawQuarter ?? 0) <= 0) {
      loanStates.splice(i, 1);
    }
  }
```

- [ ] **Step 5: Add DDTL draw event and skip logic in the quarterly loop**

Inside the quarterly loop, right after `const loanBeginningPar = ...` (line 276), add the DDTL draw event processing:

```typescript
    // ── 1b. DDTL draw events ──────────────────────────────────────
    if (hasLoans) {
      for (const loan of loanStates) {
        if (!loan.isDelayedDraw) continue;
        if (q === loan.drawQuarter) {
          // Draw event: convert to funded floating-rate loan
          const fundedPar = loan.survivingPar * (ddtlDrawPercent / 100);
          loan.survivingPar = fundedPar; // undrawn portion expires
          loan.spreadBps = loan.ddtlSpreadBps ?? 0;
          loan.isDelayedDraw = false;
        }
      }
    }
```

- [ ] **Step 6: Skip DDTLs in maturity, default, and prepayment loops**

In the per-loan maturities loop (section 2, around line 281), add a skip for unfunded DDTLs:

```typescript
      for (const loan of loanStates) {
        if (loan.isDelayedDraw) continue; // unfunded — no maturity event
        if (q === loan.maturityQuarter) {
```

In the per-loan defaults loop (section 3, around line 294), add a skip:

```typescript
      for (const loan of loanStates) {
        if (loan.survivingPar <= 0) continue;
        if (loan.isDelayedDraw) continue; // unfunded — no default risk
```

In the per-loan prepayments loop (section 4, around line 313), add a skip:

```typescript
      for (const loan of loanStates) {
        if (loan.survivingPar > 0) {
          if (loan.isDelayedDraw) continue; // unfunded — no prepayment
```

Wait — prepayments are inside a `if (loan.survivingPar > 0)` block. The skip should go inside that block:

```typescript
      for (const loan of loanStates) {
        if (loan.survivingPar > 0) {
          if (loan.isDelayedDraw) continue;
          const prepay = loan.survivingPar * qPrepayRate;
```

- [ ] **Step 7: Update interest calculation for fixed-rate and DDTL**

Replace the interest collection loop (section 6, lines 358-365) with:

```typescript
    if (hasLoans) {
      interestCollected = 0;
      for (let i = 0; i < loanStates.length; i++) {
        const loan = loanStates[i];
        if (loan.isDelayedDraw) continue; // unfunded — no interest
        const loanBegPar = loanBeginningPar[i];
        if (loan.isFixedRate) {
          interestCollected += loanBegPar * (loan.fixedCouponPct ?? 0) / 100 / 4;
        } else {
          interestCollected += loanBegPar * (flooredBaseRate + loan.spreadBps / 100) / 100 / 4;
        }
      }
```

The rest of section 6 (Q1 principal cash, else branch) stays unchanged.

- [ ] **Step 8: Add dynamic DDTL OC deduction**

In the OC numerator calculation (around line 502), replace the existing `ocNumerator` line:

```typescript
    // Dynamic DDTL deduction: unfunded par excluded from OC numerator
    const currentDdtlUnfundedPar = hasLoans
      ? loanStates.filter(l => l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0)
      : 0;
    let ocNumerator = endingPar + remainingPrelim + pendingRecoveryValue + ocDefaultBoost - impliedOcAdjustment - currentDdtlUnfundedPar;
```

- [ ] **Step 9: Update reinvestment loan pushes to include new fields**

The reinvestment code (lines 401 and 405) pushes new `LoanState` objects. Add the missing fields with defaults:

```typescript
          loanStates.push({ survivingPar: par, ratingBucket: reinvestmentRating, spreadBps: reinvestmentSpreadBps, maturityQuarter: matQ, isFixedRate: false, isDelayedDraw: false });
```

Both push calls (line 401 inside the while loop and line 405 for the else) get the same treatment.

- [ ] **Step 10: Run tests**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/projection-fixed-rate-ddtl.test.ts`

Expected: All tests PASS.

- [ ] **Step 11: Run full test suite to check for regressions**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/`

Expected: All existing tests still pass. The new optional fields default to `undefined`/`false`, so existing `LoanInput` objects (without `isFixedRate`/`isDelayedDraw`) behave identically to before.

- [ ] **Step 12: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/projection.ts && git commit -m "feat(clo): projection engine handles fixed-rate bonds and DDTLs"
```

---

### Task 6: Wire DDTL assumptions through build-projection-inputs

**Files:**
- Modify: `web/lib/clo/build-projection-inputs.ts`

- [ ] **Step 1: Handle never_draw filtering and drawQuarter mapping**

Update `buildFromResolved` to filter DDTLs when `never_draw` is selected and to set `drawQuarter` on each loan:

```typescript
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

  // Map loans, setting drawQuarter on DDTLs
  const loans = resolved.loans.map(l => ({
    ...l,
    drawQuarter: l.isDelayedDraw ? ddtlDrawQuarter : undefined,
  }));

  return {
    initialPar: resolved.poolSummary.totalPar,
    wacSpreadBps: resolved.poolSummary.wacSpreadBps,
    // ... (all existing fields stay the same)
    loans,
    // ... (rest of existing fields)
    ddtlUnfundedPar: resolved.ddtlUnfundedPar,
    ddtlDrawPercent: userAssumptions.ddtlDrawPercent,
  };
}
```

Note: Do NOT replace the entire function body — just change the `loans:` line from `resolved.loans` to the mapped version, and add the two new fields at the end.

- [ ] **Step 2: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/lib/clo/build-projection-inputs.ts && git commit -m "feat(clo): wire DDTL assumptions through build-projection-inputs"
```

---

### Task 7: Update UI — FeeAssumptions panel and ModelAssumptions register

**Files:**
- Modify: `web/app/clo/waterfall/FeeAssumptions.tsx`
- Modify: `web/app/clo/waterfall/ModelAssumptions.tsx`
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx`

- [ ] **Step 1: Add DDTL state and assumptions to ProjectionModel**

In `web/app/clo/waterfall/ProjectionModel.tsx`, add state variables after the existing fee state (around line 115):

```typescript
  // DDTL assumptions
  const [ddtlDrawAssumption, setDdtlDrawAssumption] = useState<'draw_at_deadline' | 'never_draw' | 'custom_quarter'>('draw_at_deadline');
  const [ddtlDrawQuarter, setDdtlDrawQuarter] = useState<number>(CLO_DEFAULTS.ddtlDrawQuarter);
  const [ddtlDrawPercent, setDdtlDrawPercent] = useState<number>(CLO_DEFAULTS.ddtlDrawPercent);
```

Compute portfolio composition info for the info lines:

```typescript
  const portfolioInfo = useMemo(() => {
    const loans = resolved?.loans ?? [];
    const fixedRateLoans = loans.filter(l => l.isFixedRate);
    const ddtlLoans = loans.filter(l => l.isDelayedDraw);
    const totalPar = loans.reduce((s, l) => s + l.parBalance, 0);
    return {
      fixedRateCount: fixedRateLoans.length,
      fixedRatePar: fixedRateLoans.reduce((s, l) => s + l.parBalance, 0),
      fixedRatePct: totalPar > 0 ? fixedRateLoans.reduce((s, l) => s + l.parBalance, 0) / totalPar * 100 : 0,
      ddtlCount: ddtlLoans.length,
      ddtlPar: ddtlLoans.reduce((s, l) => s + l.parBalance, 0),
      hasDdtls: ddtlLoans.length > 0,
      hasFixedRate: fixedRateLoans.length > 0,
    };
  }, [resolved?.loans]);
```

Add the DDTL fields to the `buildFromResolved` call (inside the `useMemo` that builds `inputs`, around line 161):

```typescript
        ddtlDrawAssumption,
        ddtlDrawQuarter,
        ddtlDrawPercent,
```

And add them to the dependency array of that `useMemo`.

Also add to the `userAssumptions` memo (around line 194):

```typescript
        ddtlDrawAssumption,
        ddtlDrawQuarter,
        ddtlDrawPercent,
```

- [ ] **Step 2: Pass portfolio info and DDTL props to FeeAssumptions**

Find where `<FeeAssumptions` is rendered in ProjectionModel.tsx and add the new props:

```tsx
<FeeAssumptions
  // ... existing props ...
  portfolioInfo={portfolioInfo}
  ddtlDrawAssumption={ddtlDrawAssumption}
  onDdtlDrawAssumptionChange={setDdtlDrawAssumption}
  ddtlDrawQuarter={ddtlDrawQuarter}
  onDdtlDrawQuarterChange={setDdtlDrawQuarter}
  ddtlDrawPercent={ddtlDrawPercent}
  onDdtlDrawPercentChange={setDdtlDrawPercent}
/>
```

- [ ] **Step 3: Update FeeAssumptions component**

In `web/app/clo/waterfall/FeeAssumptions.tsx`, add the new props to the interface and render the portfolio info lines and DDTL controls at the bottom of the `{open && ...}` block, after the existing grid:

Add to the props type:

```typescript
  portfolioInfo: {
    fixedRateCount: number;
    fixedRatePar: number;
    fixedRatePct: number;
    ddtlCount: number;
    ddtlPar: number;
    hasDdtls: boolean;
    hasFixedRate: boolean;
  };
  ddtlDrawAssumption: 'draw_at_deadline' | 'never_draw' | 'custom_quarter';
  onDdtlDrawAssumptionChange: (v: 'draw_at_deadline' | 'never_draw' | 'custom_quarter') => void;
  ddtlDrawQuarter: number;
  onDdtlDrawQuarterChange: (v: number) => void;
  ddtlDrawPercent: number;
  onDdtlDrawPercentChange: (v: number) => void;
```

Add after the closing `</div>` of the grid (before the closing `</div>` of the `{open && ...}` block):

```tsx
          {/* Portfolio composition info */}
          {(portfolioInfo.hasFixedRate || portfolioInfo.hasDdtls) && (
            <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.6rem", background: "var(--color-surface-alt, #f8f9fa)", borderRadius: "var(--radius-sm)", fontSize: "0.68rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              {portfolioInfo.hasFixedRate && (
                <div>{portfolioInfo.fixedRateCount} fixed-rate position{portfolioInfo.fixedRateCount !== 1 ? "s" : ""} ({portfolioInfo.fixedRatePct.toFixed(1)}% of par) — coupon unaffected by base rate changes. Quarterly accrual assumed.</div>
              )}
              {portfolioInfo.hasDdtls && (
                <div style={{ marginTop: portfolioInfo.hasFixedRate ? "0.3rem" : 0 }}>
                  {portfolioInfo.ddtlCount} unfunded DDTL{portfolioInfo.ddtlCount !== 1 ? "s" : ""} ({"\u20AC"}{(portfolioInfo.ddtlPar / 1000).toFixed(0)}K) — no interest until drawn.
                </div>
              )}
            </div>
          )}
          {/* DDTL controls — only shown when DDTLs exist */}
          {portfolioInfo.hasDdtls && (
            <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
              <div>
                <label style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>DDTL Draw Assumption</label>
                <select
                  value={ddtlDrawAssumption}
                  onChange={(e) => onDdtlDrawAssumptionChange(e.target.value as 'draw_at_deadline' | 'never_draw' | 'custom_quarter')}
                  style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", padding: "0.3rem 0.5rem", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", color: "var(--color-text)", width: "100%" }}
                >
                  <option value="draw_at_deadline">Draw at Q4 (1 year)</option>
                  <option value="never_draw">Never draw (expires Q1)</option>
                  <option value="custom_quarter">Custom quarter</option>
                </select>
                <div style={{ fontSize: "0.62rem", color: "var(--color-text-muted)", marginTop: "0.2rem", lineHeight: 1.4, opacity: 0.8 }}>
                  When unfunded DDTLs convert to funded loans
                </div>
              </div>
              {ddtlDrawAssumption === "custom_quarter" && (
                <>
                  <SliderInput label="Draw Quarter" value={ddtlDrawQuarter} onChange={onDdtlDrawQuarterChange} min={1} max={20} step={1} suffix="" hint="Quarter from projection start when DDTLs are drawn" />
                  <SliderInput label="Draw %" value={ddtlDrawPercent} onChange={onDdtlDrawPercentChange} min={0} max={100} step={10} suffix="% of commitment" hint="Percentage of DDTL commitment that is drawn (remainder expires)" />
                </>
              )}
            </div>
          )}
```

- [ ] **Step 4: Update ModelAssumptions register**

In `web/app/clo/waterfall/ModelAssumptions.tsx`, update the "Interest Rates" domain to add the fixed-rate assumption, and add a DDTL entry:

Add to the "Interest Rates" `items` array:

```typescript
      { label: "Fixed-rate bonds accrue quarterly", detail: "All fixed-rate positions accrue interest as annual coupon / 4, regardless of actual payment frequency. Some bonds pay semi-annually — annual income is correct but intra-year timing may differ slightly.", impact: "low" },
```

Add to the "Deal Structure" `items` array:

```typescript
      { label: "DDTL draw is a single event", detail: "Unfunded DDTLs draw fully (or at the user-specified percentage) in a single quarter. Real DDTLs may draw in tranches over time. Commitment fees on unfunded amounts are not modeled (~€850/yr for current portfolio).", impact: "low" },
```

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run lib/clo/__tests__/`

Expected: All tests pass including the new fixed-rate and DDTL tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/solal/Documents/GitHub/funzies && git add web/app/clo/waterfall/FeeAssumptions.tsx web/app/clo/waterfall/ModelAssumptions.tsx web/app/clo/waterfall/ProjectionModel.tsx && git commit -m "feat(clo): UI for fixed-rate info and DDTL draw assumptions"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run the full test suite one more time**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx vitest run`

Expected: All tests pass. No regressions.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit any remaining fixes**

If any tests or type checks failed, fix and commit.
