# Fixed-Rate & DDTL Handling in CLO Projection Engine

## Problem

The projection engine treats all collateral positions as floating-rate fully-funded loans. This produces two errors:

1. **Fixed-rate bonds** (9 positions, ~5% of par): The engine computes interest as `EURIBOR + spread`, adding base rate on top of a fixed coupon. An 8% fixed bond at EURIBOR 2.5% gets modeled as earning 10.5% instead of 8%. Fixed-rate income also incorrectly responds to base rate slider changes.

2. **DDTLs** (2 positions, €565K, 0.13% of par): Unfunded commitments earn zero interest until drawn, but the engine accrues interest at WAC spread on their full commitment par as if they were funded floating-rate loans.

## Design

### Part 1: Fixed-Rate Loans

#### Data Model Changes

`ResolvedLoan` (resolver-types.ts) and `LoanInput` (projection.ts) gain:

```typescript
isFixedRate: boolean       // default false
fixedCouponPct: number     // e.g. 8.0 for 8%. Only meaningful when isFixedRate=true
```

`LoanState` (internal to projection.ts) gains the same two fields.

#### Resolver Logic (resolver.ts ~line 550)

When mapping holdings to `ResolvedLoan`:

- If `h.isFixedRate === true`:
  - Set `isFixedRate: true`
  - Set `fixedCouponPct` from `h.allInRate` (already extracted per holding)
  - If `h.allInRate` is null, fall back to `h.spreadBps / 100` (some reports encode fixed coupons in the spread column as a percentage)
  - If both are null, fall back to `wacSpreadBps / 100` and emit a resolution warning
  - Set `spreadBps: 0` (unused for fixed-rate, but keeps the field non-null)
- Otherwise: existing logic unchanged

#### Projection Engine (projection.ts ~line 361)

Interest calculation branches on loan type:

```typescript
for (let i = 0; i < loanStates.length; i++) {
  const loan = loanStates[i];
  const loanBegPar = loanBeginningPar[i];
  if (loan.isFixedRate) {
    interestCollected += loanBegPar * loan.fixedCouponPct / 100 / 4;
  } else {
    interestCollected += loanBegPar * (flooredBaseRate + loan.spreadBps / 100) / 100 / 4;
  }
}
```

**Unit verification:** The floating branch computes `par * (percentageSum) / 100 / 4` where `flooredBaseRate` is in percentage terms (e.g. 2.5 for 2.5%) and `spreadBps / 100` converts basis points to percentage (e.g. 375 -> 3.75). The outer `/100` converts the percentage to a decimal. The fixed branch follows the same pattern: `fixedCouponPct` is in percentage terms (e.g. 8.0 for 8%), so `par * 8.0 / 100 / 4` produces the correct quarterly accrual. Both branches use identical unit conventions.

#### Defaults & Prepayments

Fixed-rate loans are subject to defaults and prepayments identically to floating-rate loans. Only interest calculation differs.

#### Assumption: Quarterly Accrual

All loans (fixed and floating) accrue interest quarterly. Some fixed-rate bonds in the portfolio pay semi-annually (e.g. 888 Acquisitions, CAB Biogrp). The annual income is correct; only intra-year timing differs. This is immaterial given the portfolio composition and the quarterly granularity of the waterfall engine. Documented and flagged in the UI.

---

### Part 2: DDTLs

#### What DDTLs Are

A Delayed Draw Term Loan is an unfunded commitment. The CLO committed capital at acquisition. The borrower draws against it once (partially or fully) by a contractual deadline, at which point it converts to a funded term loan earning its spread over EURIBOR. If undrawn by the deadline, the commitment expires and par disappears. DDTLs are not revolvers — they cannot be repaid and redrawn.

There is no cash movement at draw. The commitment was funded at acquisition. The CLO's principal account is not impacted.

#### Current Portfolio

| Obligor | DDTL ID | Commitment | Parent Facility | Parent Spread | Parent Par |
|---|---|---|---|---|---|
| Acropole Holding SAS | LX266912 | €392,308 | LX266356 (Facility B) | 350 bps | €1,647,692 |
| Admiral Bidco GmbH | LX261236 | €172,811 | LX261234 (Facility B) | 425 bps | €2,131,336 |

#### Data Model Changes

`ResolvedLoan` and `LoanInput` gain:

```typescript
isDelayedDraw: boolean         // default false
ddtlSpreadBps: number | null   // spread from parent facility, applied at draw
drawQuarter: number | null     // quarter in which the DDTL converts to funded
```

`LoanState` gains the same fields.

#### User Assumptions (build-projection-inputs.ts)

New fields on `UserAssumptions`:

```typescript
ddtlDrawAssumption: 'draw_at_deadline' | 'never_draw' | 'custom_quarter'
ddtlDrawQuarter: number   // default 4. Only used if 'custom_quarter'
ddtlDrawPercent: number   // default 100. What % of commitment is drawn
```

Defaults added to `defaults.ts`:
- `ddtlDrawAssumption`: `'draw_at_deadline'`
- `ddtlDrawQuarter`: `4`
- `ddtlDrawPercent`: `100`

#### Resolver Logic (resolver.ts ~line 550)

When `h.isDelayedDraw === true`:

1. **Find parent facility:** Match by `obligorName` among non-DDTL, non-defaulted holdings with `parBalance > 0`.
   - Primary sort: largest `parBalance`
   - Tiebreaker: closest `maturityDate` to the DDTL's maturity (when multiple funded facilities exist for the same obligor)
   - Log a warning when >1 candidate facility exists for an obligor (ambiguous match)
