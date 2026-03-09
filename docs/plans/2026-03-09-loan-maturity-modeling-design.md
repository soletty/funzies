# Loan Maturity Modeling in CLO Projection Engine

## Problem

The projection engine models principal outflows via CDR (defaults) and CPR (prepayments) but does not model scheduled loan maturities. Individual loans in the collateral pool have their own maturity dates — when a loan matures, its par returns as principal proceeds. The current model keeps matured loans in the pool indefinitely until the CLO itself matures, overstating par balance, interest income, and distorting OC test calculations in later periods.

## Approach

Use actual loan-level maturity data from the extracted holdings (already in `clo_holdings` table with `maturity_date` and `par_balance` per loan). Pass a lightweight maturity schedule to the projection engine. Each quarter, loans that have matured exit the performing pool.

## Design

### 1. Projection Engine (`web/lib/clo/projection.ts`)

**New input field:**
```ts
interface ProjectionInputs {
  // ... existing fields ...
  maturitySchedule: { parBalance: number; maturityDate: string }[];
}
```

**Quarterly loop change** — new step between prepayments (step 2) and recoveries (step 3):

```
Step 2b: Scheduled Maturities
- Filter maturitySchedule for loans maturing in this quarter
- Sum their par as `scheduledMaturities`
- Reduce currentPar by scheduledMaturities
- scheduledMaturities flows to principal waterfall (same as prepayments)
- During RP: reinvested. Post-RP: flows to principal paydown.
```

Matured loans no longer generate interest (they're removed from `currentPar` which is the basis for interest calculation).

**Important**: maturities interact with defaults — a loan that has already defaulted should not also mature. The model handles this implicitly because defaults reduce `currentPar` proportionally. Since we track maturity schedule by original par amounts, we need to scale maturity amounts by the survival rate (1 - cumulative default rate) to avoid double-counting.

**New PeriodResult field:**
```ts
interface PeriodResult {
  // ... existing fields ...
  scheduledMaturities: number;
}
```

### 2. Data Plumbing

**`web/app/clo/waterfall/page.tsx`:**
- Fetch holdings via `getHoldings(reportPeriod.id)` (already exists in `access.ts`)
- Pass holdings to `ProjectionModel` component

**`web/app/clo/waterfall/ProjectionModel.tsx`:**
- Accept `holdings: CloHolding[]` prop
- Extract maturity schedule: `holdings.filter(h => h.maturityDate && h.parBalance).map(h => ({ parBalance: h.parBalance!, maturityDate: h.maturityDate! }))`
- Pass to `runProjection` as `maturitySchedule`

### 3. UI Updates

**Cash flow table:** Add "Maturities" column between "Prepays" and "Recoveries".

**Model assumptions:** Remove the "No scheduled amortization" assumption. Replace with: "Loan maturities use the current portfolio's maturity schedule. Loans that default before maturity are not double-counted."

### 4. Test Suite

No test framework exists yet. Add vitest as a dev dependency and create tests for the projection engine.

**Test file:** `web/lib/clo/__tests__/projection.test.ts`

**Test cases:**
1. Basic projection without maturities (backward compatibility — empty maturitySchedule)
2. Loan maturing mid-projection reduces par and stops earning interest
3. Maturities during RP are reinvested
4. Maturities post-RP flow to principal waterfall (pay down debt)
5. All loans maturing before CLO maturity — pool depletes early
6. Maturity amounts scaled by survival rate (no double-count with defaults)
7. IRR calculation sanity checks
8. validateInputs function tests

## Files Changed

| File | Change |
|------|--------|
| `web/lib/clo/projection.ts` | Add maturitySchedule input, maturity step in loop, PeriodResult field |
| `web/app/clo/waterfall/page.tsx` | Fetch holdings, pass to ProjectionModel |
| `web/app/clo/waterfall/ProjectionModel.tsx` | Accept holdings prop, build maturity schedule, add table column |
| `web/package.json` | Add vitest dev dependency |
| `web/lib/clo/__tests__/projection.test.ts` | New test file |
