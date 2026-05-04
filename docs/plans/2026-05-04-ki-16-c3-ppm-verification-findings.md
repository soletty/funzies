# KI-16 — C3 PPM Verification Findings

**Source:** Ares CLO XV Final Offering Circular dated 14 December 2021 (`~/Downloads/ARESXV_CDSDF_260401/Ares CLO XV - Final Offering Circular dated 14 December 2021.pdf`).

**Note on `ppm.json:415` page reference drift:** the extraction notes claimed Condition 1 spans PDF pp. 390-397. Verified false against this PDF — those pages contain Subscription / ERISA boilerplate. Condition 1 Index of Defined Terms anchor is on OC printed page 151 (per the OC's own Index of Defined Terms at line 24994 of the extracted text); "Senior Expenses Cap" verbatim text is at OC printed pp. 150-151. PDF page offset varies; cite the OC printed page numbers as the canonical reference.

---

## Verbatim Quote — "Senior Expenses Cap" definition

OC printed page 150-151 (extracted text /tmp/oc.txt:10234-10254):

> "**Senior Expenses Cap**" means, in respect of each Payment Date, the sum of:
>
> (a) **€300,000 per annum** (pro-rated for the Due Period for the related Payment Date on the basis of (x) in respect of the first Payment Date, a 360 day year and the actual number of days elapsed in the related Due Period and (y) in respect of any other Payment Date, a 360 day year comprised of twelve 30-day months); and
>
> (b) **0.025 per cent. per annum** (pro-rated for the Due Period for the related Payment Date on the basis of (x) in respect of the first Payment Date, a 360 day year and the actual number of days elapsed in the related Due Period and (y) in respect of any other Payment Date, a 360 day year and the actual number of days elapsed in such Due Period) **of the Collateral Principal Amount** as at the **Determination Date immediately preceding the Payment Date**,
>
> provided however that (i) amounts in respect of any applicable VAT that are payable in respect of expenses expressed to be subject to the Senior Expenses Cap shall count towards the Senior Expenses Cap; and (ii) **if the amount of Trustee Fees and Expenses and Administrative Expenses paid on each of the three immediately preceding Payment Dates** or, if a Frequency Switch Event has occurred, the immediately preceding Payment Date and in either case, during the related Due Period(s) (including the Due Period relating to the current Payment Date) is less than the stated Senior Expenses Cap, the amount of each such excess (if any) **will be added to the Senior Expenses Cap with respect to the then current Payment Date**. For the avoidance of doubt, any such excess (if any) may not at any time result in an increase of the Senior Expenses Cap on a per annum basis.

## Verbatim Quote — Step (B) Trustee Fees & Expenses (Pre-Acceleration POP)

OC printed page 159-160 (/tmp/oc.txt:10817-10823):

> (B) to the payment of accrued and unpaid Trustee Fees and Expenses, **up to an amount equal to the sum of the Senior Expenses Cap in respect of the related Due Period and the Balance of the Expense Reserve Account** as at the date of transfer of any amounts from the Expense Reserve Account pursuant to paragraph (4) of Condition 3(j)(x) (Expense Reserve Account) (after taking into account all other payments to be made out of the Expense Reserve Account on such date) **provided that, following the occurrence of an Event of Default, the Senior Expenses Cap shall not apply**;

## Verbatim Quote — Step (C) Administrative Expenses (Pre-Acceleration POP)

OC printed page 160 (/tmp/oc.txt:10825-10831):

> (C) to the payment of Administrative Expenses in the priority stated in the definition thereof, **up to an amount equal to the sum of the Senior Expenses Cap** in respect of the related Due Period and the Balance of the Expense Reserve Account as at the date of transfer of any amounts from the Expense Reserve Account pursuant to paragraph (4) of Condition 3(j)(x) (Expense Reserve Account) (after taking into account all other payments to be made out of the Expense Reserve Account on such date) **less any amounts paid pursuant to paragraph (B) above** provided that, following the occurrence of an Event of Default, the Senior Expenses Cap shall not apply;

## Verbatim Quote — Step (Y) Trustee Overflow (Pre-Acceleration POP)

OC printed page 161 (/tmp/oc.txt:10966-10967):

> (Y) to the payment of Trustee Fees and Expenses (if any) **not paid by reason of the Senior Expenses Cap**;

## Verbatim Quote — Step (Z) Administrative Expenses Overflow (Pre-Acceleration POP)

OC printed page 161 (/tmp/oc.txt:10969-10970):

> (Z) to the payment of Administrative Expenses (if any) **not paid by reason of the Senior Expenses Cap, in relation to each item thereof in the order of priority stated in the definition thereof**;

---

## Verdicts

### Assumption 1 — 20 bps default cap value: **CONTRADICTED**

Engine fallback at `build-projection-inputs.ts:165` is `seniorExpensesCapBps: 20`. PPM specifies a structured cap that is the **sum** of:

- (a) **€300,000 per annum** absolute floor (pro-rated 30/360 ongoing PDs, Actual/360 first PD)
- (b) **0.025% per annum** (= **2.5 bps**) of **Collateral Principal Amount** at the Determination Date (Actual/360 all PDs)

The single-scalar `seniorExpensesCapBps: 20` representation cannot encode the cap shape: wrong by 8× on the bps component (2.5 vs 20), missing the €300K fixed component entirely, and structurally cannot represent the carryforward.

### Assumption 2 — `max(2× observed, 20 bps)` heuristic: **CONTRADICTED**

Engine heuristic at `build-projection-inputs.ts:303`: `base.seniorExpensesCapBps = Math.max(observedRateBps * 2, 20)`. PPM specifies an absolute structured value, not a function of observed expenses. The "2×" buffer has no PPM grounding. Per project rule (silent fallbacks on missing computational extraction are bugs), the heuristic must be removed; the cap value must come from PPM extraction.

### Assumption 3 — Pro-rata Y/Z overflow allocation: **CONTRADICTED**

Engine at `projection.ts:3749-3757` uses pro-rata allocation. PPM Condition 3(c) lists (Y) and (Z) as sequential consecutive priority steps in the POP. Standard POP semantics: each step is paid in full from residual before the next step receives anything. Step (Z) makes no joint-allocation reference to step (Y). Sequential Y-first is the PPM-correct rule.

### Assumption 4 — Pro-rata B/C in-cap allocation: **CONTRADICTED**

Engine at `projection.ts:2817-2819` uses `cappedRatio = cappedPaid / cappedRequested` to split the capped amount pro-rata between trustee (B) and admin (C). PPM Condition 3(c) clause (C) explicitly states the admin amount payable is bounded by "the sum of the Senior Expenses Cap... **less any amounts paid pursuant to paragraph (B) above**." This is unambiguous sequential B-first: trustee fees consume cap headroom first, admin gets the remainder. Pro-rata is contradicted by explicit PPM language.

---

## Out-of-scope findings (file new KIs per Q3=A)

The PPM read surfaced five additional defects beyond the four KI-16 assumptions. Each must be filed in this PR with a tentative ledger entry + marker test (per project rule "If you discover a candidate KI mid-task, file it before continuing"):

### NEW KI — Senior Expenses Cap base = CPA, not APB (parallel to KI-12a)

PPM cap component (b) is "0.025% per annum... of the **Collateral Principal Amount** as at the **Determination Date immediately preceding the Payment Date**." Engine's cap construction at `projection.ts:2790` uses `beginningPar` (Aggregate Principal Balance, derived from the engine's pool snapshot, not the prior-period CPA). KI-12a established CPA ≠ APB on Euro XV by ~€22.35M; the cap component is similarly subject to this mismatch. Magnitude: 2.5 bps × €22.35M × 91/360 ≈ €1.4K per quarter on Euro XV.