2. Set `ddtlSpreadBps` = parent facility's `spreadBps`. If no parent found, fall back to `wacSpreadBps` and emit a resolution warning.
3. Set `drawQuarter` from user assumptions (mapped via `buildFromResolved`)
4. Set `spreadBps: 0`, `isFixedRate: false`

#### Projection Engine Logic

**"never_draw" handling:** If the user selects `never_draw`, DDTLs are removed from the loan list at resolution time (before entering the engine). Their par exits the portfolio at Q1 — no zombie par carried through 40+ quarters. The resolver filters them out and reduces `impliedOcAdjustment` by their par (since the unfunded deduction no longer applies to a position that doesn't exist).

**"draw_at_deadline" / "custom_quarter" handling:** DDTLs enter the engine as `LoanState` entries with `isDelayedDraw: true`. Per-quarter logic:

```
Before drawQuarter:
  - Zero interest (skip in interest collection loop)
  - Skip default and prepayment rolls
  - Position exists at commitment par but is inert

At drawQuarter:
  - Apply ddtlDrawPercent: fundedPar = par * drawPercent / 100
  - Undrawn remainder expires: reduce par, not a loss event (no recovery pipeline entry)
  - Set spreadBps = ddtlSpreadBps
  - Set isDelayedDraw = false
  - From this quarter forward: normal floating-rate loan treatment
```

#### OC Numerator — Dynamic Adjustment

`impliedOcAdjustment` is static (computed once at resolution from the trustee report gap analysis). It includes the DDTL unfunded deduction among other adjustments. If we leave it static, the OC test carries a stale deduction after DDTLs draw or expire.

**Fix:** The resolver computes a separate `ddtlUnfundedPar` value (sum of DDTL commitment par) and subtracts it from `impliedOcAdjustment` so it's not double-counted. The engine then manages DDTL OC impact dynamically:

- Before draw: deduct DDTL unfunded par from OC numerator
- At draw: deduction drops to zero (or to the undrawn/expired portion if `ddtlDrawPercent < 100`), funded par enters the numerator as a normal loan
- "never_draw": no DDTLs in the engine, `impliedOcAdjustment` already reduced — zero stale deduction

New fields on `ResolvedDealData` / `ProjectionInputs`:

```typescript
ddtlUnfundedPar: number  // total DDTL commitment par (for dynamic OC deduction)
```

The projection loop's OC numerator calculation adds a dynamic DDTL term:

```
// Compute current unfunded DDTL par (sum of par for loans still marked isDelayedDraw)
const currentDdtlUnfundedPar = loanStates
  .filter(l => l.isDelayedDraw)
  .reduce((s, l) => s + l.survivingPar, 0);

ocNumerator = endingPar + principalCash + recoveryCredit
  + impliedOcAdjustment   // static residual (DDTL portion already removed)
  - currentDdtlUnfundedPar // dynamic: shrinks at draw, zero if never_draw
  - cccExcessHaircut
```

---

### Part 3: UI Transparency

#### Fixed-Rate Indicator

When the portfolio contains fixed-rate positions, display an info line in the assumptions panel:

> "9 fixed-rate positions (X% of par) — coupon unaffected by base rate changes. Quarterly accrual assumed."

No toggle needed. Informational only.

#### DDTL Controls

Visible only when DDTLs exist in the portfolio. A dropdown in the assumptions panel:

- **Draw at deadline** (default): DDTLs convert to funded loans at Q4
- **Never draw**: Commitments expire, par removed at Q1
- **Custom quarter**: Text input for draw quarter + draw percentage slider (default 100%)

Shows total unfunded commitment amount.

#### Model Assumptions Note

Both the quarterly-accrual assumption and the DDTL parent-matching heuristic ("largest par, closest maturity") should be documented in the model methodology section when it exists.

---

### Not Modeled

- **Commitment fees** (~€850/yr on current DDTLs — immaterial)
- **Partial multi-quarter draws** (single draw event assumed)
- **Draw deadline extraction** (not in trustee reports; user configurable)
- **Semi-annual payment frequency** for fixed-rate bonds (quarterly accrual assumed; annual income correct)

---

### Files Changed

| File | Change |
|---|---|
| `resolver-types.ts` | Add `isFixedRate`, `fixedCouponPct`, `isDelayedDraw`, `ddtlSpreadBps`, `drawQuarter` to `ResolvedLoan`. Add `ddtlUnfundedPar` to `ResolvedDealData`. |
| `projection.ts` | Add fields to `LoanInput` and `LoanState`. Branch in interest calc for fixed-rate. DDTL inert/draw/expire logic. Dynamic OC deduction for unfunded DDTLs. |
| `resolver.ts` | Fixed-rate detection + `allInRate` mapping. DDTL parent facility matching with tiebreaker. Compute `ddtlUnfundedPar` and adjust `impliedOcAdjustment`. |
| `build-projection-inputs.ts` | New `UserAssumptions` fields for DDTL. Pass through `ddtlUnfundedPar`. Map draw assumptions to per-loan `drawQuarter`. |
| `defaults.ts` | Default values for DDTL assumptions. |
| `FeeAssumptions.tsx` | Fixed-rate info line. DDTL dropdown + draw quarter/percent inputs. |