### NEW KI — €300,000/yr fixed cap component unmodeled

In-scope for KI-16 closure. The fixed component is part of the cap formula; cap value cannot be PPM-correct without modeling it. New `seniorExpensesCapAbsoluteFloorPerYear` field on `ProjectionInputs`; engine cap construction adds this component (pro-rated by `dayFracActual`).

### NEW KI — Senior Expenses Cap 3-period carryforward unmodeled

PPM specifies that unused cap headroom from the three immediately preceding Payment Dates (or the immediately preceding PD post-Frequency-Switch-Event) carries forward and adds to the current PD's cap. Engine has no representation of multi-period cap state. Distinct from Expense Reserve Account (Condition 3(j)(x)(4)) which is already modeled. Latent on Euro XV today (cap doesn't bite); material on stress scenarios.

### NEW KI — Mixed day-count on cap components (parallel to KI-12b)

Cap component (a) €300K p.a. uses 30/360 for ongoing PDs (twelve 30-day months) and Actual/360 for the first PD. Component (b) bps × CPA uses Actual/360 for all PDs. Engine uses uniform Actual/360. Material drift only when component (a) is modeled and a non-90-day quarter accrues.

### NEW KI — VAT on capped expenses counts toward cap

PPM proviso (i): "amounts in respect of any applicable VAT that are payable in respect of expenses expressed to be subject to the Senior Expenses Cap shall count towards the Senior Expenses Cap." Engine doesn't model VAT. Latent on Euro XV (no VAT line). Material on deals carrying VAT-bearing trustee/admin fees.

---

## Implementation routing

Per Q1=C decision and the verdicts above, the closure work for KI-16 in this PR is:

1. **Plumbing** (six-file chain per plan v4 Step 3.2): `ppm.json` → `types.ts` (PpmJson) → `ppm-mapper.ts` → `extraction.ts` (ExtractedConstraints) → `resolver-types.ts` (`ResolvedSeniorExpensesCap`) → `resolver.ts` (`resolveSeniorExpensesCap` with blocking warning).
2. **`ResolvedSeniorExpensesCap` interface** per architect 1's design, extended for the PPM realities: add `absoluteFloorEurPerYear: number | null` (cap component (a)). The five-axis structure (`bpsPerYear`, `capBase`, `capPeriod`, `allocationWithinCap`, `overflowAllocation`) accommodates the four verdicts + flagged future work for the new-KI mechanics (carryforward, VAT, day-count).
3. **`ProjectionInputs` extension**: add `seniorExpensesCapAbsoluteFloorPerYear?: number` so the engine consumes the PPM-correct two-component cap. `DEFAULT_ASSUMPTIONS` updates: `seniorExpensesCapBps: 2.5`, `seniorExpensesCapAbsoluteFloorPerYear: 300000`.
4. **Engine amendments**: cap construction at `projection.ts:2790-2795` adds the absolute-floor component; B/C in-cap allocation at `projection.ts:2817-2819` becomes sequential B-first; Y/Z overflow at `projection.ts:3749-3757` becomes sequential Y-first.
5. **Markers**: per Task 2 — `failsWithMagnitude` for each contradicted assumption with constructed scenarios. Test 2's ratio assertion (lines 73-76 of `c3-senior-expenses-cap.test.ts`) splits per Q2=C.
6. **New KI ledger entries**: tentative entries for CPA-vs-APB, carryforward, mixed day-count, VAT.

Euro XV invariance check: under the new structured cap with `seniorExpensesCapBps: 2.5, absoluteFloorPerYear: 300000`, the per-quarter cap on Euro XV beginPar ≈ €493M is 2.5 bps × €493M × 91/360 + €300K × 91/360 = €31,170 + €75,833 = ~€107K. Euro XV observed combined Q1 trustee+admin ≈ €64,652 (5.24 bps annualized). Observed < cap → cap doesn't bite on Euro XV. N1 harness must remain bit-identical.
