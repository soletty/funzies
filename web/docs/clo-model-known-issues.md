# CLO Projection Model — Known Issues Ledger

Every PPM mechanic the model doesn't currently simulate, or simulates with documented drift, is listed below. This ledger is the reference for what the model *deliberately does not model* and what drift you should expect when comparing our engine to trustee-reported data.

**Editorial principle (2026-04-30, after correctness-first audit):** This is a financial-model ledger. Every claim about current engine behavior must be traceable to a specific `file:line` that has been read. Magnitudes that are not pinned by an active `failsWithMagnitude` marker are tagged "tentative" or "historical" — never asserted as live drift. **Time and effort estimates are not part of any entry**: the only relevant axes for prioritization are correctness leverage (how many wrong numbers a fix corrects), how silent the current bug is (silent worse than loud), and how downstream invariants depend on it. Whether a fix takes an hour or a week is irrelevant to whether it should land before the next partner-facing number is shown.

Each entry carries:

- **PPM reference** — clause / section / page where the mechanic is specified.
- **Current engine behavior** — exactly what the code does today, with `file:line`.
- **PPM-correct behavior** — what the model would do if the gap were closed.
- **Quantitative magnitude** — pinned euros / bps / pp where a marker exists; tentative or historical context where not.
- **Deferral rationale** — why it's in the ledger rather than fixed (intent, dependency, or "latent — not yet activated by available data").
- **Path to close** — specific code changes + corresponding test. No effort estimate.
- **Test** — forward-pointer(s) to the `failsWithMagnitude` marker(s) asserting the current documented magnitude. Ledger ↔ test is a bijection: when a fix lands, the marker must be removed AND this entry moved to Closed. New KI entries SHIP with their marker test in the same change.

Updated per sprint. Entries are closed (marked `[CLOSED]`) when the corresponding fix ships and is verified in the N1 harness.

---

## Index

Categorized so a partner reading cold can separate "what's still wrong" from "what we decided." Section membership is authoritative; the numerical KI order is historical (sprint-chronological).

### Open — currently wrong, path to close documented
- [KI-08 — `trusteeFeesPaid` bundled steps B+C (PARTIAL: pre-fill D3 + cap mechanics C3 shipped; KI-16 PPM verifications remain)](#ki-08)
- [KI-12a — Senior / sub management fee base discrepancy](#ki-12a)
- [KI-16 — KI-08 closure assumptions pending PPM verification](#ki-16)
- [KI-17 — wacSpreadBps methodology gap (±30 bps drift vs trustee)](#ki-17)
- [KI-18 — pctCccAndBelow coarse-bucket collapse (±3pp vs trustee per-agency max)](#ki-18)
- [KI-20 — D2 legacy escape-hatch on 6 test-factory sites](#ki-20)
- [KI-21 — Parallel implementations of same calculation (PARTIAL — Scope 1+2 closed; Scope 3 accel + T=0 remains)](#ki-21)
- [KI-23 — Industry taxonomy missing on BuyListItem + ResolvedLoan blocks industry-cap filtering](#ki-23)
- [KI-24 — E1 citation propagation coverage is partial (8 deferred paths)](#ki-24)
- [KI-27 — Pre-existing tranche `deferredInterestBalance` dropped at projection start](#ki-27)
- [KI-28 — Asset-side fixed-rate loans accrue on Actual/360 (mirrored tranche uses 30/360)](#ki-28)
- [KI-33 — Reinvestment loan synthesis assumes par-purchase (€1 diverted = €1 par)](#ki-33)
- [KI-34 — Non-call period not enforced; user-typed pre-NCP call dates pass through](#ki-34)
- [KI-35 — Partial DDTL draw silently discards the un-drawn commitment](#ki-35)
- [KI-40 — `diversionPct = 50%` silent fallback on extraction failure](#ki-40)
- [KI-42 — `failsWithMagnitude` discipline gap on day-count residuals (`adminFeesPaid`, `trusteeFeesPaid`)](#ki-42)
- [KI-43 — Forward-period EoD test uses literal `"Class A"` string match (regression of T=0 fix)](#ki-43)
- [KI-45 — `ProjectionModel.tsx` useMemo dep arrays missing fee-related state vars (engine runs stale on slider drag)](#ki-45)
- [KI-46 — `WaterfallVisualization.tsx` local `formatAmount` hardcodes `$` on EUR-denominated trustee amounts](#ki-46)
- [KI-47 — `ModelAssumptions.tsx` discloses model limitations that no longer apply (5 stale items: KI-01/08/09 closed; B2/B3 shipped)](#ki-47)
- [KI-49 — `stepTrace` emits requested fee amounts, not actually-paid, when interest is exhausted (sub mgmt + 6 senior expenses, normal mode only)](#ki-49)
- [KI-53 — `ppm-step-map.ts` docstring drift on closed buckets (bijection violation, same shape as KI-42)](#ki-53)

### Latent — currently inactive on Euro XV; emerges on portability or stress
*Distinct from "Deferred" (those are intentional design choices about mechanics that exist in the indenture but the model elects not to simulate). "Latent" entries are unmodeled or hardcoded paths whose current Euro XV magnitude happens to be zero, but which will produce wrong numbers the moment a deal hits the triggering condition (different deal structure, different PPM, non-zero balance, FX exposure, etc.). Treat each as a real bug whose materiality is data-dependent, not a deliberate scope decision.*

- [KI-26 — Reserve account opening balances dropped (Interest, Smoothing, Supplemental, Expense)](#ki-26)
- [KI-29 — Discount / long-dated obligation haircuts are static snapshots, not recomputed forward](#ki-29)
- [KI-30 — CCC bucket limit (7.5%) and CCC market-value (70%) hardcoded, never PPM-extracted](#ki-30)
- [KI-31 — Hedge cost bps never extracted; engine emits zero on every hedged deal](#ki-31)
- [KI-32 — Per-position agency recovery rates ignored for forward defaults (used only for pre-existing defaulted positions)](#ki-32)
- [KI-36 — Per-tranche `payment_frequency` and `day_count_convention` extracted but not consumed](#ki-36)
- [KI-37 — Loan-level `floorRate`, `pikAmount`, `creditWatch`, `isCovLite` extracted but unused by engine](#ki-37)
- [KI-38 — FX / multi-currency unmodeled; `native_currency` parsed and discarded](#ki-38)
- [KI-39 — Intex past-cashflows parser hardcoded for Euro XV's tranche structure](#ki-39)
- [KI-41 — `incentiveFeeHurdleIrr = 12%` silent fallback on extraction failure](#ki-41)
- [KI-48 — `period-trace-lines` amortising-tranche heuristic is described in a comment but never implemented](#ki-48)
- [KI-50 — `parseNumeric` strips commas without locale awareness — European-format numbers parse wrong](#ki-50)
- [KI-51 — `normalizeComplianceTestType` derives `isPassing` as `actual >= trigger` for all tests, including lower-is-better (WARF, WAL, concentration)](#ki-51)

### Deferred — intentionally not modeled, magnitude known
- [KI-02 — Step (D) Expense Reserve top-up](#ki-02)
- [KI-03 — Step (V) Effective Date Rating Event redemption](#ki-03)
- [KI-04 — Frequency Switch mid-projection cadence/rate switch (C4 Phase 3)](#ki-04)
- [KI-05 — Supplemental Reserve Account (step BB)](#ki-05)
- [KI-06 — Defaulted Hedge Termination (step AA)](#ki-06)
- [KI-07 — Class C/D/E/F current + deferred interest bundled in step map](#ki-07)
- [KI-15 — B2 accelerated-mode incentive fee hardcoded inactive](#ki-15)

### Cascades — residuals that close as upstream closes
- [KI-12b — Day-count precision active; six class-interest markers under harness period mismatch](#ki-12b)
- [KI-13 — Sub distribution cascade residual](#ki-13)
- [KI-14 — IC compositional parity at T=0 (cascade)](#ki-14)

### Design decisions — documented for audit clarity (not open issues)
- [KI-19 — NR positions proxied to Caa2 for WARF (Moody's convention)](#ki-19)

### Closed — fixes shipped, verification green
- [KI-01 — Step (A)(ii) Issuer Profit Amount **(CLOSED Sprint 4)**](#ki-01)
- [KI-09 — Step (A)(i) Issuer taxes **(CLOSED Sprint 3)**](#ki-09)
- [KI-10 — baseRate pre-fill gap **(CLOSED D3)**](#ki-10)
- [KI-11 — Senior / sub management fee rate pre-fill **(CLOSED D3; fee-base tracked as KI-12a)**](#ki-11)
- [KI-22 — Fixture-regeneration test was a spot-check for 20 days **(CLOSED Sprint 4)**](#ki-22)
- [KI-25 — UI back-derivation of engine values (PeriodTrace + bookValue) **(CLOSED 2026-04-29)**](#ki-25)
- [KI-52 — Forward-period EoD test principal-cash component hardcoded to 0 **(CLOSED 2026-04-23, reconstructed retroactively)**](#ki-52)

*KI-08 was previously listed under Closed with a "PARTIALLY CLOSED" annotation. The body of KI-08 explicitly states "remain OPEN (partial) until KI-16 resolves the three PPM verifications." That disposition is now reflected in the index — KI-08 sits under Open until KI-16 closes.*

*KI-44 (proposed during 2026-04-30 audit, not added): a candidate raised that `parse-collateral.ts:209-210` writes absolute `Market_Value` into the percent-shaped `current_price` column, with the bug masked on Euro XV by Asset Level enrichment. Verified not a bug. Two pieces of evidence: (i) `ENRICHMENT_COLUMNS` at `sdf/ingest.ts:450` lists only `current_price`, not `market_value` — Asset Level cannot overwrite `market_value`; (ii) every fixture row shows `marketValue == currentPrice` (e.g. 80.097, 99.823, 91.797) which is consistent only with `raw.Market_Value` being itself percent-shaped. If `raw.Market_Value` were absolute, the two columns would diverge after enrichment because only `current_price` gets overwritten. Conclusion: `raw.Market_Value` is percent-shaped despite the misleading column name; parser is correct; consumers are correct. Disposition: not added to ledger. A future verification against the SDF spec would close the question definitively.*

---

<a id="ki-01"></a>
### [KI-01] Step (A)(ii) Issuer Profit Amount — CLOSED (Sprint 4, 2026-04-23)

**PPM reference:** Condition 1 definitions, p.127. €250 per regular period deducted from interest proceeds between taxes (A.i) and trustee fees (B). €500 per period post-Frequency-Switch Event (handled by KI-04 when that closes).

**Pre-fix behavior:** Not modeled. `stepTrace.issuerProfit` emitted 0. Engine `subDistribution` over-stated by exactly €250/period on Euro XV because the waterfall's `availableInterest -=` chain skipped step (A.ii).

**Pre-fix quantitative magnitude:** €250/quarter = €1,000/year on Euro XV. Cumulative ~€10,000 over a 10-year projection — immaterial in isolation but material to KI-13a cascade cleanliness (it was the last non-day-count bucket feeding into the sub residual).

**Fix (Sprint 4):** `issuerProfitAmount` added to `ProjectionInputs` + `UserAssumptions` (absolute € per period, not bps). Engine deducts at PPM step (A.ii) position — after taxes at (A.i), before trustee at (B) — in both:
- **Normal mode** (`projection.ts`): added to `totalSeniorExpenses` for IC parity AND to the `availableInterest -=` chain for cash flow. The first fix without the second emits correctly on stepTrace but never removes the €250 from sub residual — caught by the KI-13a cascade probe before ship. See [KI-21](#ki-21) for the architectural tracking of the two-parallel-accumulator pattern.
- **Accelerated mode** (`runPostAccelerationWaterfall`): new `seniorExpenses.issuerProfit` field on the executor input + output, same priority position. PPM 10(b) preserves step ordering under acceleration.
- **T=0 initial state** (`initialState.icTests`): `issuerProfitAmountT0` added to the IC numerator deduction chain alongside taxes / admin / trustee / senior / hedge so compositional parity tracks the in-loop computation.

**Pre-fill:** `defaultsFromResolved` back-derives from `raw.waterfallSteps` step (A)(ii). Regex matches `"(A)(ii)"` or `"A.ii"` formats. Sanity bound: 0 < amount < €1,000 (covers €250 regular + €500 post-Frequency-Switch). Euro XV Q1 observed: €250.00 exactly.

**Cascade re-baseline:** KI-13a expected drift −€50,742.24 → −€50,992.24 (Δ = −€250 exact, matches engine emission to the cent — no day-count residual since amount is fixed absolute, not accrued).

**Cascade sub-tolerance verification (KI-IC-AB/C/D + KI-13b):** The €250 deduction flows into the IC numerator (`totalSeniorExpenses`) as well as cash flow. Measured Δ_IC per class from T=0 initialState probe: Class C = −0.00828 pp (denom ≈ €3.02M), Class D = −0.00722 pp (denom ≈ €3.46M). Class A/B denom is smaller (≈ €2.68M interest due), so |Δ_pp| ≈ −250 / 2,681,150 × 100 = −0.0093 pp. All three classes shift under the 0.05 pp tolerance → no KI-IC re-baseline required. KI-13b production-path markers use the same math — unchanged.

**Verification:** Engine emits €250.00/period, ties to trustee €250.00 to the cent. N1 harness `issuerProfit` bucket tolerance tightened from Infinity → €1 (now the tightest tolerance in the step table). 558/558 tests green post-close.

**Tests:** `n1-correctness.test.ts > "KI-01 CLOSED: engine emits €250 issuer profit, ties to trustee to the cent"`. Shipped as a closed-KI positive-enforcement assertion (`row.projected ≈ 250, |delta| < 1`) replacing the prior informational "engine emits 0; trustee collected €250" marker.

---

<a id="ki-02"></a>
### [KI-02] Step (D) Expense Reserve top-up

**PPM reference:** Condition 3.3(d).
**Current engine behavior:** Not modeled. No `stepTrace.expenseReserve` field exists on `PeriodStepTrace`; the N1 harness mapper hardcodes the bucket to 0 (`backtest-harness.ts:285`). `ppm-step-map.ts:106` documents the bucket as "NOT EMITTED by engine (KI-02)".
**PPM-correct behavior:** CM-discretionary deposit during Reinvestment Period to maintain senior-expense headroom.
**Quantitative magnitude:** €0 in Euro XV Q1 2026 waterfall. Typically €0 in steady-state; activates only when senior-expense accruals are building toward the cap.
**Deferral rationale:** Discretionary and rarely activated. Our observed data has zero Q1 expense-reserve deposit across Euro XV's 17-period Intex history.
**Path to close:** Add `expenseReserveDepositBps` user input; engine routes to reserve account. Activates only when a deal exercises step (D); until then the engine emits 0 correctly.
**Test:** No active marker — both engine and trustee emit 0 on Euro XV. The `expenseReserve` row in the N1 harness table (Infinity tolerance) is the passive audit channel; a non-zero trustee value on a future deal would surface via that row.

---

<a id="ki-03"></a>
### [KI-03] Step (V) Effective Date Rating Event redemption

**PPM reference:** Condition 7.3, p.180.
**Current engine behavior:** Not modeled; engine has no rating-downgrade detection. No `stepTrace.effectiveDateRating` field exists; the N1 harness mapper hardcodes the bucket to 0 (`backtest-harness.ts:286`). `ppm-step-map.ts:124` documents the bucket as "NOT EMITTED by engine (KI-03)".
**PPM-correct behavior:** Triggered by rating agency downgrade during the Effective Period; mandatory redemption.
**Quantitative magnitude:** Euro XV is past Effective Date (closed Dec 2022); step is permanently inactive for this deal.
**Deferral rationale:** Inactive for every deal that makes it past the Effective Date ramp. For deals in-ramp only.
**Path to close:** Out of scope unless we model pre-Effective-Date CLOs.
**Test:** No active marker — permanently inactive for Euro XV. The `effectiveDateRating` row in the N1 harness table passes (both sides 0).

---

<a id="ki-04"></a>
### [KI-04] Frequency Switch mid-projection cadence/rate switch (C4 Phase 3)

**PPM reference:** Condition 1 (Frequency Switch Event), pp.127–128.
**Current engine behavior:** Trigger evaluation modeled in C4 Phase 2 (once it ships); warning fires if both (b) concentration and (c) interest-shortfall conditions cross their thresholds. Post-switch semi-annual cadence, 6M EURIBOR, and €500 Issuer Profit modeled via C4 Phase 1's manual `freqSwitchActive` flag. **Automatic mid-projection cadence/rate switching is not modeled.**
**PPM-correct behavior:** On trigger, switch quarterly → semi-annual payment dates, 3M → 6M EURIBOR, Issuer Profit €250 → €500. One-time and irreversible.
**Quantitative magnitude:** Euro XV currently has 0% Frequency-Switch-Obligation concentration (no loans with ≥6M payment frequency). Trigger (b) cannot fire without a structural pool change. Phase 3 impact is theoretical for this deal.
**Deferral rationale:** Engine rework to support variable periods-per-year mid-simulation (day-count, period calendar, OC/IC cadence, DDTL timing, call quantization). Rarely-hit scenario — Phase 2 warning + Phase 1 manual flip provide workable modeling coverage for any stress scenario an analyst would run.

**Cadence-coupled hardcodings that MUST be touched together when this lands** — independent enumerations of "periods per year = 4" sites that are correct under quarterly cadence and silently wrong under semi-annual:

- **T=0 IC test** (`projection.ts:1259-1276`): scheduled-interest base divided by literal `/ 4` instead of `dayCountFraction(...)`. Each of the seven IC numerator and denominator constructions in the T=0 block uses `/ 4` directly. Under semi-annual cadence the numerator is overstated by 2× and the IC ratio is correspondingly wrong.
- **Incentive-fee circular solver** (`projection.ts:2368, 2401`): two call sites pass `periodsPerYear = 4` literal to `resolveIncentiveFee(equityCashFlows, ..., 4)`. Under semi-annual cadence the IRR annualization is wrong; the hurdle test then fires at the wrong threshold.

These were originally tracked as "A10" and "A11" in the 2026-04-30 audit. They are sub-items of KI-04, not separate KIs — but they must be enumerated explicitly because closing KI-04 by only fixing the trigger detection without touching these sites leaves silent residual bugs that would not be caught by the trigger-detection test alone.

**Path to close:** Trigger: a deal where the trigger actually fires, or a partner request. The fix sequence is (a) replace literal `/ 4` and `4`-as-periods-per-year throughout the engine with day-count-fraction or `periodsPerYear` derived from the active cadence, (b) carry a per-projection `cadence: "quarterly" | "semiAnnual"` value as input, (c) implement automatic switch detection on (b) concentration + (c) interest-shortfall conditions, (d) re-run the N1 harness on a pre-switch fixture and a post-switch synthetic to confirm.

**Test:** No active marker — trigger does not fire on Euro XV (0% Frequency-Switch-Obligation concentration). Future deals that trip the trigger would surface as a cadence mismatch in the N1 harness period-count row. When the fix lands, also add (i) a synthetic T=0 IC test under semi-annual cadence asserting the correct day-count fraction is applied (catching the line 1259-1276 site), and (ii) a synthetic incentive-fee scenario under semi-annual cadence asserting `resolveIncentiveFee` annualizes correctly (catching the 2368/2401 sites).

---

<a id="ki-05"></a>
### [KI-05] Supplemental Reserve Account (step BB)

**PPM reference:** Condition 3.3(b).
**Current engine behavior:** Not modeled. No `stepTrace.supplementalReserve` field exists; the N1 harness mapper hardcodes the bucket to 0 (`backtest-harness.ts:288`). `ppm-step-map.ts:130` documents the bucket as "NOT EMITTED by engine (KI-05)". This entry covers the *flow into* the account during the waterfall; the *opening balance* (`resolved.supplementalReserveBalance`) is tracked separately by the resolver and addressed in [KI-26](#ki-26).
**PPM-correct behavior:** CM-discretionary deposit during Reinvestment Period, funds reinvestment buffer.
**Quantitative magnitude:** Not exercised on Euro XV per observed waterfall data.
**Deferral rationale:** CM-discretionary; not used in current operations.
**Path to close:** Add `supplementalReserveDepositBps` user input; engine routes to reserve account. Activates only when a deal exercises step (BB).
**Test:** No active marker — engine and trustee both 0 on Euro XV. The `supplementalReserve` row in the N1 harness table (Infinity tolerance) surfaces if a deal exercises it.

---

<a id="ki-06"></a>
### [KI-06] Defaulted Hedge Termination (step AA)

**PPM reference:** Condition 3.3(a).
**Current engine behavior:** Modeled as 0 by the N1 harness mapper (`backtest-harness.ts:287`); `ppm-step-map.ts:129` documents the bucket as "NOT EMITTED by engine (KI-06)". Non-defaulted hedge payments flow through step (F) (`stepTrace.hedgePaymentPaid`, declared at `projection.ts:265`, emitted at `:2463`).
**PPM-correct behavior:** Activates if a hedge counterparty defaults; termination payments flow through accelerated position in step (AA).
**Quantitative magnitude:** 0 in current data; activates only in hedge-counterparty-default scenarios (rare).
**Deferral rationale:** Contingent on counterparty default; model would need hedge-counterparty state which the upstream data pipeline doesn't track.
**Path to close:** Out of scope without hedge counterparty data pipeline.
**Test:** No active marker — activates only on counterparty default. `defaultedHedgeTermination` in the N1 harness table (Infinity tolerance) surfaces the magnitude if it ever triggers.

---

<a id="ki-07"></a>
### [KI-07] Class C/D/E/F deferred-balance pay-down may commingle with current interest under stress (currently latent on Euro XV)

**PPM reference:** PPM step codes (J) (current interest) and (K) (deferred-interest accrual / pay-down) for Class C; (M)/(N) for D; (P)/(Q) for E; (S)/(T) for F.

**Current engine behavior — corrected (was previously framed as "bundled in step map", which is contradicted by the code):** Engine emits step (J) and step (K) as **separate** fields:
- `classC_current` ← `PeriodResult.trancheInterest[].paid` (`backtest-harness.ts:303`, sourced from `projection.ts:2156`).
- `classC_deferred` ← `stepTrace.deferredAccrualByTranche` (`backtest-harness.ts:309`, sourced from `projection.ts:295, 1418-1419, 2194`).
- `ppm-step-map.ts:157-167` maps each bucket to a single PPM step code (`["j"]`, `["k"]`, etc.), not a bundled list.

The genuine latent risk this entry tracks: under deferred-interest stress, deferred-balance **pay-downs** (cash flowing OUT of `deferredBalances` back to noteholders) are routed via `deferredPay = Math.min(deferredBalances[t.className], remainingPrelim)` at `projection.ts:1956-1957`, and this paid-out amount may not surface as a separately-labelled PPM-step bucket — it is added back to the same `trancheInterest[].paid` field that carries current interest. Under stress, a partner reading the trace sees a `classC_current` row that combines (i) actual step (J) current interest and (ii) step (K) deferred pay-down, with no separation. This is the actual bundling concern.

**PPM-correct behavior:** Separate step lines for current interest (J/M/P/S) and deferred-balance accrual / pay-down (K/N/Q/T). Engine should emit a `stepTrace.classX_deferredPaydown` row distinct from `classX_current` whenever residual interest pays down deferred balance.

**Quantitative magnitude:** 0 drift on Euro XV Q1 2026 (no deferred-balance state to pay down). Under stress where Class C/D/E/F deferred balances accumulate (per KI-27) and then a high-interest period flushes some of that deferred back, the bundled output cannot be cleanly compared against split trustee lines.

**Deferral rationale:** No deferred state in current data → no observable bundling on Euro XV. Splitting requires extending `stepTrace` with deferred-paydown rows distinct from current-interest rows.

**Path to close:** After KI-27 (deferred-interest seeding) and B1+B2 (compositional EoD + post-acceleration) land — engine then carries non-trivial deferred-balance state across periods. Add `stepTrace.classX_deferredPaydown` for X ∈ {C, D, E, F}, populated from `deferredPay` at `projection.ts:1956-1957`. Update `backtest-harness.ts` and `ppm-step-map.ts` mappings to surface the new field as PPM step (K)/(N)/(Q)/(T). Update the trace renderer to display the row.

**Test:** `n1-correctness.test.ts > "green buckets" > Class C/D/E/F deferred interest is zero (no stress)`. No stress case exists on Euro XV; under deferred-interest stress this assertion will need to move into a `failsWithMagnitude` marker covering the new `classX_deferredPaydown` row.

---

<a id="ki-08"></a>
### [KI-08] `trusteeFeesPaid` bundled steps B+C — **PARTIALLY CLOSED (pre-fill D3 + cap mechanics C3)**

**Status (2026-04-23, Sprint 3 C3 landed):** Mechanics shipped; three design assumptions remain unverified against the Ares European XV PPM. Tracking the open verifications under [KI-16](#ki-16) so the ledger does not overclaim closure.

**What shipped:**

1. **Pre-fill (D3, Sprint 2)**: `defaultsFromResolved` back-derives `trusteeFeeBps` AND `adminFeeBps` separately from Q1 waterfall steps B + C (Euro XV: 0.0969 bps trustee, 5.147 bps admin, 5.244 combined).
2. **Cap + overflow (C3, Sprint 3)**: `ProjectionInputs.adminFeeBps` + `ProjectionInputs.seniorExpensesCapBps` added. Engine emits trustee + admin fees jointly capped at `seniorExpensesCapBps` × beginningPar × dayFrac; overflow routes to PPM steps (Y) trustee-overflow and (Z) admin-overflow, paying from residual interest after tranche interest + sub mgmt fee.

**What is NOT verified yet (blocks "FULLY CLOSED" status — tracked in [KI-16](#ki-16)):**
- **20 bps cap default** when `defaultsFromResolved` cannot infer from observed data: a reasonable heuristic but not cross-referenced against the Ares XV PPM Senior Expenses Cap definition.
- **2× observed heuristic** for the cap default when Q1 observed is present (`max(2× observed, 20 bps)`): protects against breaching the cap with modest fee growth, but the "2×" multiple is engineering judgment, not a PPM-documented buffer.
- **Pro-rata overflow allocation** between `trusteeOverflowPaid` and `adminOverflowPaid`: the engine splits overflow proportionally to the requested trustee vs admin shares, but the PPM may specify sequential payout (trustee first, then admin) or a different allocation rule.

**Partner-visible behavior on Euro XV**: observed combined ~5.24 bps well below default cap of 20 bps → no overflow, `trusteeFeesPaid` ties to trustee within €722 (day-count residual from 91/360 engine vs 90/360 trustee). Stress scenarios with observed > cap produce proportional overflow split between trustee and admin buckets. The three assumptions only bite in stress scenarios; Euro XV base case is unaffected.

**Tests (7 new C3 tests):**
- `c3-senior-expenses-cap.test.ts` — base case (no overflow), high-fee overflow (50 bps + 20 bps cap → 30 bps overflow), extreme cap (1 bps), overflow-limited-by-residual, backward-compatibility (undefined cap = unbounded).
- `d3-defaults-from-resolved.test.ts` — `trusteeFeeBps` + `adminFeeBps` separately back-derived; sum matches pre-C3 combined extraction; `seniorExpensesCapBps` derivation from Q1 observed.
- `b2-post-acceleration.test.ts` — under acceleration (PPM 10(b)) trustee + admin pay uncapped; regression guard asserts `stepTrace.adminFeesPaid / trusteeOnly = adminFeeBps / trusteeFeeBps` exactly.

**Cascade re-baselines**: KI-13a adjusted by the C3 split preserving aggregate behavior; `stepTrace.trusteeFeesPaid` currently bundles steps (B)+(C)+(Y)+(Z) to preserve the N1 harness bucket semantics. Split-out fields (`adminFeesPaid`, `trusteeOverflowPaid`, `adminOverflowPaid`) are additive diagnostic fields — the harness will be un-aggregated in a follow-up (see task #48).

**Ledger disposition**: remain OPEN (partial) until KI-16 resolves the three PPM verifications. Then move to Closed issues.

---

<a id="ki-09"></a>
### [KI-09] Step (A)(i) Issuer taxes — CLOSED (Sprint 3, 2026-04-23)

**PPM reference:** Condition 1 definitions (Issuer profit / tax provisions); step (A)(i) in the interest waterfall.

**Pre-fix behavior:** Not modeled. `stepTrace.taxes` emitted 0. Engine `subDistribution` over-stated by ~€6,133/quarter on Euro XV because taxes never came out of the top of the waterfall.

**Pre-fix quantitative magnitude:** €6,133/quarter = €24,532/year on Euro XV. On a €42.56M equity cost basis (95c × €44.8M sub par) ≈ 5.8 bps annual drag; cumulative ~€245K over a 10-year projection.

**Fix (Sprint 3):** `taxesBps` added to `ProjectionInputs` + `UserAssumptions`. Engine deducts taxes at step (A)(i) before any other senior expense. `stepTrace.taxes` emits the amount. `defaultsFromResolved` back-derives `taxesBps` from raw `waterfallSteps` step (A)(i) annualized on beginningPar (Euro XV: 0.497 bps = €6,133/quarter, matched to the cent). Accel branch (B2) also passes `taxesAmount` through to the post-acceleration executor since taxes remain payable under acceleration per PPM 10.

**Verification:** Engine produces €6,202/period vs trustee €6,133 = €69 day-count residual at 91/360 vs 90/360. Decomposed: engine taxesAmount = beginningPar × (taxesBps / 10000) × (91 / 360), trustee reports annualized tax × (90 / 360) window. On the €493.3M Euro XV pool at 0.497 bps the ratio is 91/90 = 1.0111, so residual ≈ €6,133 × 0.0111 = €68.7 (matches observed €69 to the cent). Same day-count mechanic as KI-12b for tranche interest — it's a harness-period-mismatch artifact, not an engine bug; closes with KI-12a.

**Cascade re-baseline:** N1 harness `taxes` bucket tolerance tightened from Infinity to €100. KI-13a cascade re-baselined from −€44,540 to −€50,742 (Δ = −€6,202 matching engine emission to the euro). KI-IC-AB/C/D cascade moved ~1-2 pp on each class (see KI-14).

---

<a id="ki-10"></a>
### [KI-10] baseRate pre-fill gap (D3 family) — **CLOSED (D3, 2026-04-23)**

**Status:** Closed in Sprint 2 / D3. `defaultsFromResolved(resolved, raw)` pre-fills `baseRatePct` from `raw.trancheSnapshots[*].currentIndexRate` when available (Euro XV: 2.016%). Both `n1-correctness.test.ts` and the ProjectionModel UI now use this helper; the static 2.1% default only applies when no observed rate is present in the snapshot feed.

**Residual behavior:** None. The six per-class Euro XV drifts previously attributed to KI-10 (€65K on Class A, ~€28K across B-F combined per quarter) were bundled with KI-12b day-count drifts; after D3, what remains on those buckets is purely KI-12b (harness period mismatch, one extra day of accrual).
**Test:** `d3-defaults-from-resolved.test.ts` — pre-fill anchor tests including Euro XV observed-EURIBOR spot-check (2.016% matches fixture, asserted at line 33).

---

<a id="ki-11"></a>
### [KI-11] Senior / sub management fee **rate** pre-fill — **CLOSED (D3); FEE-BASE REMAINS OPEN (KI-12a)**

**Status (2026-04-23):** Partial close. Pre-fill of `seniorFeePct` / `subFeePct` / `incentiveFeePct` / `incentiveFeeHurdleIrr` landed in Sprint 2 / D3 via `defaultsFromResolved`. The resolver's PPM extraction had always populated `resolved.fees.*`; D3 is the plumbing that makes those flow into `UserAssumptions` as pre-fill defaults. The KI-11 **rate** pre-fill gap is closed.

**What REMAINS open (tracked under KI-12a, not KI-11):** The ~€22.35M fee-BASE discrepancy — engine computes fees off `beginningPar` (current fixture snapshot = €493.3M) while trustee computes off prior Determination Date balance (= €470.9M). This is the N1 harness period-mismatch, structurally distinct from rate pre-fill. **Do not conflate: D3 closed the wrong-rates problem; the wrong-base problem is KI-12a's territory.**
**Residual behavior:** None from KI-11. The €24,354 subMgmtFee / €10,438 seniorMgmtFee N1 drifts that remain on Euro XV are KI-12a (period mismatch) + KI-12b (day-count on 91/360), not KI-11.
**Test:** `d3-defaults-from-resolved.test.ts` — fee-rate pre-fill tests; expected senior=0.15%, sub=0.35%, incentive=20%, hurdle=12%.

---

<a id="ki-12a"></a>
### [KI-12a] N1 harness period mismatch — engine Q2 projection vs trustee Q1 actual

**Context:** This entry was originally framed as "Senior/sub management fee base discrepancy (attribution pending)" and then narrowed to "fee-base period-timing snapshot error." Independent review flagged that the actual issue is one level up: **the N1 harness is not a Q1 replay at all — it's a Q2 forward projection compared against Q1 trustee data.** The fee drift is the symptom most visible; the cause is structural to the harness.

**Evidence that the harness runs Q2, not Q1:**

- `projection.ts:944` `addQuarters(currentDate, 1)` (period-1 anchor when `stubPeriod` is absent) + `projection.ts:1332` `const periodDate = periodEndDate(q);` (per-period date inside the loop).
- Fixture `resolved.dates.currentDate = 2026-04-01`.
- `addQuarters('2026-04-01', 1) = '2026-07-01'` — period 1 is July, not April.
- `backtest-harness.ts:164` uses `result.periods[0]`; `:231` pulls the trustee `paymentDate` from `backtest` (Apr 15 2026 in the fixture). **These are different quarters.**

**Why the harness still ties on tranche interest but not on fees:**

- Tranche interest: during reinvestment period (`reinvestmentPeriodEnd = 2026-07-14`, still active in Q2) tranche balances are stable and the base rate is pinned from Q1 observed EURIBOR. Engine Q2 interest ≈ trustee Q1 interest coincidentally → Class A/B/C/D/E/F all match within €1 under legit pins.
- Senior/sub mgmt fees: accrue on pool balance. Trustee Q1 fee base = €470,899,177 (cross-verified: senior fee €176,587.19 / (0.15%/4) = €470.9M; sub fee €412,036.78 / (0.35%/4) = €470.9M; agreement within €4). Engine Q2 fee base = current pool snapshot = €493,252,343. Delta **€22,353,166 ≈ €22.35M**. Growth-sensitive field → drifts legitimately.
- Trustee fees, taxes, issuer profit (KI-01/08/09): orthogonal — engine emits 0 regardless of period.

**What the €22.35M is NOT:**

| Hypothesis | Fixture evidence | Rejected by |
|---|---|---|
| DDTL unfunded in engine base | €581k total | Magnitude (~38× too small) |
| PIK accrual in base | €2.38M | Magnitude (~9× too small) |
| Defaulted par in base | €0 | Zero defaulted positions in fixture |
| Discount obligations at par | €0 | Zero discount obligations |
| CCC excess at market value | Moody's Caa 6.92 vs 7.5 | Under limit — no haircut triggered |
| Bonds at MV rather than par | Delta €5.1M | Wrong magnitude |
| Loans at MV rather than par | Delta €20.2M (loanPar €440.8M − loanPriceMV €420.6M) | **Not rejected.** Sign is correct (trustee base is lower than engine by ~€22M; MV < par lowers base). Magnitude is €2M shy of the target. Plausibly a component of a combined PPM rule (e.g., some loan sub-bucket carried at MV + the bonds-at-MV delta €5.1M + another haircut). Not the full explanation on its own. |
| **Q1 reinvestment growth** | Gross Q1 trade settlement €5.5M out / €5.3M in; net −€232,893 | **Trade activity ceiling of ~€5M can't produce €22M pool growth.** `parAmount` and `acquisitionDate` both null in fixture, so we can't verify directly, but the cash-flow bound is firm. |

**What the €22.35M MIGHT be — narrowed via PPM grep (2026-04-23):**

`rg -A3 'collateral principal|senior.*fee|management fee' ppm.json` confirms:
- **Fee basis is "Collateral Principal Amount" (CPA)** for both Senior (§E, 0.15% p.a.) and Sub (§X, 0.35% p.a.) management fees — distinct from "Aggregate Principal Balance" (APB, the engine's `beginningPar`) and distinct from "Adjusted Collateral Principal Amount" (ACPA, which §10(a)(iv) uses as the OC numerator: APB of non-defaulted + MV×PB of defaulted + Principal Proceeds in Principal Account on Measurement Date).
- **Day-count is Actual/360 (floating), 30/360 (fixed).** PPM's own worked example: `2.96600% × 310M × 90/360 = €2,298,650` ties out to 15-Apr-2026 Class A Interest exactly. Confirms engine's /4 is identical to PPM's 90/360 on this specific 90-day quarter.
- **Condition 1 definition of CPA is NOT transcribed** in `ppm.json`; it lives on PDF pp. 390–397. Final narrowing of KI-12a requires reading those pages of the source PDF (`Ares CLO XV - Final Offering Circular dated 14 December 2021.pdf`).

**Candidates that remain after this narrowing:**
- Loan-at-MV + bond-at-MV combined haircut rule (evidence table row 7: €20.2M + €5.1M overshoots to €25.3M, but a specific sub-bucket applied at MV could land at €22.35M)
- Mid-period balance-weighted average rather than a snapshot
- A specific Condition 1 CPA-exclusion class applied to a subset of holdings (cov-lite? specific industry? deferred interest obligations?) that sums to ~€22.35M

**Day-count is NOT the cause on Q1 2026:** Accrual window Jan 15 → Apr 15 = 31+28+31 = 90 days; Actual/360 = 90/360 = 1/4 — identical to engine's periods-per-year proxy. Day-count drift on non-90-day periods is tracked separately as KI-12b.

**Under interpretation B, the scope widens:** Any N1 bucket that depends on pool balance at time T has the same structural mismatch. Fields to re-audit after the harness fix:
- `trusteeFeesPaid` (KI-08) — the €64,660 drift magnitude reflects trustee's Q1 fee; engine emits 0 because `trusteeFeeBps=0` default. The "expected magnitude" is period-mismatch-contaminated: after KI-08 pre-fill, the residual fee drift will be whatever Q2's fee base implies, not Q1's.
- `subDistribution` cascade — residual of everything above. Period-mismatch drift sits underneath every component drift.
- `initialState.ocTests` (passes ~0.01%): OC matches because trustee OC and engine initialState both anchor on the Q1 Determination Date balance (~= current fixture snapshot); the fee clause anchors on the prior Determination Date. Different mechanics, same report.

**Path to close — harness-level, not engine-level:**

The engine is probably not wrong about Q2; the harness is pretending Q2 is Q1. Two fixes, either works:

- (a) **Rebuild the fixture at the prior Determination Date (Q4 2025).** `periods[0]` then replays Q1 2026 and the harness comparison becomes semantically valid. Blast radius: one re-extraction; changes every current drift magnitude (re-baseline all markers). **Recommended.**
- (b) **Add an engine "rewind" step** that backs Q1 activity out of the fixture to reconstruct Q4 2025 state, then runs `periods[0]` from there. Heavier (needs reverse-apply of reinvestment, amortization, payment), and the rewind itself carries approximation error.
- Either fix obsoletes the current per-bucket KI-12a drift magnitudes. Post-fix, the residual fee drift is whatever TRULY remains — and *that* is what should carry a per-bucket KI entry if it's non-zero.

Not closed by Sprint 1 / B3 (day-count) or Sprint 3 / C3 (fee pre-fill). Structural harness work covering fixture re-extraction at the prior Determination Date AND re-baseline of every cascade marker (KI-12b classA-F, KI-13a, KI-IC-AB/C/D) — both must land in the same change to keep the bijection consistent.

**Test:** `n1-correctness.test.ts > "currently broken buckets" > seniorMgmtFeePaid | subMgmtFeePaid` — two `failsWithMagnitude` markers (ki: `KI-12a-seniorMgmt`, `KI-12a-subMgmt`). These markers currently measure *harness period-mismatch drift*, not engine fee-base error. When the harness fix ships, both markers must be re-baselined (likely to near-zero) or removed and replaced with correctness assertions on the residual post-fix drift.

**Scope note (B2 accelerated mode):** KI-12a's fee-base discrepancy applies in BOTH normal and accelerated-waterfall modes. B2's accelerated executor receives `trusteeFeeAmount`, `seniorFeeAmount`, `hedgeCostAmount` computed via the same `beginningPar * rate * dayFrac` formula as normal mode — it inherits the same fee-base gap. A partner who digs into a stress-scenario demo will see senior-expense numbers that carry the same ~€27K/quarter drift from PPM-exact as normal mode. The fix for KI-12a (harness fixture regeneration at prior Determination Date, or multi-period historical harness) closes the gap in both modes simultaneously.

---

<a id="ki-12b"></a>
### [KI-12b] Day-count precision active; surfacing KI-12a period mismatch on 6 class-interest buckets

**Status (2026-04-23 update):** B3 shipped. `dayCountFraction` helper + per-tranche convention (Actual/360 float, 30/360 fixed) replaced the legacy `/4` everywhere in the period loop. First-principles arithmetic tests (`b3-day-count.test.ts`, 11 cases) anchor the helper to PPM worked example `2.966% × 310M × 90/360 = €2,298,650`.

**What KI-12b now represents:** residual drift on the harness's six class-interest buckets caused by the KI-12a period mismatch becoming arithmetically visible. Pre-B3, the `/4 = 90/360` coincidence masked this — engine Q2 (91 days) and trustee Q1 (90 days) produced identical tranche coupons under /4. Post-B3, engine Q2 accrues Actual/360 on 91 days and diverges from trustee's 90-day window by one day of interest per tranche.

**PPM reference:** Condition 1 — "Day count (Actual/360 float, 30/360 fixed)"; confirmed via `ppm.json` grep and PPM worked example (see KI-12a).
**Current engine behavior:** B3 landed. Engine uses `dayCountFraction("actual_360"|"30_360", periodStart, periodEnd)` for tranche coupons, loan interest, and all management/trustee/hedge fees. `trancheDayFrac(t) = t.isFloating ? dayFracActual : dayFrac30`.
**PPM-correct behavior:** Per-tranche day-count convention + actual days in the period. Applies across every interest-denominated step (tranche coupons, management fees, hedge legs).

**Quantitative magnitude — the B3 / KI-12a interaction (new in 2026-04-23 review):**

The Class A/B/C/D/E/F interest tie-outs currently pass at |drift| < €1 under legit pins in `n1-correctness.test.ts`. That's a **coincidence that B3 will break**, because:

- Under interpretation B (see KI-12a), engine's period 1 is **Q2 2026 = Apr 1 → Jul 1 = 91 days** (30+31+30). With `currentDate = 2026-04-01` and `addQuarters(currentDate, 1) = 2026-07-01`, the boundary anchors at Apr 1 / Jul 1, not Apr 15 / Jul 15. Day-count holds at 91 by coincidence (30+31+30 either way).
- Trustee Q1 2026 is **Jan 15 → Apr 15 = 90 days** (31+28+31, cross-verified with PPM worked example `× 90/360`).
- Engine's current `/4 = 0.25` coincidentally equals trustee's `90/360 = 0.25` exactly → Q2 engine interest = Q1 trustee interest on the same pinned rate and balance.
- **When B3 replaces `/4` with actual-days/360, engine period 1 becomes `91/360 = 0.2528`**, breaking the coincidence. The drift per class is (class_balance × class_rate × 1/360). Q1 rates and ending balances give approximate one-day drifts:

  | Class | Balance (€) | Rate (≈) | +Δ under B3 (€) |
  |---|---|---|---|
  | A | 310M | 2.97% | 25,575 |
  | B (B-1 + B-2) | 45M | 3.44% | 4,300 |
  | C | 32.5M | 4.12% | 3,720 |
  | D | 34.4M | 5.16% | 4,930 |
  | E | 25.6M | 8.13% | 5,780 |
  | F | 15M | 10.87% | 4,530 |
  | **Total** | | | **≈ €48,800 / period** |

  Class A alone contributes ~52% of the total; treating it as "~€25K per class" overstates the picture.
- This drift is NOT an engine regression — it's the harness period mismatch (KI-12a) finally bleeding through the arithmetic once the `/4 = 90/360` coincidence is gone.

**Sprint 1 sequencing (historical note):** Pre-ship analysis anticipated that shipping B3 before KI-12a would produce a spurious "Sprint 1 broke six tests" signal. That prediction was correct — and the six `failsWithMagnitude` markers below formalize the drift so it's documented rather than flagged as regression.

**Empirical magnitudes (measured against Euro XV fixture, legit-pinned, post-B3 engine):**

| Class | Post-B3 drift (€) | Formula check |
|---|---|---|
| A | +25,540.56 | 310M × 2.966% × 1/360 ≈ €25,545 ✓ |
| B (B-1 + B-2) | +3,483.75 | 45M × (avg 3.44%) × 1/360 ≈ €4,300 (B-2 is fixed 30/360 = 0, so only B-1 floating contributes; hence lower than the combined estimate) |
| C | +3,715.83 | 32.5M × (avg 4.12%) × 1/360 ≈ €3,720 ✓ |
| D | +4,932.81 | 34.375M × (avg 5.17%) × 1/360 ≈ €4,940 ✓ |
| E | +5,784.13 | 25.625M × (avg 8.13%) × 1/360 ≈ €5,790 ✓ |
| F | +4,527.50 | 15M × (avg 10.87%) × 1/360 ≈ €4,530 ✓ |
| **Total** | **+€47,984.68** | Within 2% of the pre-ship prediction (~€48.8K) |

**Cascade impact:** KI-13a-engineMath re-baselined from −€607.93 (pre-B3) to +€20,841.63 (post-B3) — sign flipped because the six positive KI-12b drifts + KI-12a fee drifts (~€35K) outweigh the negative KI-08/09/01 drifts (−€71K). Textbook example of reviewer's warning that cascade signs can flip mid-close.

**Path to close:** All six markers remove together when KI-12a (harness period mismatch) lands — either a Q4 2025 fixture that makes `periods[0]` a Q1 replay, or multi-period historical backtest.

**Test:** `n1-correctness.test.ts > "currently broken buckets"` — six `failsWithMagnitude` markers:
- `KI-12b-classA` (+€25,540.56 ± €50)
- `KI-12b-classB` (+€3,483.75 ± €50)
- `KI-12b-classC` (+€3,715.83 ± €50)
- `KI-12b-classD` (+€4,932.81 ± €50)
- `KI-12b-classE` (+€5,784.13 ± €50)
- `KI-12b-classF` (+€4,527.50 ± €50)

---

<a id="ki-13"></a>
### [KI-13] Sub distribution cascade residual

**PPM reference:** Step (DD) — residual to sub (equity) note.
**Current engine behavior:** `subDistribution` is the residual bucket; every upstream drift (taxes, trustee fee, mgmt fees, fee-base) cascades into it. Direction depends on the net sign of those drifts.
**PPM-correct behavior:** N/A — this is a cascade, not an independent mechanic. Closes automatically as upstream KIs close.
**Quantitative magnitude:**
- Engine-math (legit pins, post-KI-01 close): −€50,992.24/quarter. Counter-intuitive negative sign: KI-12b class-interest day-count drifts (+€48,019) + KI-12a fee-base day-count drifts (+€34,792) + trustee/admin residuals minus KI-09 taxes (−€6,202) and KI-01 issuer profit (−€250). Multiple drifts compound or cancel; the sign is not a stable indicator. Verified live by N1 harness (`subDistribution | dd | … delta -50992.24`).
- Production path (no pins): historically reported as +€617,122/quarter. **No `KI-13b-productionPath` marker currently exists in the codebase** (no `n1-production-path.test.ts` file); the +€617K number originated as a one-time measurement and has not been pinned by an active assertion. Either re-instate the production-path harness with a marker, or drop the production-path number from this entry. Until then, treat the +€617K figure as historical context, not as a verified live drift.
**Deferral rationale:** Structural — residual that tracks the sum of upstream corrections.
**Path to close:** Closes progressively as KI-01 / KI-08 / KI-09 / KI-10 / KI-11 / KI-12a close. No standalone work.
**Test:** `n1-correctness.test.ts > "currently broken buckets" > subDistribution` (ki: `KI-13a-engineMath`, expectedDrift **−€50,992.24** ± €50). The production-path counterpart referenced in prior versions of this entry was never landed; if the production-path drift is judged worth tracking, write a new `n1-production-path.test.ts` and pin a fresh `KI-13b-productionPath` marker before referencing it here. The `expectedDrift` on `KI-13a-engineMath` must be re-baselined (or the marker removed if drift closes) whenever an upstream KI moves.

**⚠ Maintenance checklist** — include in every PR that closes or moves an upstream KI (01 / 08 / 09 / 10 / 11 / 12a):
- [ ] Did this PR close or modify an upstream KI's expected drift magnitude?
- [ ] If yes: re-run the harness and update `KI-13a-engineMath.expectedDrift` in `n1-correctness.test.ts`.
- [ ] If yes (and KI-10/11 moved): same for `KI-13b-productionPath.expectedDrift` in `n1-production-path.test.ts` — only if a production-path harness has been re-instated; no such file exists today (see entry body).
- [ ] If the cascade drift dropped below tolerance, remove the failsWithMagnitude marker and move KI-13 to Closed.
- [ ] Note: signs can flip during the close sequence — re-check the sign, not just the magnitude.

---

<a id="ki-14"></a>
### [KI-14] IC compositional parity at T=0 (cascade residual)

**PPM reference:** Condition 12 (Interest Coverage Test); §(A)(i), (A)(ii), (B), (C), (E)(1) components in the numerator.
**Current engine behavior:** Engine computes IC at T=0 (`initialState.icTests`) by deducting PPM §(A)(i) taxes, §(B) trustee, §(C) admin, §(E) senior mgmt, §(F) hedge from the scheduled interest base. Under legit pins (production path via `defaultsFromResolved`), engine IC ratios still sit slightly above trustee because KI-01 (issuer profit) and KI-12a (senior mgmt fee base mismatch) remain open — net residual drift ~3 pp per class.
**PPM-correct behavior:** IC numerator includes the full set of §(A)–§(F) deductions correctly attributed.
**Quantitative magnitude (post-Sprint-3 KI-08 admin + KI-09 taxes closure, Q1 2026):**
  - Class A/B: +3.960 pp drift (was +6.600 pre-cascade; Δ −2.64 pp from admin+taxes deductions landing in initialState)
  - Class C: +3.525 pp drift (was +5.865; Δ −2.34 pp)
  - Class D: +3.070 pp drift (was +5.117; Δ −2.05 pp)
**Deferral rationale:** Cascade — not an independent formula bug. The IC parity test exists because the component cash-flow checks in n1-correctness don't exercise the aggregation/denominator logic of the IC formula itself; a mis-aggregation would slip through.

**Important — test input path correctness (fixed Sprint 3):** The prior test setup spread `DEFAULT_ASSUMPTIONS` with `taxesBps: 0, adminFeeBps: 0, trusteeFeeBps: 0`, meaning the markers could not move when KI-08 admin or KI-09 taxes closed (the input path zeroed the very fields those closures would add to the numerator). Swapped to `defaultsFromResolved(fixture.resolved, fixture.raw)` — the production path used by `ProjectionModel.tsx` — so the cascade actually cascades. Closure of admin/taxes then shifted the observed drift by the expected ~2-3 pp per class, confirming both the fix and the cascade wiring.
**Path to close:** Closes progressively as KI-01 / KI-12a close. No standalone work.
**Test:** `backtest-harness.test.ts > "N6 harness" > Class A/B|C|D IC compositional parity at T=0` — three `failsWithMagnitude` markers (`KI-IC-AB`, `KI-IC-C`, `KI-IC-D`), tolerance 0.05pp. Every PR closing an upstream KI must re-run the harness and update these three `expectedDrift` values.

---

<a id="ki-15"></a>
### [KI-15] B2 accelerated-mode incentive fee hardcoded inactive

**PPM reference:** Post-acceleration Priority of Payments step (V) — "Incentive Collateral Management Fee (if Incentive Fee IRR Threshold met)." Same IRR-threshold mechanics as the normal-mode step (CC) / (U).
**Current engine behavior:** B2's accelerated executor is called with `incentiveFeeActive: false` hardcoded at `projection.ts:1797` (in the accel branch's call into `runPostAccelerationWaterfall`; the field is declared on the executor input at `projection.ts:624`, consumed at `:737` to gate the `pay(input.incentiveFee)` call). Deliberate simplification. Under acceleration the incentive fee is emitted as zero regardless of whether equity cash-flow history would satisfy the IRR hurdle.
**PPM-correct behavior:** Run the same IRR-threshold test used in normal-mode step (CC), on the combined pre-breach + accelerated-mode equity cash-flow series. If the hurdle is met, incentive fee fires at the configured percentage; else zero.
**Quantitative magnitude:** Scenario-dependent. Under most distressed paths the hurdle is NOT met (equity cash flows collapse under acceleration — if the deal is accelerating, it's usually because upstream losses have swamped distributions), so the hardcoded behavior matches PPM intent within tolerance. BUT in scenarios where pre-breach equity distributions were large (e.g., a previously well-performing deal that trips EoD late in the reinvestment period due to a single large default cluster), the accumulated equity IRR may still clear the hurdle. In those scenarios, the hardcoded `false` under-reports incentive fee owed and over-reports residual to Sub Notes.
**Deferral rationale:** Restoring the IRR solver under acceleration requires carrying equity-cash-flow state across the normal → accelerated mode transition and wiring the same `resolveIncentiveFee` circular solver used in normal mode. Not structural; tedious. Low priority relative to the Sprint 2 B1+B2 scope.
**Path to close:** Add `incentiveFeeActive` computation in the engine's accel branch: call `resolveIncentiveFee` with the current equity-cash-flow series and hurdle, pass the resulting active flag + computed fee to the executor. Carry the equity-cash-flow series across the normal → accelerated mode transition rather than re-initializing.
**Test:** No active marker — requires a synthetic scenario where pre-breach equity distributions accumulate above the hurdle, then EoD triggers. Not covered by current B2 stress tests (which use low-MV + high-default scenarios that have near-zero pre-breach distributions). When the fix lands, add a test that constructs such a scenario and verifies incentive fee fires correctly under acceleration.

---

<a id="ki-16"></a>
### [KI-16] KI-08 closure assumptions pending PPM verification

**PPM reference:** Condition 10 (Senior Expenses Cap) + steps (Y) / (Z) (post-cap overflow distribution). Ares European XV PPM — sections have not yet been cross-referenced against the C3 implementation.

**What is assumed without PPM confirmation:**

1. **20 bps default cap** when no observed Q1 senior-expense data is present. The engine falls back to 20 bps × beginningPar × dayFrac; this is a market-convention heuristic, not an Ares XV-specific figure. If the PPM specifies a different absolute bps cap, all stress-scenario overflow math is off by the ratio.
2. **`max(2× observed, 20 bps)` heuristic** when D3 can infer observed fees. The "2×" buffer is engineering judgment to keep the cap from biting in modest fee-growth scenarios; the PPM may specify a different buffer (1.5×, 3×) or no heuristic at all (cap is a hard bps number independent of observed).
3. **Pro-rata overflow allocation** between trustee and admin overflow buckets (steps Y / Z). The engine splits overflow proportionally to each component's uncapped request. The PPM may specify sequential payout (trustee overflow pays before admin overflow), or a fixed allocation (e.g., admin gets 100% of overflow up to a sub-cap). Under Euro XV base case observed is below cap so this doesn't manifest; under stress it drives whether trustee or admin is under-paid first.

**Quantitative magnitude:** Zero on Euro XV base case (observed < cap → no overflow). Material in stress scenarios: the C3 high-fee overflow test uses 50 bps requested vs 20 bps cap → 30 bps overflow = ~€37K/quarter on beginningPar €493M, and the current pro-rata split routes ~€36K to trustee overflow and ~€1K to admin overflow. If PPM specifies sequential payout trustee-first, the numbers don't change; if sequential admin-first, the split flips.

**Path to close:** Read the Ares European XV PPM sections on Senior Expenses Cap and steps (Y) / (Z). Compare against `projection.ts:2344-2358` overflow logic (the `overflowRatio = overflowPayable / cappedOverflowTotal` block — pro-rata split between `trusteeOverflowPaid` and `adminOverflowPaid`) and `build-projection-inputs.ts:147` (the `seniorExpensesCapBps: 20` static fallback) plus `build-projection-inputs.ts:278` (the `Math.max(observedRateBps * 2, 20)` heuristic when Q1 observed is present). Either (a) confirm the three assumptions are correct and promote KI-08 to FULLY CLOSED, or (b) amend the engine to match PPM and re-run C3 tests.

**Tests:** C3 tests continue to pin the current assumptions. When the PPM read completes, the stress-scenario tests may need their expected overflow values re-calibrated; the base-case Euro XV test is insensitive.

---

<a id="ki-17"></a>
### [KI-17] wacSpreadBps methodology gap (Sprint 3 C2)

**PPM reference:** Condition 1 / definitions — "Weighted Average Spread". Trustee reports pool WAS via a specific methodology that likely (a) adjusts fixed-rate coupons to a floating equivalent via `(coupon − baseRate) × par`, (b) excludes defaulted or discount-obligation positions from the denominator, and/or (c) applies a PPM-defined WAS formula that differs from a simple par-weighted average of `spreadBps`.

**Current engine behavior:** `PeriodQualityMetrics.wacSpreadBps` in `projection.ts` is a par-weighted average of `LoanState.spreadBps` as-set by the resolver. At T=0 on Euro XV the engine emits ~397 bps vs trustee 368 bps — a systematic +29 bps drift.

**PPM-correct behavior:** Match the trustee's WAS methodology bit-for-bit.

**Quantitative magnitude:** ±30 bps at T=0 (≈8% relative). Grows or shrinks as fixed-rate loans default or are added via reinvestment.

**Impact on compliance enforcement:** Euro XV's Minimum WAS trigger is 3.65% vs observed 3.68% — a **3 bps cushion**. Engine's ±30 bps uncertainty straddles that cushion by 10×. C1 reinvestment compliance explicitly does NOT enforce against the WAS trigger until this gap closes; the Minimum WAS check is left as a partner-facing advisory (not a hard block).

**Path to close:** Read Ares European XV PPM "Weighted Average Spread" definition. Amend `computeQualityMetrics` to match — likely adjust fixed-rate loans to `max(0, fixedCouponPct − baseRatePct)` bps and exclude defaulted par from the denominator. Re-baseline the C2 T=0 parity test (`wacSpreadBps` tolerance from ±30 bps to ±5 bps). Then extend C1 enforcement to include Minimum WAS.

**Test:** `c2-quality-forward-projection.test.ts > "period-1 WARF, WAL, WAS match resolver within day-count tolerance"` — current tolerance ±30 bps on WAS documents the gap. When closed, tighten to ±5 bps and add an assertion that fixed-rate adjustment is applied.

**⚠ Test deletion required on closure:** `c1-reinvestment-compliance.test.ts > "Minimum WAS breach via reinvestment spread=0 does NOT block (KI-17 — deferred)"` is a deferred-enforcement honesty guard — it asserts the current non-enforcement behavior and **must be DELETED (not flipped) when KI-17 closes**. The PR that lands WAS enforcement must delete the test and replace it with a "spread=0 reinvestment is blocked" positive-enforcement assertion. A surviving honesty guard would assert an old non-enforcement claim against the new correct code.

---

<a id="ki-18"></a>
### [KI-18] pctCccAndBelow coarse-bucket collapse (Sprint 3 C2)

**PPM reference:** Condition 1 / definitions — "Caa Obligation", "CCC Obligation". Separate per-agency definitions (Moody's Caa1/Caa2/Caa3 + Ca + C, and Fitch CCC+/CCC/CCC-/CC/C). The trustee's "Caa and below" concentration test takes the **max across agencies** — a position counted by either rating agency flips it into the bucket.

**Current engine behavior:** `PeriodQualityMetrics.pctCccAndBelow` counts positions with `ratingBucket === "CCC"` from the engine's coarse `RatingBucket` ("AAA", "AA", "A", "BBB", "BB", "B", "CCC", "NR"). This collapses all sub-bucket and per-agency granularity into a single bucket, sourced from whichever rating the resolver picked (typically Moody's if available, else Fitch). It may also mis-treat defaulted positions depending on how the resolver assigns `ratingBucket` on default.

**PPM-correct behavior:** Compute per-agency buckets (Moody's Caa rollup, Fitch CCC rollup), take the max. Include defaulted positions in the Caa bucket (PPM convention).

**Quantitative magnitude:** ±3pp at T=0 on Euro XV (engine vs trustee reported 6.92%). That's ≈43% relative error on a compliance bucket.

**Impact on compliance enforcement:** Euro XV's Moody's Caa concentration trigger is ~7.5% vs observed 6.92% — a **0.58 pp cushion**. Engine's ±3 pp uncertainty is 5× the cushion. C1 reinvestment compliance explicitly does NOT enforce against the Caa concentration test until this gap closes.

**Path to close:** (a) `ResolvedLoan` already carries per-agency raw strings (`moodysRating`, `spRating`, `fitchRating`, plus `*RatingFinal` derived variants — `resolver-types.ts:183-188`). What is missing is per-agency Caa/CCC bucket booleans (`moodysIsCaa`, `fitchIsCcc`); add them as derived fields on `ResolvedLoan`, OR compute them inline in `computePoolQualityMetrics` against the existing raw strings via a per-agency rollup helper. (b) Update `PeriodQualityMetrics.pctCccAndBelow` to compute max across agencies per position, summed over par. (c) Verify defaulted-position handling matches PPM convention. (d) Re-baseline the C2 T=0 parity test (tolerance from ±3 pp to ±0.1 pp).

**Test:** `c2-quality-forward-projection.test.ts > "period-1 WARF, WAL, WAS match resolver within day-count tolerance"` — current tolerance ±3 pp on pctCccAndBelow documents the gap. When closed, tighten to ±0.1 pp and extend C1 to enforce the Caa concentration test.

**⚠ No active honesty-guard test yet** (C1 test file currently guards only the WAS path via the KI-17 test). When KI-18 closure extends C1 to enforce Caa concentration, add a pre-closure honesty guard AND document its deletion sibling here — same discipline as KI-17. Do not leave a stale "we don't enforce Caa" assertion in the codebase once Caa enforcement ships.

---

<a id="ki-23"></a>
### [KI-23] Industry taxonomy missing on BuyListItem + ResolvedLoan blocks industry-cap enforcement

**Context:** CLO indentures typically cap single-industry concentration (e.g., "largest industry ≤ 15% of par"). Enforcing this requires per-loan industry classification under a standardized taxonomy (Moody's 35-industry list, S&P 35-industry list, or PPM-specific mapping).

**Current engine behavior:** Two affected surfaces — neither can compute industry concentration:

1. **`ResolvedLoan`** has no industry field. The switch-simulator's D4 pool-metric recomputation explicitly skips `largestIndustryPct` for this reason (see D4 code comment).
2. **`BuyListItem`** has a `sector: string | null` field, but it's **free-text** (partner-entered "Technology" / "Retail & Restaurants" / etc.). Without taxonomy normalization, an "exclude largest industry" filter would group near-duplicates ("Tech", "Technology", "Software & Tech") as distinct industries and under-enforce.

The D5 buy-list filter therefore ships 4 enforceable filters (WARF / WAS / excludeCaa / excludeCovLite) and defers industry. Partner demo story: "4 of 5 PPM filter categories fully enforced (WARF, Min WAS, excludeCaa, excludeCovLite); industry filter deferred pending taxonomy normalization, documented as KI-23."

**PPM-correct behavior:** Per-loan industry tagged against the deal's canonical taxonomy (Moody's or S&P depending on PPM). Industry concentration computed as `max_per_industry(Σ par) / total par × 100`. Cap enforced at reinvestment (C1) + filter (D5) + forward projection (C2).

**Quantitative magnitude:** Unknown without data. On Euro XV, `pool?.largestIndustryPct` is not populated and no concentration test row tracks it; resolver emits nothing for industry.

**Path to close (tiered):**

- **Tier 1 (buy-list filter, D5 extension):** Normalize `BuyListItem.sector` via a lookup table (or add a `sectorKey` canonicalized column). Add `maxIndustryPct` + `excludeLargestIndustry` filters.
- **Tier 2 (ResolvedLoan extension, D4 + C2 extension):** Add `industry: string | null` + `industryKey: string | null` to `ResolvedLoan`. Populate from holdings data (resolver extracts from SDF if present, else null). Extend `computePoolQualityMetrics` + switch simulator with `largestIndustryPct`. Extend C1 reinvestment compliance to enforce industry cap.
- **Tier 3 (C2 concentration test coverage):** Add industry concentration test to `resolved.concentrationTests` + compliance enforcement during forward projection.

Partner-demo gap but not blocking for Euro XV where industry concentration is likely within caps.

**Test:** None standalone until Tier 1 ships. When it does, a `d5-industry-filter.test.ts` pinned to synthetic buy-list items would cover the normalization + filter logic.

---

<a id="ki-21"></a>
### [KI-21] Parallel implementations of same calculation in multiple engine sites (architectural — PARTIAL: Scope 1+2 closed, Scope 3 remains)

**Status (2026-04-23):** Scope 1 (quality metrics) closed Sprint 4; Scope 2 (normal-mode waterfall two-path drift) closed Sprint 5; Scope 3 (accel executor + T=0 initialState hardcoded field enumerations) remains open — surfaced during Sprint 5 closure-verification probe.

**Original scope (Sprint 4 / KI-01 ship):** Engine had multiple parallel-implementation sites where "same calculation maintained in two places" risked drift:

1. **Quality-metric computation:** projection engine (per-period closure), switch simulator (inline recomputation), resolver T=0 (inline). Three implementations that needed to agree.
2. **Senior-expense two-path drift (normal mode):** IC-numerator path (`totalSeniorExpenses` → `interestAfterFees`) vs cash-flow path (`availableInterest -=` chain). Two parallel accumulators computing the same six senior-expense amounts that had to stay in sync.

**Scope 1 close (Sprint 4 / D4, 2026-04-23):** `lib/clo/pool-metrics.ts` now hosts the canonical implementations of `computePoolQualityMetrics`, `computeTopNObligorsPct`, and `BUCKET_WARF_FALLBACK`. Three consumers (projection engine, switch simulator, resolver) delegate to the shared helpers — drift-by-construction eliminated.

**How Scope 2 surfaced (Sprint 4):** KI-01 ship. First-pass fix added `issuerProfitPaid` to `totalSeniorExpenses` only. Harness showed engine emitting €250 correctly AND KI-13a cascade probe showed sub-distribution drift UNCHANGED — meaning cash flow didn't lose the €250. Fixed by adding to the `availableInterest -=` chain; drift shifted by exactly −€250 as theory predicted.

**Scope 2 close (Sprint 5, 2026-04-23):** Retired via `lib/clo/senior-expense-breakdown.ts` extraction — same template as D4's `pool-metrics.ts`. The IC numerator and the cash-flow chain in `projection.ts`'s normal-mode period loop now both derive from the same `SeniorExpenseBreakdown` object: the IC path calls `sumSeniorExpensesPreOverflow(breakdown)`, the cash-flow path calls `applySeniorExpensesToAvailable(breakdown, availableInterest)`. Two-path drift eliminated in normal mode.

**Scope 3 (still open) — cross-site field-enumeration consistency:** The Scope 2 closure applies only to the normal-mode period loop. Two OTHER engine sites still maintain hardcoded six-field senior-expense enumerations:

1. **Accelerated executor** (`runPostAccelerationWaterfall`, lines 661-668 in `projection.ts` — function declared at line 652): hardcoded `seniorPaid = { taxes: pay(input.seniorExpenses.taxes), issuerProfit: pay(...), trusteeFees: pay(...), adminExpenses: pay(...), seniorMgmtFee: pay(...), hedgePayments: pay(...) }`. Single-path (no internal parallel-accumulator bug) but DOES hardcode the full field list at a site separate from the normal-mode breakdown.
2. **T=0 initialState.icTests** (line 1271 in `projection.ts`): hardcoded subtraction `scheduledInterest − taxesAmountT0 − issuerProfitAmountT0 − trusteeFeeAmountT0 − adminFeeAmountT0 − seniorFeeAmountT0 − hedgeCostAmountT0`. Also single-path internally but maintains its own field enumeration.

**Concrete failure mode:** a future KI that adds a new senior expense (e.g., modeling KI-02 Expense Reserve top-up at step (D)) would update the `SeniorExpenseBreakdown` type and the normal-mode callsite picks it up automatically (Scope 2 closure win). BUT the accel executor + T=0 initialState would silently skip the new expense until a reader remembers to touch those sites. That's the vigilance-based maintenance Scope 2 was supposed to retire — just scoped narrowly.

**Path to close (Scope 3):** Extend the breakdown's use to the other two sites:
- Accel executor: accept a `breakdown: SeniorExpenseBreakdown` instead of the current field-by-field `seniorExpenses` param. Internal `pay(...)` loop iterates the breakdown's fields in PPM order. Callers (the accel branch in the period loop) pass the same breakdown they already construct.
- T=0 initialState: construct a `SeniorExpenseBreakdown` at T=0 using quarterly rates instead of per-period amounts, then call `sumSeniorExpensesPreOverflow(breakdownT0)` once. Removes the hardcoded subtraction chain.

Refactor scope is local: extend the breakdown's use to two more callsites with N1-harness re-verification. Forcing function: a new senior expense (KI-02 Expense Reserve would be the natural trigger).

**Verification (Sprint 5, Scope 2 only):** Full suite green with unchanged numerical output. KI-13a expected drift unchanged at −€50,992.24 ± €50, KI-12b markers unchanged, KI-IC-AB/C/D markers unchanged. The refactor consolidated the normal-mode representation; it did not change any computed amount.

**Tests:** `lib/clo/__tests__/senior-expense-breakdown.test.ts` covers the helpers' arithmetic and PPM-order truncation. Full waterfall correctness regression remains in `n1-correctness.test.ts`.

---

<a id="ki-24"></a>
### [KI-24] E1 citation propagation coverage is partial (8 deferred paths)

**Context:** Sprint 5 / E1 shipped PPM citation propagation on three partner-facing surfaces: `ResolvedPool`, `ResolvedFees`, `ResolvedEodTest`. Partner hovering the Pool or Fees header sees "Source: PPM p.23, 27, 287, 295" / "p.22, 23, 146" / "p.207, 208 (OC Condition 10(a)(iv))" as intended.

**What's NOT covered (surfaced in the E1 subagent's completion report):** Eight ppm.json source-annotated paths carry `source_pages` or `source_condition` but don't yet propagate into partner-facing tooltips. Enumerated:

1. `section_1_deal_identity.source_pages = [1, 17, 18, 19, 240, 327]` — no current consumer; would tooltip a deal-identity header.
2. `section_2_key_dates.source_pages = [18, 19, 20, 21, 22]` — could attach to `ResolvedDates` (maturity / reinvestment end / non-call). Intentionally omitted from E1 scope; reasonable follow-up.
3. `section_3_capital_structure.source_pages = [18]` — per-tranche citations. E1 explicitly excluded `ResolvedLoan` / `ResolvedTrigger` per scope.
4. `section_4_coverage_tests.source_pages = [28, 207, 208]` — section-level page range. Only the EoD subsection is plumbed; class-level OC / IC triggers would need per-trigger citations on `ResolvedTrigger`.
5. `section_6_waterfall.source_condition = "OC Condition 3(c)"`, `source_pages = [176, 179]` + `post_acceleration_priority_of_payments.source_condition = "OC Condition 10"` — no current `Resolved*` consumer for waterfall shape (engine implements the waterfall; no partner-facing tooltip surface today).
6. `section_7_interest_mechanics.source_condition` — flows through `constraints.interestMechanics` passthrough; no partner-facing slider rooted in it today.
7. `section_8_portfolio_and_quality_tests.source_pages.{moodys_matrix, fitch_matrix}` — rating-matrix-specific pages. Only `portfolio_profile` and `collateral_quality_tests` are folded into `poolSummary.citation`; matrix pages intentionally omitted (not partner-facing fields).
8. `section_9_collateral_manager_replacement.source_pages = [313, 318]` — no UI surface today.

**Partner-visible impact:** A partner asking "where does this Class A/B OC test trigger come from?" sees no citation on the OC row today (coverage gap #4). Same for reinvestment-period-end date (gap #2), class coupon formulas (gap #3), waterfall clause-level references (gap #5). E1 shipped the pattern; extending it to these eight paths is mechanical but not free.

**Path to close:**
- **Tier 1 (partner-demo value):** Key dates + class-level OC/IC triggers. Most frequent partner questions are "where's this date/trigger from?" Add `citation?` field to `ResolvedTrigger` + `ResolvedDates`; populate in resolver from `section_4` + `section_2` provenance. Wire tooltips into the trigger display + dates display.
- **Tier 2 (institutional completeness):** Per-tranche citations + waterfall section citations. Requires extending `ResolvedTranche` (partner tranche panel tooltips) and introducing a waterfall-rendering surface that doesn't exist today.
- **Tier 3 (rating matrix, misc):** Moody's / Fitch rating matrix pages; collateral manager replacement section. Low-demand surfaces.

Tier 1 closes the most common partner "where from?" questions; Tier 2+ wait for specific asks.

**Test:** No standalone test required until each deferred path ships. When a path lands, extend the existing `e1-citation-propagation.test.ts` with a per-surface assertion.

---

<a id="ki-22"></a>
### [KI-22] Fixture-regeneration test was a field-by-field spot check, not full-equality — CLOSED (Sprint 4, 2026-04-23)

**Pre-fix behavior:** Sprint 0 shipped `fixture-regeneration.test.ts` framed as a "drift canary" — running the current resolver on `fixture.raw` and verifying output matches `fixture.resolved`. The stated purpose: permanent drift protection so the fixture stays canonical as the resolver evolves.

**What the test actually did:** Checked 5 specific assertions on a handful of fields (`principalAccountCash`, `impliedOcAdjustment`, ocTriggers length, eventOfDefaultTest.triggerLevel, totalPrincipalBalance + two fee fields). Any resolver change that populated a NEW field, or changed a field NOT in that narrow list, passed silently.

**How this surfaced:** Sprint 4 / D4. Added `top10ObligorsPct` to `ResolvedPool`, expected the fixture-regeneration test to fail and guide the fixture update. It did not. Investigation revealed the spot-check nature. Extending to a full iterator immediately surfaced two additional drifts that had been latent:

1. **`pctSecondLien: 0 → null`**: drift since Sprint 0. Resolver intentionally emits null when the source doesn't carry a dedicated pctSecondLien column (it's combined with HY/Mezz/Unsecured in a 4-category bucket). Sprint 4 fix: resolver now infers `pctSecondLien: 0` when `pctSeniorSecured === 100` (mutually exclusive lien categories make 0 certain). Fixture patched to match new resolver output.
2. **`reinvestmentOcTrigger.rank: 99 → 7`**: Sprint 0-era fixture used the fallback "no-OC-triggers" rank 99; fresh resolver correctly computes `mostJuniorOcRank = 7` (Class F). Fixture patched.

Both drifts had been invisible for ~20 days of active development. Every "fixture is canonical" claim across Sprint 1-3 was built on the spot-check illusion.

**Fix (Sprint 4):** Extended `fixture-regeneration.test.ts` with a recursive full-equality iterator. Walks every field on top-level `resolved.*` (skipping volatile `metadata` + large `loans` array), compares fresh vs stored with named mismatch reports, numeric fields use 1e-4 relative tolerance. Fails with "fieldPath: fresh=X vs stored=Y" on any drift.

**Current behavior:** 566/566 green, full-equality guard active. Next new `ResolvedDealData.*` field or any silent resolver change will trip the guard immediately.

**Path to close:** Closed in Sprint 4. Follow-up (lower priority): extend coverage to the `loans` array — currently skipped because per-field drift on 400+ loans would produce unmanageable test output for a single resolver change. If needed, add a separate loan-shape regeneration test that samples a few canonical loans or compares aggregates.

**Tests:** `fixture-regeneration.test.ts > "every top-level resolved.* field matches fresh resolver output (recursive full-equality)"`.

---

<a id="ki-20"></a>
### [KI-20] D2 legacy escape-hatch on 6 test-factory sites (Sprint 4)

**Context:** Sprint 4 shipped D2 (per-position WARF hazard) as the engine's production default. Legacy test factories that predate D2 compute expected defaults from `defaultRatesByRating[ratingBucket]` hand-math — under the new default they would fail (bucket rate ≠ WARF-derived per-position rate). Rather than re-baselining ~30 hand-computed expected values in one PR, the factories were pinned to `useLegacyBucketHazard: true` as a bridge.

**Current engine behavior:** Production default = per-position WARF hazard. Six test-factory sites explicitly opt into legacy bucket behavior:
1. `lib/clo/__tests__/test-helpers.ts:makeInputs` (shared factory, ~5 test files consume)
2. `lib/clo/__tests__/projection-edge-cases.test.ts:makeSimpleInputs`
3. `lib/clo/__tests__/projection-edge-cases.test.ts:makeMultiTrancheInputs`
4. `lib/clo/__tests__/projection-cure.test.ts:makeRealisticInputs`
5. `lib/clo/__tests__/projection-structure.test.ts:makeFullDealInputs`
6. `lib/clo/__tests__/projection-structure.test.ts:makeFeeTestInputs` (local to one describe block)

**Partner-visible impact:** None on production behavior — Euro XV runs through `buildFromResolved`/`defaultsFromResolved` which is NOT pinned to legacy. N1 / N6 / B1 / B2 / C1 / C2 / C3 tests all run on per-position hazard already and pass (D2's precision benefit is materially visible only in stress scenarios with concentrated sub-bucket exposure, not in Euro XV base case).

**Path to close:** For each of the 6 test factories, (a) determine which tests it serves actually depend on hand-computed default-hazard math (as opposed to just wanting plausible defaults for other mechanics), (b) for math-dependent tests, re-baseline expected values to the per-position formula, (c) remove the legacy pin from the factory once all its tests re-baseline, (d) delete `useLegacyBucketHazard` entirely once no pin sites remain.

**Forcing function:** Engine emits `console.warn` when `useLegacyBucketHazard: true` is passed (`projection.ts`, one-shot per `runProjection` call). Test output surfaces the deprecation so a future developer sees it in CI. Without the warn, flag becomes permanent tech debt framed as temporary.

**Sequencing:** Each factory is independent of the others; can be re-baselined one at a time. Not a Sprint 4 blocker.

**Test:** No standalone marker. Closure signal is: all six pin sites deleted, `useLegacyBucketHazard` field removed from `ProjectionInputs`, full suite green.

---

<a id="ki-19"></a>
### [KI-19] NR positions proxied to Caa2 for WARF — Moody's CLO methodology convention

**Moody's methodology reference:** "Moody's Global Approach to Rating Collateralized Loan Obligations" / CLO rating methodology: **unrated positions are treated as Caa2 (WARF=6500) unless the manager has obtained and documented a shadow rating on the position.** This is the conservative default — it prevents NR-heavy portfolios from understating expected credit risk.

**Current engine behavior (Sprint 3):** `BUCKET_WARF_FALLBACK.NR = 6500` (Caa2). An earlier design considered a B2 midpoint (2720, non-investment-grade proxy) but was rejected because it understates WARF drift under NR-concentrated reinvestment scenarios, which materially affects C1's WARF enforcement (a reinvestment at "NR" would appear to improve WARF when Moody's would treat it as worsening).

**PPM-correct behavior:** Matches current engine (Caa2 = 6500). Decision documented for audit clarity; not an open item.

**Quantitative magnitude:** On Euro XV (12 NR positions, ~2.8% of par), NR=6500 vs NR=2720 shifts T=0 engine WARF by ~100 WARF points. That's material relative to the 113-point trigger cushion (3148 vs 3035). Engine-trustee WARF parity is tighter under the 6500 convention.

**Decision status:** CLOSED — 6500 convention shipped Sprint 3. Tracked here so a future reviewer sees the rationale (B2=2720 would have been a partner-visible under-enforcement).

**Alternative considered:** Make NR fallback a user input so the partner can override (e.g., when managers have obtained shadow ratings). Not done in Sprint 3 — adds UI surface without clear demand. Revisit if a deal ships NR loans with documented shadow ratings.

**Test:** `c2-quality-forward-projection.test.ts > "every period has a qualityMetrics object with finite numbers"` covers the path. Explicit NR-convention test could be added when a fixture with meaningful NR concentration arrives.

---

<a id="ki-25"></a>
### [KI-25] UI back-derivation of engine values — CLOSED (2026-04-29)

**Incident reference:** April 2026 "missing €1.80M of interest residual" investigation. Two confidently-wrong diagnoses across two LLM agents and the user before root cause was identified.

**Pre-fix behavior:** `web/app/clo/waterfall/PeriodTrace.tsx:13-14` back-derived `equityFromInterest` as `Math.max(0, period.equityDistribution - principalAvailable)` from totals. When `principalAvailable` exceeded the residual, this silently dropped clause-DD distribution from the displayed trace. A second instance: `ProjectionModel.tsx:374` independently re-computed `bookValue` with the same formula the engine emits — two parallel implementations of the same calculation.

**Quantitative magnitude:** UI displayed €0 instead of €1.80M of equity-from-interest in Q1 of Euro XV. Engine output was correct throughout; the UI was lying about which values came from where. No engine number was wrong.

**Fix:**
1. `period.stepTrace.equityFromInterest` and `equityFromPrincipal` now consumed directly by the UI via `web/app/clo/waterfall/period-trace-lines.ts` (pure helper). `PeriodTrace.tsx` is now a thin renderer over engine output.
2. `result.initialState.equityBookValue` and `result.initialState.equityWipedOut` added to engine output. UI reads these directly; the parallel UI computation deleted.
3. Service module `web/lib/clo/services/inception-irr.ts` extracted from inline UI useMemo — accepts engine output + user inputs, returns IRR result. Pure-function, unit-tested.
4. AST enforcement test `lib/clo/__tests__/architecture-boundary.test.ts` codifies four anti-patterns (UI arithmetic on `inputs.*`, back-derivation from `period.equityDistribution`, raw reads of `resolved.principalAccountCash` in arithmetic, re-deriving `Math.max(0, loans - debt)` book-value formula). Per-occurrence opt-out via `// arch-boundary-allow: <ruleId>`.

**Path to close:** Closed. See `CLAUDE.md § Engine-as-Source-of-Truth (CLO modeling)` for the layering rules and `/docs/plans/2026-04-29-engine-ui-separation-plan.md` (repo root, not `web/docs/`) for the full implementation history.

**Tests:** `app/clo/waterfall/__tests__/period-trace-lines.test.ts` (engineField completeness + per-row engine equality + acceleration handling). `lib/clo/__tests__/inception-irr.test.ts` (default anchor, user override, counterfactual, terminal, empty, subNotePar≤0, equityWipedOut, plus the post-v6 plan §3.2 mark-to-model modes). `lib/clo/__tests__/architecture-boundary.test.ts` (regression-prevention).

---

<a id="ki-26"></a>
### [KI-26] Reserve account opening balances dropped (Interest, Smoothing, Supplemental, Expense)

**PPM reference:** Condition 3.3 (account hierarchy); Condition 1 (Account definitions). Five PPM-defined accounts: Principal Account, Interest Account, Interest Smoothing Account, Supplemental Reserve Account, Expense Reserve Account.

**Current engine behavior:** `web/lib/clo/resolver.ts:1050-1076` extracts and emits four balances on `ResolvedDealData.accountBalances`: `interestAccountCash`, `interestSmoothingBalance`, `supplementalReserveBalance`, `expenseReserveBalance`. The type declaration at `web/lib/clo/resolver-types.ts:62-78` carries the explicit comment for each: *"Resolver-exposed only; not wired into engine OC math."* Only `principalAccountCash` is consumed by the engine. The four reserve balances are present in `EMPTY_RESOLVED` (`build-projection-inputs.ts:31-34`, all set to 0 — note this is the empty `ResolvedDealData` placeholder, NOT `DEFAULT_ASSUMPTIONS`; `UserAssumptions` does not have these fields) but are not propagated into `ProjectionInputs` or read anywhere in `projection.ts`. Verified by grep: zero references in `web/lib/clo/projection.ts` and zero references in `web/app/clo/` (the trace renderer does not display them either).

**PPM-correct behavior:** Each account participates in the waterfall on a per-deal basis defined by the PPM:
- **Interest Account** opening balance flows into the first-period `availableInterest` ahead of step (A)(i).
- **Interest Smoothing Account** balance is conditionally drawable under the smoothing mechanism (Condition 1; interacts with Frequency Switch Event).
- **Supplemental Reserve Account** balance is available for reinvestment use during the Reinvestment Period and for redemption thereafter.
- **Expense Reserve Account** balance offsets near-future senior-expense draws (steps B/C/Y/Z) — not fresh income, but a cure against cap-overflow.

Each affects partner-facing OC numerator (where the PPM routes the account into CPA), available-for-distribution, or both.

**Quantitative magnitude:** All four balances are 0 in the Euro XV Q1 2026 fixture, so today's harness is unaffected. Latent. On any deal where a partner has built a Supplemental Reserve over multiple quarters (CM-discretionary; sized at 25 bps × pool = ~€1.2M on a €493M pool), the engine silently ignores that cash claim against equity. Magnitude scales linearly with the reserve practice.

**Deferral rationale:** The resolver's own comment cites "deal-specific per the PPM" as the reason for non-integration — i.e., we don't know which accounts flow into which CPA buckets without reading each deal's indenture. That is a real complication, not a free pass: the engine still treats the four accounts as if they didn't exist, which is wrong for any deal that has them populated. Distinct from KI-02 (step D Expense Reserve *deposit*) and KI-05 (step BB Supplemental Reserve *deposit*) — those cover *flows into* the accounts; this entry covers the *opening balance* that should already be on the engine's books at T=0.

**Path to close:**
1. Add the four reserve balances as fields on `ProjectionInputs` (currently absent — only on `UserAssumptions` defaults).
2. Plumb from `ResolvedDealData.accountBalances` into `ProjectionInputs` via `build-projection-inputs.ts`.
3. In the engine's first-period waterfall, add Interest-Account opening balance into `availableInterest` ahead of step (A)(i). Decide and document the canonical routing for the other three (per-deal PPM read in the resolver, or a `reserveAccountRouting` configuration object).
4. Track all four reserve balances as engine state across periods (analogous to `principalAccountCash`); allow draws and deposits per their respective PPM mechanics. Interest Account drains in Q1; Smoothing/Supplemental/Expense persist multi-period.
5. Surface each balance in `stepTrace.openingAccountBalances` so the partner-facing trace is auditable.
6. The fixture-regeneration full-equality iterator (KI-22) already enforces round-trip on `resolved.accountBalances` — no extension needed there.

**Test:** No active marker on Euro XV (all four balances null/zero by construction → drift = 0). When the fix lands, add `KI-26-accountSeed` against a synthetic fixture where one of the four reserves has a non-zero opening balance, asserting the corresponding waterfall row reflects the seed.

---

<a id="ki-27"></a>
### [KI-27] Pre-existing tranche `deferredInterestBalance` dropped at projection start

**PPM reference:** Tranche-specific deferred-interest accumulation (PPM steps K, N, Q, T for Class C/D/E/F deferred interest); Condition 12 (PIK accrual mechanics on subordinate notes).

**Current engine behavior:** Verified end-to-end:
- `web/lib/clo/types/entities.ts:112` declares `deferredInterestBalance: number | null` on the raw tranche-snapshot type.
- `web/lib/clo/extraction/schemas.ts:252` requests it during PPM/SDF extraction.
- `web/lib/clo/extraction/prompts.ts:364` instructs extraction to populate it.
- `web/lib/clo/access.ts:566` reads it from the database (`row.deferred_interest_balance`).
- `web/lib/clo/backtest-types.ts:37, 83, 122` propagates it through the backtest types.
- **`web/lib/clo/resolver-types.ts:94-107` (`ResolvedTranche`) has no `deferredInterestBalance` field.** The data path stops at the resolver.
- **`web/lib/clo/projection.ts:1141` initializes `deferredBalances[t.className] = 0` unconditionally** for every tranche on every projection.

The per-period deferred-accrual logic (search `deferredAccrualByTranche`) correctly *grows* the deferred balance when interest cannot be paid current (`projection.ts:2187-2194`) and *pays it down* when residual interest becomes available (`projection.ts:1956-1958` at maturity/call; `projection.ts:2173-2178` on diversion). Only the T=0 seed is wrong — it always starts at zero.

**Compounding interaction (matters for the fix):** the dual-bucket structure means when `deferredInterestCompounds = true` (the default), per-period shortfalls compound INTO `trancheBalances` (lines 2175, 2190); only `deferredInterestCompounds = false` accumulates in `deferredBalances`. The seed at line 1141 thus matters most when compounding is disabled. When compounding is enabled, the question is whether the trustee's `deferredInterestBalance` field is a *separate-non-compounding-bucket* number or a *cumulative-PIK-since-issuance* number — if the latter, prior PIK has already been included in the snapshot's `endingBalance` (which seeds `trancheBalances` at line 1140 via `t.currentBalance`), and naively also seeding `deferredBalances` from `deferredInterestBalance` would double-count. The semantics of the trustee field need to be documented in the resolver before the fix lands.

**PPM-correct behavior:** Forward projection's tranche state must initialize each `deferredBalances[t.className]` from the deal's current deferred balance (the value extracted into the trustee_balance row). Subsequent-period mechanics already work correctly.

**Quantitative magnitude:** All 8 trustee snapshots in the Euro XV Q1 2026 fixture have `deferredInterestBalance: null` (`fixtures/euro-xv-q1.json:12526, 12554, 12582, 12610, 12638, 12666, 12694, 12722`). Latent on Euro XV. On any deal where one or more mezzanine/junior tranches are actively deferring interest at projection start (typical for distressed European CLOs in the post-2020 / 2022 cohort, particularly Class E and Class F under stress), equity IRR is over-stated by approximately the entire prior deferred balance plus its projected accrual over remaining periods. For a Class E with €5M of accumulated PIK at 8% coupon (quarterly compounding) and 5 remaining years, that compounds to €5M × (1 + 0.08/4)^20 = ~€7.43M of equity-distribution overstatement (undiscounted), roughly 18.5pp on a €42M sub note book value at 95c.

**Deferral rationale:** Latent on Euro XV (no class is deferring at Q1 2026). Surfaces immediately on any deal whose extraction yields a non-null deferred balance. The data is collected; only the resolver-and-projection plumbing is missing.

**Path to close:**
1. Add `deferredInterestBalance: number | null` to the `ResolvedTranche` interface (`web/lib/clo/resolver-types.ts:94-107`).
2. Populate from `raw.trancheSnapshots[*].deferredInterestBalance` in the tranche-resolution block of `web/lib/clo/resolver.ts`.
3. In `web/lib/clo/build-projection-inputs.ts`, plumb the field through to whatever shape `projection.ts:1141` reads tranches from (currently `tranches[t.className]`).
4. Replace `deferredBalances[t.className] = 0` at `projection.ts:1141` with seed logic that respects `deferredInterestCompounds`: under non-compounding, `deferredBalances[t.className] = t.deferredInterestBalance ?? 0`; under compounding, verify whether `currentBalance` (post-PIK trustee `endingBalance`) already includes the deferred amount — if so, no extra seeding needed; if not, add to `trancheBalances` instead. Document the trustee field semantics in the resolver.
5. Verify the per-period deferred-accrual logic correctly uses the seed: at `projection.ts:2173-2194` (deferred-routing on diversion + shortfall) and `projection.ts:1956-1958` (deferred-paydown at maturity/call), confirm the seeded balance is consumed correctly in both paths.
6. The fixture-regeneration full-equality iterator (KI-22) will catch the new resolver field automatically.

**Test:** Add `KI-27-deferredSeed` `failsWithMagnitude` marker against a synthetic fixture where Class E starts with €5M deferred. Assertion: forward equity-distribution drift relative to the seed=0 baseline equals at least €5M (the deferred balance itself never returns to equity until paid current). No active marker on Euro XV (null seeds → drift = 0 by construction); marker fires the moment a real deal produces non-null deferred values.

---

<a id="ki-28"></a>
### [KI-28] Asset-side fixed-rate loans accrue on Actual/360 (mirrored tranche uses 30/360)

**PPM reference:** Per-instrument day-count convention. Floating instruments accrue on Actual/360 (European standard); fixed instruments accrue on 30/360 (US) or 30E/360 (European Eurobond basis). The PPM specifies the convention per tranche; market practice for fixed-rate loans matches the bond convention (30/360 or 30E/360).

**Current engine behavior:** `web/lib/clo/projection.ts:1382-1383` correctly defines `trancheDayFrac(t)` as `t.isFloating ? dayFracActual : dayFrac30` and applies it on the liability side (lines 1761, 2075, 2136, 2239). On the asset side, the engine treats fixed and floating loans identically:

- `web/lib/clo/projection.ts:1576`: `interestCollected += loanBegPar * (loan.fixedCouponPct ?? 0) / 100 * dayFracActual;` — fixed-rate branch uses `dayFracActual`.
- `web/lib/clo/projection.ts:1578`: `interestCollected += loanBegPar * (flooredBaseRate + loan.spreadBps / 100) / 100 * dayFracActual;` — floating branch also uses `dayFracActual`.

The convention for the asset side is asymmetric with the liability side: a Class B-2 fixed-rate tranche accrues on 30/360 in the engine (correctly), but a fixed-rate loan on the asset side that funds it accrues on Actual/360. Across a 91-day quarter that is `91/360 = 0.2528` vs `90/360 = 0.2500` — about 11 bps of one period's interest on the fixed-rate slice.

**PPM-correct behavior:** Asset-side accrual should mirror the loan's coupon convention. A fixed-rate loan typically accrues on 30/360 (matching the underlying bond). The engine should use a per-loan day-count fraction (`loan.isFixedRate ? dayFrac30 : dayFracActual`).

**Quantitative magnitude (measured 2026-04-30):** Euro XV fixed-rate share = **7.39%** (42 of 413 loans, €36,455,217 of €493,252,343 total par). Par-weighted average fixed coupon = **4.28%**. Period drift on a 91-day quarter ≈ `0.0739 × €493M × 0.0428 × (1/360) ≈ €4,335`; over a 10-year projection ≈ €43K cumulative. Smaller order than KI-12b (which moves the entire €493M floating slice by one day), but non-zero and now pinnable. **Convention question (30/360 US vs 30E/360) remains open — see step 1 below.**

**Deferral rationale:** Confessed asymmetry between the asset and liability day-count branches. The fix is small in code but needs Euro XV-specific PPM/trustee verification of which fixed-rate convention applies to the underlying loan obligor (30/360 vs 30E/360) before being committed.

**Path to close:**
1. Verify against Euro XV trustee report and loan-level documentation which fixed-rate convention applies per loan. Fixture census: 31 of 42 fixed-rate loans tag "30/360 (European)" → **30E/360** (both endpoints capped at 30, no anchor rule); 4 loans "30/360 (EOM)"; 4 loans "30E/360 (ISDA)"; 2 loans "30/360 (US)"; 1 loan "Actual/365". The majority convention for Euro XV fixed-rate is 30E/360, NOT 30/360 US.
2. **Extend `dayCountFraction` (`projection.ts:841-860`).** It currently supports only `"actual_360"` and US `"30_360"` (clamps day-of-month per ISDA §4.16(f) anchor rule). Add a `"30e_360"` branch (both endpoints capped at 30, no anchor rule) and an `"actual_365"` branch (days / 365). This must land before step 3 — otherwise step 3 will use the wrong convention for the majority of Euro XV fixed-rate positions.
3. Add a per-loan day-count branch at `projection.ts:1576-1578`: replace the unconditional `dayFracActual` with `(loan.isFixedRate ? dayFracFixed : dayFracActual)` where `dayFracFixed` is computed from the loan-level day-count convention via the extended `dayCountFraction` from step 2.
4. Add unit tests parallel to `b3-day-count.test.ts`: (a) a synthetic 7%-coupon fixed-rate loan with 30E/360 convention on a 91-day period producing interest equal to `par × 7% × 90/360`; (b) a synthetic Actual/365 loan over a 91-day period producing `par × coupon × 91/365`.
5. Re-baseline N1 harness for the measured ~€4.3K/quarter shift on Euro XV's 7.39% fixed slice.

**Test:** No active marker today. When the fix lands, add `KI-28-assetFixedDayCount` to `b3-day-count.test.ts` pinning the 30/360 (or 30E/360) convention on a synthetic fixed-rate loan over a 91-day period.

---

<a id="ki-29"></a>
### [KI-29] Discount / long-dated obligation haircuts are static snapshots, not recomputed forward

**PPM reference:** Condition 1 ("Discount Obligation", "Long-Dated Obligation"); Condition 10(a)(iv) Adjusted Collateral Principal Amount construction. Discount obligations carry the LESSER of par and purchase price into the OC numerator (typically: positions purchased below 80c are valued at purchase price until they trade above some recovery threshold). Long-dated obligations (those maturing past the deal's stated maturity) take a separate haircut.

**Current engine behavior:** `web/lib/clo/projection.ts:189-190` declares `discountObligationHaircut` and `longDatedObligationHaircut` as scalar `ProjectionInputs` fields. Both are sourced from `resolver.ts:1083-1088`, which sums `parValueAdjustments` rows filtered by `adjustmentType === "DISCOUNT_OBLIGATION_HAIRCUT"` / `"LONG_DATED_HAIRCUT"` (extracted from the compliance report at report date), and applied unchanged at:

- `projection.ts:1241` — T=0 OC numerator construction.
- `projection.ts:1994` — every period's OC numerator construction.

The engine never recomputes either haircut as the pool composition evolves through reinvestment, default, or aging. A loan purchased post-T0 below the discount threshold is not flagged as a new discount obligation; a loan whose maturity ages past the deal's maturity does not become long-dated.

**PPM-correct behavior:** Both haircuts are pool-state-dependent and must be recomputed per period:
- **Discount Obligation:** for each loan, the haircut at period T is `max(0, par − marketValue × par)` if the loan is currently classified as a discount obligation. Classification depends on purchase price relative to the threshold and a "cure" mechanism (the loan exits the discount-obligation status once it trades above the recovery threshold).
- **Long-Dated Obligation:** for each loan, haircut at period T fires if `loan.maturityDate > deal.maturityDate − k_quarters` (k specified by PPM). As loans roll into reinvestment, the long-dated bucket grows or shrinks.

**Quantitative magnitude:** On Euro XV at T=0 the haircuts are populated from the trustee snapshot and ride correctly. As reinvestment progresses (typical European CLO has 4–5 years of reinvestment), reinvested loans purchased at distressed prices in stress scenarios are not flagged. Bias grows monotonically through the projection. Materiality scales with the stress scenario: a 50% CDR + 70% recovery scenario typically induces 5-10% of the pool into discount-obligation status at the trough, none of which is captured by the static haircut. Effect is on partner-facing OC ratios in the back half of the projection.

**Deferral rationale:** Snapshot-based forward modeling is a deliberate simplification — recomputing the haircut requires per-loan purchase-price tracking through reinvestment, which the loan-state engine does not currently maintain. Distinct from KI-04 (cadence) and KI-12a (period mismatch).

**Path to close:**
1. Extend `LoanState` (`projection.ts`) with `purchasePricePct: number | null` and `acquisitionDate: string | null` for reinvested loans.
2. In the reinvestment loan-synthesis path (`projection.ts:1631-1635, 2273`), record the synthesized purchase price on the new `LoanState`.
3. Each period, compute `currentDiscountObligationHaircut` as the sum over loans where `purchasePricePct < deal.discountThreshold` of `(par − purchasePricePct × par)`, and `currentLongDatedObligationHaircut` as the sum over loans where `loan.maturityDate > deal.maturityDate`. Replace the static `discountObligationHaircut` / `longDatedObligationHaircut` fields with the per-period computed values at lines 1241 and 1994.
4. Decide cure mechanics for the discount-obligation classification (PPM-specific; either "permanent until paid" or "cure on price ≥ threshold for N consecutive periods"). Document the choice.

**Test:** No active marker. When the fix lands, add `KI-29-discountObligationDynamic` with a synthetic fixture that reinvests at 75c and asserts the per-period haircut reflects the new position. Also extend the C2 forward-projection test (`c2-quality-forward-projection.test.ts`) to cover OC parity over a multi-period horizon under reinvestment-at-distressed-price scenarios.

---

<a id="ki-30"></a>
### [KI-30] CCC bucket limit (7.5%) and CCC market-value (70%) hardcoded, never PPM-extracted

**PPM reference:** Condition 1 ("CCC Excess"), Condition 10(a)(iv) Adjusted CPA construction. CCC concentration cap (typically 7.5% for European CLOs but can range 5%-17.5%); CCC market-value floor for haircut computation (typically 70% but can be 60%-80% or PPM-defined per-position recovery rate).

**Current engine behavior:** `web/lib/clo/defaults.ts:38-39` declares `cccBucketLimitPct: 7.5` and `cccMarketValuePct: 70` as global constants. `build-projection-inputs.ts:62-63, 127-128, 470-471` propagates them from `CLO_DEFAULTS` to `UserAssumptions` to `ProjectionInputs`. Engine consumes them at the CCC excess haircut block (search `cccBucketLimit`). Neither the resolver nor any extraction module pulls per-deal CCC thresholds — the 7.5% / 70% values are baked in for every projected deal.

**PPM-correct behavior:** Per-deal extraction from the PPM. The CCC thresholds live in Condition 1 definitions (CCC Excess, CCC Concentration Limitation) and Condition 10. Each deal can specify its own values; treating them as universal constants is a Euro-XV-specific shortcut.

**Quantitative magnitude:** Zero on any deal whose actual PPM specifies 7.5% / 70% (most European post-2014 CLOs). Material on deals with different thresholds — a deal specifying 17.5% / 60% would silently apply 7.5% / 70% in the engine. Direction of error: more conservative on the bucket cap (we apply a stricter cap than the deal allows, under-stating OC) and more aggressive on the market value floor (we credit more market value than the deal allows, over-stating OC). Two-sided latent error of unknown magnitude on non-Euro-XV deals.

**Deferral rationale:** Latent — Euro XV's actual values are 7.5% / 70%. Distinct from KI-19 (NR=Caa2 — that is a Moody's methodology constant; this entry is about per-deal PPM constants).

**Path to close:**
1. Add `cccBucketLimitPct: number | null` and `cccMarketValuePct: number | null` to the PPM extraction schema (`web/lib/clo/extraction/schemas.ts` and `prompts.ts`) under Condition 1 / Condition 10.
2. Read both into `ResolvedDealData` in the resolver.
3. In `build-projection-inputs.ts`, prefer the resolved value over `CLO_DEFAULTS` when available, falling back to the constant only when extraction returned null. Emit a `severity: warn` warning when the fallback fires (per the existing pattern at `resolver.ts:817`).
4. Update the C2 quality-forward-projection test to assert the pinned values for Euro XV match resolver-extracted, not constants.

**Test:** No active marker. When the fix lands, add a resolver test that asserts Ares Euro XV PPM extracts to 7.5% / 70% (smoke test for the extraction path). Add a synthetic-deal test where the PPM specifies 17.5% / 60% and verify the engine applies those values, not the defaults.

---

<a id="ki-31"></a>
### [KI-31] Hedge cost bps never extracted; engine emits zero on every hedged deal

**PPM reference:** Condition 1 ("Hedge Agreement", "Hedge Counterparty"); step (F) `hedgePaymentPaid` in the interest waterfall. Many European CLOs carry an interest-rate hedge or cross-currency hedge whose periodic cost runs through step (F).

**Current engine behavior:** `web/lib/clo/build-projection-inputs.ts:131` defaults `hedgeCostBps: 0`. The engine consumes `hedgeCostBps` at `projection.ts:1698` as `beginningPar * (hedgeCostBps / 10000) * dayFracActual` and emits `stepTrace.hedgePaymentPaid`. End-to-end engine plumbing exists. **No extraction site populates `hedgeCostBps` from PPM or trustee data** — neither `resolver.ts` nor `extraction/` references the field. The engine emits 0 at step (F) on every projection.

Verified live on Euro XV: N1 harness diagnostic table shows `hedgePaymentPaid | f | 0.00 | 0.00 | 0.00 | 50.00 | ✓` — both engine and trustee report 0. Euro XV is Euro-investing-in-Euro-loans with no hedge schedule, so the default is correct *for Euro XV specifically*.

**PPM-correct behavior:** For deals with a hedge, the per-period hedge cost is extracted from the PPM (typical: a fixed bps × notional schedule, or a swap leg paying fixed receiving floating). Engine should consume the extracted value rather than zero.

**Quantitative magnitude:** Zero on Euro XV. On any hedged deal — rough estimate, US BSL CLOs and a meaningful share of European deals (deals investing in non-EUR loans, deals with interest-rate hedges) — engine will silently emit 0 for step (F) when the trustee reports a non-zero amount, with the residual cascading into `subDistribution`. Magnitude scales with the hedge notional × cost; on a deal with a 30 bps hedge cost on a €100M notional, that is €75K/quarter.

**Deferral rationale:** Latent on Euro XV (no hedge). Distinct from KI-06 (defaulted hedge termination at step AA — that activates only on counterparty default).

**Path to close:**
1. Add `hedgeCostBps` (or a structured `hedgeSchedule: { notional, fixedRate, floatingIndex, ... }` if the PPM mechanic is more complex) to the extraction schema.
2. Populate from PPM Condition 1 ("Hedge Agreement") in the resolver.
3. Replace the hardcoded `0` at `build-projection-inputs.ts:131` with the resolver-extracted value (or null when no hedge), with the existing 0 fallback.
4. Verify against a hedged-deal trustee report once one is available; cross-check engine's step (F) emission against the trustee.

**Test:** No active marker on Euro XV (engine 0, trustee 0). When extraction support lands, add a resolver test pinning the extracted bps for any hedged-deal fixture, and an N-harness test verifying step (F) tie-out.

---

<a id="ki-32"></a>
### [KI-32] Per-position agency recovery rates ignored for forward defaults (used only for pre-existing defaulted positions)

**PPM reference:** Loan-level recovery is per-Moody's / S&P / Fitch agency assignments. Condition 10(a)(iv) Adjusted CPA uses the LESSER of available agency recovery rates for haircut computation on defaulted positions.

**Current engine behavior:** Verified per-position recovery extraction:
- `web/lib/clo/sdf/parse-collateral.ts:45-47, 195-197` extracts `recovery_rate_moodys`, `recovery_rate_sp`, and `recovery_rate_fitch` from the SDF.
- `web/lib/clo/resolver.ts:1004` reads them at the pre-existing-defaulted-holdings reduction: `const rates = [h.recoveryRateMoodys, h.recoveryRateSp, h.recoveryRateFitch].filter(...)` then takes `Math.min(...rates)`.

Agency recovery rates flow correctly into the OC numerator credit for *positions already defaulted at T=0*. They are NOT used for forward defaults during projection. The per-period default block at `projection.ts:1518-1519` (and the no-loan-data fallback path at lines 1546-1551) applies a single global `recoveryPct` (15% scalar default, or whatever the user assumed). Reinvested loans inherit the same global. A B-rated forward default and a CCC-rated forward default recover at the same rate.

**PPM-correct behavior:** Forward-default recovery should be per-position — for each loan, compute its expected recovery from its own agency-specific recovery rates (or fall back to the model `recoveryPct` only if no agency rate is available). The data is already extracted; only the consumption is missing.

**Quantitative magnitude:** Zero in a no-default scenario (Euro XV Q1 base case has 0 forward defaults). Material in stress scenarios. For a stress with 5% per-year CDR over 5 years on a €493M pool, the difference between (a) flat 60% recovery and (b) per-position recovery weighted to the rating distribution can be 5-10pp of pool recovery, translating to 50-100 bps of forward equity IRR.

**Deferral rationale:** Forward modeling currently treats default-and-recovery as an aggregate-pool mechanic with scalar recovery, calibrated to "60% European CLO standard" or user-supplied. Per-position recovery requires loan-state to carry per-loan recovery rates and the default-handling block at `projection.ts:1518-1519` to apply them. The data already exists at the SDF-extraction layer — this is purely a propagation-and-consumption gap, not a new modeling axis.

**Path to close:**
1. Add `recoveryRateMoodys`, `recoveryRateSp`, `recoveryRateFitch` to `ResolvedLoan` (`resolver-types.ts:171-204`) — copy from the holding extraction analogous to the existing pricing fields.
2. In `projection.ts:1518-1519` and the no-loan-data fallback (lines 1546-1551), compute per-loan recovery as `Math.min(...availableAgencyRates)` (matching the pre-existing-defaulted convention) before reducing to the recoveryPipeline. Fall back to global `recoveryPct` only when no agency rate is present.
3. Apply the same per-position recovery to reinvested-loan synthesis (`projection.ts:1631-1635, 2273`): the synthesized loan should carry the rating-bucket-implied recovery from the model's rating-bucket → recovery mapping (or a per-bucket constant if no mapping exists).
4. Re-baseline any stress-scenario test outputs that depend on aggregate recovery.

**Test:** No active marker. When the fix lands, add a synthetic-stress test asserting that two loans defaulting in the same period with different rating-implied recoveries produce different recovery pipeline contributions (current engine: identical contributions; correct engine: differentiated).

---

<a id="ki-33"></a>
### [KI-33] Reinvestment loan synthesis assumes par-purchase (€1 diverted = €1 par)

**PPM reference:** Condition 7 (Reinvestment Period mechanics). Real-world reinvestments happen at market prices: typically 95-100% in benign markets, 80-95% in stress.

**Current engine behavior:** Confessed approximation in code at `web/lib/clo/projection.ts:477-486` (the `computeReinvOcDiversion` block):

> *Known approximation: assumes €1 diverted buys €1 of par (par-purchase). Real reinvestments happen at market prices (typically 95–100%), so €1 of diversion buys €1/price of par; cure-exact math would be `cureAmount × price`. Tracked under C1 (reinvestment compliance) for modelling at purchase price.*

The reinvestment loan synthesis paths at `projection.ts:1631, 1635` (per-period reinvestment), `:2273-2284` (OC-cure reinvestment), and `:2327` (additional reinvestment site) create new loans with `currentPrice` left undefined → defaulted to par downstream. The OC numerator gets credit for €1 of par per €1 of cash diverted, when in reality the diversion should buy `1/price` of par with the price showing up in the OC numerator at MV (or par with a discount-obligation haircut, depending on price relative to threshold).

**PPM-correct behavior:** Cure math should solve `(numerator + cureAmount × currentPrice) / debt ≥ trigger` instead of `(numerator + cureAmount) / debt ≥ trigger`. The synthesized loan carries `currentPrice = marketPrice` and the OC numerator reflects MV-or-par-with-haircut per the discount-obligation rule. Same applies to non-cure reinvestment in the post-RP path.

**Quantitative magnitude:** Zero in periods with no diversion or no reinvestment (Euro XV Q1 base case has both at 0). Material in stress scenarios where the OC trigger trips: each period of cure under-states the cure amount needed to meet the trigger, leaving the test in breach when the model says it has been cured. Direction of error: model over-states the cure efficacy → over-states OC → under-states the depth of the breach → under-states diversion to the right-hand side of the waterfall.

**Deferral rationale:** Code already confesses the approximation. Path forward is well-understood; just hasn't been prioritized. Interacts with KI-29 (discount-obligation classification) — the right fix is to land both together so the reinvested loan that ends up below the discount threshold gets correctly haircut.

**Path to close:**
1. Decide and document the canonical reinvestment-price assumption: a user input (sensitivity slider), a pool-WAS-derived market estimate, or the trustee-reported recent-trade-average from `reinvestment-calibration.ts`.
2. In `computeReinvOcDiversion`: solve `cureAmount × purchasePrice = trigger × debt − numerator` instead of `cureAmount = trigger × debt − numerator`. Returns the cash-diverted amount, not the par bought.
3. In the reinvestment loan synthesis at `projection.ts:1631`, `:1635`, `:2273-2284`, AND `:2327`: set `currentPrice` to the assumed reinvestment price and let the existing pricing path handle the OC credit (with KI-29's discount-obligation logic if `purchasePrice < discountThreshold` — note KI-29 must land first or jointly, since the current static `discountObligationHaircut` scalar does not see new loans).
4. Re-baseline any test that assumes cure-exact = cure-cash; explicitly assert the new diversion amount.

**Test:** No active marker. When the fix lands, add a C1 test pinning the cure-cash math under a non-par reinvestment-price assumption.

---

<a id="ki-34"></a>
### [KI-34] Non-call period not enforced; user-typed pre-NCP call dates pass through

**PPM reference:** Condition 7.2 (Non-Call Period); the dealer cannot redeem before the Non-Call Period End. Modelling a pre-NCP call is economically incoherent (the option doesn't exist).

**Current engine behavior:** UI provides a sensible default but no enforcement.

- `web/app/clo/waterfall/ProjectionModel.tsx:545-550` — `defaultCallDate = (ncEnd > currentDate) ? ncEnd : currentDate`. Initial value floors at NCP.
- `web/app/clo/waterfall/ProjectionModel.tsx:553-561` — `withCallDate = userCallDate.trim() || defaultCallDate`, with the only validation being `/^\d{4}-\d{2}-\d{2}$/.test(trimmed)`.

Any user-typed date that parses as `YYYY-MM-DD` passes through to `applyOptionalRedemptionCall`, including dates before `nonCallPeriodEnd`. The engine accepts it without complaint. The forward IRR returned is for an economically impossible scenario.

**PPM-correct behavior:** A pre-NCP call should either be (a) refused at the UI level (date input restricted to ≥ NCP), or (b) accepted only with an explicit `allowPreNonCallStress: true` flag for the case where an analyst is modelling a hypothetical regulatory or contractual override.

**Quantitative magnitude:** Bug fires only on user error. No silent automatic incorrectness. Severity is low but the current behavior — silently producing IRR for an impossible scenario — is misleading. A partner-facing demo where the analyst types the wrong year in the call-date input gets a plausible-looking number with no warning.

**Deferral rationale:** UI input-validation cleanup. Engine purity precludes side effects (no fetch, no DB) but does NOT preclude argument validation; the right fix is either UI-side (restrict the input) or engine-side (reject pre-NCP callDate unless an explicit override flag is set).

**Path to close:**
1. UI fix: add a `min` attribute to the call-date input bound to `defaultCallDate`, or validate `withCallDate >= nonCallPeriodEnd` and surface a warning banner above the projection panel if violated.
2. Engine guard: in `applyOptionalRedemptionCall` (or wherever `callDate` enters `runProjection`), throw a typed error if `callDate < nonCallPeriodEnd && !allowPreNonCallStress`. Default the new flag to `false`.
3. Add a test asserting both behaviors: (i) UI rejects user input below NCP, (ii) engine throws on pre-NCP callDate without the override.

**Test:** No active marker. When the fix lands, add a test in `app/clo/waterfall/__tests__/` covering the UI input boundary and a unit test in the engine asserting the throw behavior.

---

<a id="ki-35"></a>
### [KI-35] Partial DDTL draw silently discards the un-drawn commitment

**PPM reference:** DDTL (Delayed-Draw Term Loan) commitment mechanics. A DDTL has (a) a committed but undrawn balance accruing a commitment fee until termination or full draw, (b) a draw event that transfers some or all of the commitment to a funded loan, (c) any undrawn portion at the commitment-end date that is then either rolled or terminated.

**Current engine behavior:** `web/lib/clo/projection.ts:1396-1401`:

```
for (const loan of loanStates) {
  if (!loan.isDelayedDraw) continue;
  if (q === loan.drawQuarter) {
    const fundedPar = loan.survivingPar * (ddtlDrawPercent / 100);
    loan.survivingPar = fundedPar;
    loan.spreadBps = loan.ddtlSpreadBps ?? 0;
    loan.isDelayedDraw = false;
  }
}
```

When `ddtlDrawPercent < 100`, `loan.survivingPar = fundedPar` overwrites the full commitment with the drawn portion only. The undrawn balance is discarded with no further accounting: no commitment fee on undrawn (the engine emits zero), no carry-forward of the commitment, no termination-of-commitment cash event.

**PPM-correct behavior:** Two parts:
1. Commitment fee on undrawn balance: a fixed bps × undrawn-par × dayFrac flows through interest collections each period until full draw or commitment termination.
2. At commitment end: the undrawn portion is either rolled (extending the commitment) or terminated (zero-cash event for the deal — the commitment evaporates with no recovery owed).

**Quantitative magnitude:** Zero on Euro XV Q1 (no DDTL draw event in period 1). Latent on any deal with active DDTLs that draw partially. On a typical European CLO with 5-10% of par in DDTLs at average commitment fee of 50 bps, partial-draw commitment fees accumulate to ~25-50 bps × pool × commitment lifetime. For €493M pool with 5% DDTL share at 50 bps commitment fee, that is ~€31K/quarter of missing interest over the commitment period.

**Deferral rationale:** DDTL fine-grain mechanics not yet modeled. The `ddtlDrawPercent` was added as a sensitivity dial, not as a full commitment-tracking mechanism.

**Path to close:**
1. Add `commitmentFeeBps: number | null` to `ResolvedLoan` (extracted from the loan's instrument terms).
2. Add `commitmentEndDate: string | null` for the commitment expiration.
3. In `projection.ts:1396-1401`: instead of `loan.survivingPar = fundedPar`, split into `loan.fundedPar` and `loan.undrawnCommitment = loan.survivingPar - fundedPar`. Track both as separate fields.
4. Per period, accrue commitment fee on `undrawnCommitment × commitmentFeeBps × dayFrac` and add to `interestCollected`.
5. At `commitmentEndDate`, terminate the undrawn commitment (set to 0; emit a one-line stepTrace event for auditability).

**Test:** No active marker. When the fix lands, add `KI-35-ddtlPartialDraw` against a synthetic fixture with a DDTL drawing at 50% — assert (a) commitment fee accrues on the un-drawn 50% pre-end, (b) commitment terminates at end-date with no other cash effect.

---

<a id="ki-36"></a>
### [KI-36] Per-tranche `payment_frequency` and `day_count_convention` extracted but not consumed

**PPM reference:** Per-tranche indenture terms. Each tranche's payment frequency (Quarterly / Semi-Annual / Monthly) and day-count convention (Actual/360, 30/360 US, 30E/360 European) are PPM-specified per class.

**Current engine behavior:** Verified extraction:

- `web/lib/clo/sdf/parse-notes.ts:24-25` declares `payment_frequency: string | null` and `day_count_convention: string | null` on the parsed SDF notes type.
- `web/lib/clo/sdf/parse-notes.ts:126-127` populates from raw SDF columns (`Payment_Frequency`, plus a `buildDayCountConvention` derivation).

Neither field is consumed downstream — `web/lib/clo/resolver.ts`, `resolver-types.ts`, and `projection.ts` contain no references to either. The engine assumes (a) uniform quarterly cadence for all tranches via `addQuarters(_, 1)` at the period stub anchor (`projection.ts:944`), and (b) binary day-count via `t.isFloating ? Actual/360 : 30/360 (US)` at `projection.ts:1382-1383`. There is no mechanism to express 30E/360 (European) or to mix payment frequencies across tranches.

**PPM-correct behavior:** Each tranche carries its PPM-specified payment frequency and day-count convention; the engine generates per-tranche period ends and per-tranche accrual fractions.

**Quantitative magnitude:** Zero on Euro XV (all 8 tranches are quarterly; B-2 is 30/360 US per the engine's binary mapping, which happens to match Euro XV; A/B-1/C/D/E/F are Actual/360 floating, also matching). Latent on:
- Any deal with one or more semi-annual tranches (engine treats them as quarterly → 2× the period count, distorted day-count, distorted IRR).
- Any deal with 30E/360 fixed-rate tranches (engine treats as 30/360 US — Euro endpoint difference is small but compounds across the projection).
- Any deal with a mixed-cadence structure (impossible to model in current engine).

**Deferral rationale:** Engine refactor required to support variable per-tranche cadence. Closely related to KI-04 (Frequency Switch) — when KI-04 lands, the natural extension is per-tranche cadence rather than just deal-level.

**Path to close:**
1. Add `paymentFrequency: "Quarterly" | "SemiAnnual" | "Monthly"` and `dayCountConvention: "Actual360" | "Thirty360US" | "Thirty360E"` to `ResolvedTranche`.
2. Populate from `raw.trancheSnapshots[*].payment_frequency` / `.day_count_convention` in the resolver tranche-resolution block.
3. Replace `addQuarters(_, 1)` at `projection.ts:944` with per-tranche period-end derivation.
4. Replace `trancheDayFrac(t)` at `projection.ts:1382-1383` with a dispatch on `t.dayCountConvention`.
5. Update test fixtures to verify mixed-cadence deals project correctly.

**Test:** No active marker on Euro XV. When extraction support lands, add resolver tests pinning the extracted values for Euro XV. When engine support lands, add synthetic-deal tests for semi-annual and 30E/360.

---

<a id="ki-37"></a>
### [KI-37] Loan-level `floorRate`, `pikAmount`, `creditWatch`, `isCovLite` extracted but unused by engine

**PPM reference:** Per-loan indenture terms (floor rate / EURIBOR floor, PIK toggle and balance, credit watch status, covenant-lite classification).

**Current engine behavior:** Each field is set on `ResolvedLoan` or its precursor types but never consumed:

- `web/lib/clo/resolver.ts:974` sets `floorRate: h.floorRate ?? undefined` on `ResolvedLoan`. No reference in `projection.ts`. Engine uses deal-level `baseRateFloorPct` (from `defaults.ts:21`) for every loan; per-loan EURIBOR floor is ignored.
- `web/lib/clo/resolver.ts:975` sets `pikAmount: h.pikAmount ?? undefined`. No reference in `projection.ts`. PIK loans (those whose interest accretes to par rather than paying cash) are modeled as cash-paying — the engine's `interestCollected` over-counts.
- `web/lib/clo/resolver.ts:976` sets `creditWatch: creditWatch || undefined`. Informational only; no model use.
- `web/lib/clo/types/entities.ts:147` declares `isCovLite: boolean | null` on the raw type. Not propagated to `ResolvedLoan` (`resolver-types.ts:171-204` has no `isCovLite` field). The d4 test at `web/lib/clo/__tests__/d4-switch-simulator-pool-metrics.test.ts:181-187` explicitly TODOs the missing `isCovLite` propagation.
- `web/lib/clo/types/entities.ts:151` declares `isPik: boolean | null` on the raw type (verified at `access.ts:313, 542`; extracted via `extraction/section-prompts.ts:219`; accepted by Zod at `extraction/schemas.ts:126`). Not propagated to `ResolvedLoan` either — the resolver mapping at `resolver.ts:949-978` writes `pikAmount` but not `isPik`. The d4 TODO comment also names `isPik` alongside `isCovLite` as awaiting propagation. Without `isPik` the engine cannot dispatch PIK accretion logic — it can't distinguish "PIK accrued €X this period" from "loan paid €X cash this period."

**PPM-correct behavior:**
- **floorRate:** per-loan EURIBOR floor applies to that loan's interest accrual. `loanCoupon = max(loan.floorRate, baseRate) + spread`, not `max(deal.baseRateFloor, baseRate) + spread`. Material in low-rate environments where some loans were issued with 0% floors and others with 0.75% floors.
- **pikAmount / isPik:** PIK loans accrete interest to par rather than paying cash. Engine should add the PIK accretion to `loan.survivingPar` and NOT to `interestCollected`.
- **isCovLite:** classification used by buy-list filter and concentration tests; not engine-side per se but a data-pipeline gap.

**Quantitative magnitude:**
- floorRate: zero impact in current >2% EURIBOR environment (no loan's individual floor rate would bind). Bites in low-rate scenarios (any forward path where EURIBOR falls below ~0.75% — relevant in a recession scenario).
- pikAmount / isPik: scales with the share of PIK loans. Euro XV's PIK share is null in extraction; non-zero on US BSL and stressed-European deals. A 5% PIK share at 8% coupon over-counts interest by ~€1M/quarter on a €493M pool — roughly 25 bps of forward equity IRR.
- isCovLite: indirect; affects buy-list filtering (KI-23 territory) and forward concentration tests.

**Deferral rationale:** Field-by-field extraction-to-engine plumbing. Each row is independent.

**Path to close:**
1. **floorRate:** in `projection.ts` per-loan interest computation (lines 1576, 1578), use `Math.max(loan.floorRate ?? baseRateFloorPct, flooredBaseRate)` for the floating-rate branch instead of `flooredBaseRate` directly.
2. **pikAmount / isPik:** add `isPik: boolean` to `ResolvedLoan`. In the per-period loan loop, if `loan.isPik`, accrete the period's interest to `loan.survivingPar` instead of `interestCollected`. The cash flow into the waterfall is then correctly reduced.
3. **isCovLite:** propagate through `entities.ts → resolver-types.ts → ResolvedLoan` so the field is available to the buy-list filter (KI-23) and any concentration test.

**Test:** No active markers. Each sub-fix gets its own test: synthetic loan with a 1% floor in a 0.5% EURIBOR scenario; synthetic PIK loan asserting accreted balance and zero cash collected; cov-lite filter test (KI-23 / D5).

---

<a id="ki-38"></a>
### [KI-38] FX / multi-currency unmodeled; `native_currency` parsed and discarded

**PPM reference:** Multi-currency CLO mechanics (USD/EUR/GBP cross-currency hedges, FX revaluation on holdings denominated in non-deal currency).

**Current engine behavior:** `web/lib/clo/sdf/parse-collateral.ts:17-19, 146-150` extracts:

- `native_currency_balance: number | null` (the loan's balance in its own currency)
- `native_currency: string | null` (the loan's denomination)
- `currency: string | null` (set to the same value as `native_currency`)

No FX rate is ingested. The engine does not consume `currency` anywhere — `web/lib/clo/projection.ts` has no references. Loan par values are summed as if all denominated in the deal currency.

**PPM-correct behavior:** A USD-denominated loan in a EUR-denominated deal must be revalued at the prevailing EUR/USD rate each period (typically using the trustee report's reference FX). The deal's hedge legs (if cross-currency) net out the FX exposure at a contracted rate.

**Quantitative magnitude:** Zero on Euro XV — single-currency (EUR-investing-in-EUR-loans), no FX exposure. Latent on any multi-currency deal. On a US BSL CLO with 100% USD assets denominated in USD, this works by coincidence (engine treats sums as USD). On a European deal with a USD sleeve (~5-10% of par typical in some structures), the engine over- or under-states pool par by the EUR/USD drift × USD share — easily 5-10pp swings during periods of FX volatility.

**Deferral rationale:** Multi-currency support is a substantial engine + extraction extension. Tagged latent because Euro XV is single-currency.

**Path to close:** Out of scope until a multi-currency deal is in the pipeline. When that arrives, a separate sprint covers (a) FX rate ingestion, (b) per-loan revaluation, (c) cross-currency hedge legs, (d) currency-bucketed concentration tests.

**Test:** No active marker. Required when a multi-currency deal is onboarded.

---

<a id="ki-39"></a>
### [KI-39] Intex past-cashflows parser hardcoded for Euro XV's tranche structure

**PPM reference:** The Intex DealCF past-cashflows export is a flat-CSV format with per-tranche column blocks. Block widths and class names are deal-specific.

**Current engine behavior — worse than parser-side error: persistent DB corruption.** `web/lib/clo/intex/parse-past-cashflows.ts:88-99`:

```
const TRANCHE_BLOCKS: Array<{ className: string; start: number; floating: boolean }> = [
  { className: "Class A",            start: 39, floating: true  },
  { className: "Class B-1",          start: 50, floating: true  },
  { className: "Class B-2",          start: 61, floating: false }, // 10-col (no rate reset)
  { className: "Class C",            start: 71, floating: true  },
  { className: "Class D",            start: 82, floating: true  },
  { className: "Class E",            start: 93, floating: true  },
  { className: "Class F",            start: 104, floating: true },
  { className: "Subordinated Notes", start: 115, floating: false }, // 10-col
];
```

Column starts (39, 50, 61, 71, 82, 93, 104, 115), block widths (11 cols for floating, 10 for fixed), and class names are hardcoded for Euro XV's specific structure. There is no schema-mismatch warning. Any deal whose Intex export has a different tranche structure — additional or missing class, pari-passu Class A-1+A-2 split, all-floating structure, etc. — will silently mis-read columns starting at the divergence point. **Worse: the downstream ingest path at `web/lib/clo/intex/ingest.ts:67-83` then INSERTs phantom tranche rows into `clo_tranches` for any class name not already present, and overwrites `clo_tranche_snapshots` with the misaligned data — marking it `data_source = 'intex_past_cashflows'` (treated as authoritative trustee history). The corruption is persistent in the database, not transient.**

**PPM-correct behavior:** Schema-aware parsing. The Intex export carries per-tranche column headers; the parser should use those to locate tranche blocks dynamically rather than baking offsets.

**Quantitative magnitude:** Zero today — only Euro XV uses this parser. Critical the moment a second deal lands. Catastrophic in a partner-facing context: silent column misalignment produces plausible-looking trustee numbers that are wrong by amounts that grow with how many columns past the divergence the parser reads.

**Deferral rationale:** Hardcoded for the only deal in production. Tagged Latent because the bug is silent until a second deal arrives, at which point it becomes critical.

**Path to close:**
1. Drive `TRANCHE_BLOCKS` from the Intex export's header row rather than from constants.
2. Validate that the discovered tranche structure matches `ResolvedDealData.tranches` — fail loud on mismatch.
3. Test against a synthetic Intex export with a different tranche structure (e.g. Class A-1 + A-2 + B + C + D + E without Class F) to confirm dynamic detection.

**Test:** No active marker on Euro XV. Pre-condition for onboarding any second deal: this parser must be schema-driven and fail loud on schema mismatch, not silently produce wrong numbers. **This is the single highest-priority portability item in the ledger.**

---

<a id="ki-40"></a>
### [KI-40] `diversionPct = 50%` silent fallback on extraction failure

**PPM reference:** Condition 3.3 / Condition 7 — Reinvestment OC Test diversion. Real deals carry varying diversion percentages: 50% is most common in European CLOs but 30%, 40%, and 100% all appear.

**Current engine behavior:** `web/lib/clo/resolver.ts:809-820`:

```
let diversionPct = 50; // common default
if (reinvOcRaw?.diversionAmount) {
  const pctMatch = reinvOcRaw.diversionAmount.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    diversionPct = parseFloat(pctMatch[1]);
  } else {
    warnings.push({ field: "reinvestmentOcTrigger.diversionPct", message: `Could not parse diversion percentage from "${reinvOcRaw.diversionAmount}" — defaulting to 50%`, severity: "warn" });
  }
} else if (reinvOcRaw?.trigger) {
  warnings.push({ field: "reinvestmentOcTrigger.diversionPct", message: `Reinvestment OC trigger found but no diversion amount specified — defaulting to 50%`, severity: "warn" });
```

When PPM extraction fails to surface a diversion amount, the resolver falls back to 50% with a `warn`-severity warning — and continues using the value. The engine has no way to distinguish "PPM specifies 50%" from "PPM doesn't say and we guessed 50%".

**PPM-correct behavior:** Each deal's diversion percentage extracted from its PPM. Failure to extract is a fatal data-completeness error, not a recoverable fallback.

**Quantitative magnitude:** Zero on Euro XV (extraction succeeds at 50%). Material on any deal where extraction fails AND the actual diversion is not 50%. A 100%-diversion deal modeled as 50% over-states equity distributions during diverted periods by 50% of the diverted amount; a 30%-diversion deal modeled as 50% under-states.

**Deferral rationale:** Engineering judgment on the part of the original implementer that "common default" is preferable to a hard error. That judgment is wrong for a financial model — silent fallback to a wrong value is the most expensive failure mode.

**Path to close:**
1. Promote the warning at `resolver.ts:817` and `:820` from `severity: "warn"` to `severity: "error"`.
2. Surface the error in the UI: when `diversionPct` was inferred from a fallback, the projection should refuse to run (or run with a banner-level "DATA INCOMPLETE" warning that the partner cannot dismiss).
3. Decide: do we run with the 50% fallback under a banner, or refuse to run? Lean toward refuse-to-run for financial-model correctness.
4. Add a resolver test asserting that a fixture with no extracted diversion amount surfaces an error-severity warning AND that the projection-build path respects the error.

**Test:** No active marker on Euro XV (extraction succeeds). When the policy lands, add a resolver test pinning the error-severity behavior on a synthetic raw with no `reinvOcRaw.diversionAmount`.

---

<a id="ki-41"></a>
### [KI-41] `incentiveFeeHurdleIrr = 12%` silent fallback on extraction failure

**PPM reference:** Condition 1 ("Incentive Collateral Management Fee") / Subordinated Management Fee mechanics. Each deal's IRR hurdle is PPM-specified.

**Current engine behavior:** `web/lib/clo/resolver.ts:509-517`:

```
const hurdleRaw = parseFloat(fee.hurdleRate ?? "");
if (!isNaN(hurdleRaw) && hurdleRaw > 0) {
  incentiveFeeHurdleIrr = hurdleRaw > 1 ? hurdleRaw / 100 : hurdleRaw;
} else if (incentiveFeePct > 0) {
  // Standard European CLO equity hurdle is ~12% IRR. Using 0% would mean
  // the incentive fee fires on any positive return, which is too aggressive.
  incentiveFeeHurdleIrr = 0.12;
  warnings.push({ field: "fees.incentiveFeeHurdleIrr", message: `Incentive fee present (${incentiveFeePct}%) but no hurdle rate found — assuming 12% IRR hurdle. ...`, severity: "error", resolvedFrom: "not extracted → defaulted to 12%" });
}
```

The fallback is gated on `else if (incentiveFePct > 0)`. When extraction yields a non-finite hurdle AND an incentive fee was extracted (`incentiveFeePct > 0`), the resolver pushes an `error`-severity warning AND continues with `0.12` (12% IRR). When no incentive fee was extracted at all, the resolver leaves `incentiveFeeHurdleIrr` at 0 and emits no warning — the engine's incentive-fee solver then no-ops via the `incentiveFeePct > 0 && incentiveFeeHurdleIrr > 0` gate at `projection.ts:2366` / `:2397`. Verified Euro XV path: `d3-defaults-from-resolved.test.ts:48` confirms `expect(d.incentiveFeeHurdleIrr).toBeCloseTo(12, 6)` — Euro XV extracts to 12% from `hurdleRate: "12%"` (fixture `euro-xv-q1.json:8226`), so the fallback is not triggered today.

**PPM-correct behavior:** Hurdle is per-deal PPM-defined. A hard error on extraction failure prevents the model from running with a wrong hurdle. The IRR hurdle directly affects the incentive-fee circular solver — wrong hurdle → wrong incentive-fee threshold → wrong sub-distribution residual.

**Quantitative magnitude:** Zero on Euro XV (extraction succeeds). Material on any deal where extraction fails and the actual hurdle is not 12%. A deal with a 15% hurdle modeled as 12% has the incentive fee firing earlier in the equity-cash-flow series → over-states sub-distribution diversion to incentive fee → under-states equity residual. A deal with a 10% hurdle modeled as 12% goes the other way.

**Deferral rationale:** Same shape as KI-40 — silent fallback on extraction failure with a "common default" heuristic. Same reasoning applies: this is wrong for a financial model.

**Path to close:**
1. The warning is already `severity: "error"` (good); but the resolver continues using 0.12. Decide: run with the fallback under a banner, or refuse to run? Lean toward refuse-to-run.
2. If runs are refused, the resolver should surface a typed exception that the projection-build path handles by showing a "DATA INCOMPLETE" message.
3. If runs continue (under banner), the partner-facing surfaces (PDF export, share links, dashboards) should mark the deal "uses fallback hurdle" until extraction is re-run.

**Test:** No active marker on Euro XV (extraction succeeds). When the policy lands, add a resolver test on a synthetic raw with no `incentiveFee.hurdleIrr`.

---

<a id="ki-42"></a>
### [KI-42] `failsWithMagnitude` discipline gap on day-count residuals (`adminFeesPaid`, `trusteeFeesPaid`)

**Context:** The ledger's stated discipline is *"Ledger ↔ test is a bijection: when a fix lands, the marker must be removed AND this entry moved to Closed."* The bijection is enforced via `failsWithMagnitude` markers carrying a `ki:` field that links each documented drift to a ledger entry. KI-08's body documents the €722 day-count residual on the combined trustee + admin fees (€13 trustee + €709 admin under the C3 split). Both numbers are pinned in the test file — but via plain `toBeCloseTo`, not `failsWithMagnitude`.

**Current behavior:** `web/lib/clo/__tests__/n1-correctness.test.ts:151-156`:

```
it("trusteeFeesPaid (PPM step B): KI-08 pre-fill closed, residual is day-count only", () => {
  expect(drift("trusteeFeesPaid")).toBeCloseTo(13, -1); // ±€5
});
it("adminFeesPaid (PPM step C): KI-08 pre-fill closed, residual is day-count only", () => {
  expect(drift("adminFeesPaid")).toBeCloseTo(709, -2); // ±€50
});
```

Both assertions pin a numeric drift; neither is registered through `failsWithMagnitude`. There is no `ki:` field linking these residuals to KI-08 (or KI-12b, since the residual mechanism is the 91/360 vs 90/360 day-count difference). When KI-16 closes and the cap-mechanic refactor changes the trustee/admin fee base, nothing in the marker registry forces these numbers to be re-baselined alongside the cascade markers.

**Correct behavior:** Both lines should use `failsWithMagnitude({ ki: "KI-08-dayCountResidual", closesIn: "KI-12a harness fix", expectedDrift: 709, tolerance: 50 }, ...)` (and similarly for trustee at €13 ± €5). The marker provides automatic re-baseline tracking and integrates with the ledger's index of cascade dependencies.

**Quantitative magnitude:** This is a discipline / bookkeeping issue, not a model-correctness issue. The numbers are right; the assertion mechanism is just outside the bijection. Materiality is in the medium-term: any future PR that touches KI-08, KI-12a, or KI-12b must remember to re-baseline these two lines manually. Manual processes silently rot.

**Deferral rationale:** Cleanup. No PPM mechanic is at stake.

**Path to close:**
1. Convert the two assertions in `n1-correctness.test.ts:151-156` from `toBeCloseTo` to `failsWithMagnitude` calls with `ki: "KI-08-dayCountResidual-trustee"` and `ki: "KI-08-dayCountResidual-admin"`, both with `closesIn: "KI-12a harness fix"`.
2. Update the KI-08 body to reference the two new markers under its **Tests:** section.
3. Add a check (or comment in the helper) that any `n1-correctness` per-bucket assertion **inside the "currently broken buckets" describe block** outside `failsWithMagnitude` is a regression — the registry should be the only place pinned drifts live. The "engine-does-not-model steps" describe block at lines 301-321 legitimately uses `toBeCloseTo` for closed KIs (KI-01, KI-09 tied-out tests assert €250 / €6,202 — not pinned drift), and that pattern is correct.

**Test:** Self-referential — the bijection itself is the test. The fix is the marker conversion above.

---

<a id="ki-43"></a>
### [KI-43] Forward-period EoD test uses literal `"Class A"` string match (regression of T=0 fix)

**PPM reference:** Condition 10(a)(iv) — Event of Default Par Value Test. Denominator is the senior-most rated debt tranche's Principal Amount Outstanding (PAO). The PPM identifies the tranche by seniority rank, not by class name.

**Current engine behavior:** The T=0 path correctly identifies the senior-most rated tranche by `seniorityRank` (`projection.ts:1295-1311`). A 6-line comment at that site explicitly documents *why*: "String-match on 'Class A' was a Euro-XV-shaped overfit; see the synthetic-fixture #10 test (post-v6 plan §6.1) which surfaces it." The forward-period path at `projection.ts:2050-2053` regresses to the very pattern the T=0 fix retired:

```
const classATranche = tranches.find((t) => t.className === "Class A");
const classAPao = classATranche
  ? trancheBalances[classATranche.className] + deferredBalances[classATranche.className]
  : 0;
```

When `classATranche === undefined` (any deal whose senior tranche is named "Class A-1", "A-1", "A1F", "A", or any pari-passu A-1 + A-2 split where rank 1 is shared and only one class matches — verified zero-name match would silently return 0), the test computes `classAPao = 0`. Combined with the `actualPct = (numerator / 0) > 0 ? 999 : 0` guard inside `computeEventOfDefaultTest`, the test always passes. EoD detection in the forward loop is silently disabled.

**PPM-correct behavior:** Use the same `seniorityRank`-based discovery the T=0 path uses (`projection.ts:1302-1311`). On a pari-passu split (A-1 + A-2 sharing rank 1), sum both balances. The forward-period `eodInput` setup at lines 2030-2049 (the array is named `eodInput`, not `eodLoanStates` — the latter is the analogous T=0 array at line 1289) is already correct; only the denominator calculation regressed.

**Quantitative magnitude:** Zero on Euro XV today (the literal name match works because the tranche IS named "Class A"). Catastrophic on every other deal at the moment EoD detection is supposed to fire — every forward-period EoD breach is silently masked. Failure mode: B2 acceleration is never triggered, the engine continues running the normal-mode waterfall through a deal that should have flipped to PPM 10(b), and the partner sees plausible-looking distributions that ignore the legal default state.

**Deferral rationale:** None — this is a regression of a documented closure, not a deliberate scope choice.

**Path to close:**
1. Replace `projection.ts:2050-2053` with the same seniorityRank-based discovery used at `:1302-1311`. Extract the helper (e.g., `computeClassAPao(tranches, trancheBalances, deferredBalances)`) so the two sites cannot drift again.
2. Add a synthetic-fixture test (the post-v6 plan §6.1 fixture #10 referenced in the T=0 comment) that asserts EoD fires under stress on a deal whose senior tranche is named "Class A-1", and a second test for the pari-passu A-1 + A-2 split.
3. Cross-reference under [KI-21](#ki-21) Scope 3 — this is the third hardcoded enumeration site (alongside the accel executor and T=0 initialState) that maintains its own implementation of senior-tranche identification.

**Test:** No active marker. When the fix lands, add `b1-event-of-default.test.ts > "EoD fires on non-Class-A-named senior tranche"` and a pari-passu split assertion.

---

<a id="ki-45"></a>
### [KI-45] `ProjectionModel.tsx` useMemo dep arrays missing fee-related state vars — engine runs stale on slider drag

**Context:** The engine `inputs` and `userAssumptions` memos are the single point of state translation between the UI sliders and `runProjection`. A missing dep silently makes the engine ignore that slider — the partner moves the dial, the IRR/distributions/OC ratios do not update, and there is no visible signal that the projection is stale.

**Current engine behavior:**

- `web/app/clo/waterfall/ProjectionModel.tsx:393-438` — the `inputs` memo body reads `taxesBps`, `issuerProfitAmount`, `adminFeeBps`, `seniorExpensesCapBps` (lines 418-422). Its dep array (lines 431-437) lists `seniorFeePct, subFeePct, trusteeFeeBps, hedgeCostBps, incentiveFeePct, incentiveFeeHurdleIrr` but **omits `taxesBps`, `issuerProfitAmount`, `adminFeeBps`, `seniorExpensesCapBps`**. Verified by direct file read.
- `web/app/clo/waterfall/ProjectionModel.tsx:457-496` — the `userAssumptions` memo (consumed by `SwitchSimulator`) has the same omission for the same four fields, plus `callMode` is read at line 473 but missing from the dep array (line 491 dep list).

Net effect: when the user adjusts Taxes, Issuer Profit, Admin Fee, or Senior Expenses Cap — and only those — the engine does not re-run. The next unrelated slider change re-triggers the memo and the cap'd state finally flushes through; until then the partner sees a number computed against stale fee inputs.

**PPM-correct behavior:** Every variable read inside a `useMemo` body must be present in the dep array (React `react-hooks/exhaustive-deps` invariant). Memo correctness is independent of the model: the engine reads what the memo passes, and the memo passes whatever was current when last triggered.

**Quantitative magnitude:** A user who moves any of the four sliders and stops there sees the engine continue running on the prior value until an unrelated slider re-triggers the memo. Per-bps drift on Euro XV (91-day quarter): `1 bps × €493,252,343 × 91/360 ≈ €12,464` per period. Direct effect on `taxesBps` and `issuerProfitAmount` (engine consumes immediately, partner-visible drift is the slider movement × per-bps factor / per-€ factor). For `adminFeeBps` and `seniorExpensesCapBps` the effect is conditional: the cap binds only when `trusteeFeeBps + adminFeeBps > seniorExpensesCapBps`. Euro XV current observed combined ~5.24 bps (KI-08) vs default cap 20 bps — cap NOT binding. A drag from cap 20 → 4 bps takes the cap below combined; clipped amount = `(5.24 − 4) × 12,464 ≈ €15,455` per period until the next slider movement re-flushes the memo. Under any stress scenario where the cap binds at baseline, the gap is the slider movement × per-bps factor.

**Deferral rationale:** None — this is a UI bug, not a model gap. Latency is the entire failure mode (silent incorrectness during slider exploration).

**Path to close:**
1. `ProjectionModel.tsx:431-437` — add `taxesBps`, `issuerProfitAmount`, `adminFeeBps`, `seniorExpensesCapBps` to the `inputs` memo dep array.
2. `ProjectionModel.tsx:490-495` — add the same four plus `callMode` to the `userAssumptions` memo dep array.
3. Enable the `react-hooks/exhaustive-deps` ESLint rule project-wide (`web/.eslintrc` or equivalent) so this regression cannot land again. The rule would have caught both omissions at lint time.

**Test:** No active marker. After the dep-array fix lands, add a Playwright/unit test that asserts changing each of the four fee sliders triggers a non-zero diff in `result.totalEquityDistributions`. The architecture-boundary test does not catch this category — it scans for layer violations, not for memo-dep correctness.

---

<a id="ki-46"></a>
### [KI-46] `WaterfallVisualization.tsx` local `formatAmount` hardcodes `$` on EUR-denominated trustee amounts

**Context:** Euro XV is EUR-denominated. The Waterfall surface renders trustee-reported step amounts and tranche balances — all of which are partner-facing and currency-sensitive.

**Current engine behavior:** `web/app/clo/waterfall/WaterfallVisualization.tsx:68-73`:

```
function formatAmount(val: number | null): string {
  if (val === null || val === undefined) return "—";
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}
```

Local helper, hardcoded `$` symbol, used at lines 225, 230, 235, 390, 395, 398, 416 (verified — seven call sites, all rendering currency amounts on a partner-visible panel; `grep -c "formatAmount("` returns 8, but the eighth match is the function declaration at line 68). The shared `formatAmount` lives at `app/clo/waterfall/helpers.ts:5` and is correctly imported by sibling components (`PeriodTrace.tsx:3`, `ModelInputsPanel.tsx:6`); the local version in `WaterfallVisualization.tsx` shadows it.

**PPM-correct behavior:** Currency derives from the deal. `resolved.metadata` (or equivalent) carries the deal currency; the formatter should accept a `currency` param or be replaced with the shared helper that already handles this.

**Quantitative magnitude:** Zero numerical impact (the underlying values are correct). Pure presentation lie. Materially erodes partner trust on a deal where every other surface correctly shows €.

**Deferral rationale:** None — UI bug.

**Path to close:**
1. Delete the local `formatAmount` at `WaterfallVisualization.tsx:68-73`.
2. Import the shared `formatAmount` from the helpers module (verify which one is canonical — `app/clo/waterfall/helpers.ts` or wherever the equivalent function lives).
3. Pass the deal currency through props or pull from `resolved.metadata` if the shared helper takes a currency parameter.
4. Add a regression sweep — grep `web/app/clo/` for ` \\$\\$\\{` or `\`\\$` to confirm no other site has the same hardcode.

**Test:** No active marker. After the fix, add a unit test on `WaterfallVisualization` that snapshots a EUR amount and asserts `€` appears in the output, not `$`.

---

<a id="ki-47"></a>
### [KI-47] `ModelAssumptions.tsx` discloses model limitations that no longer apply (KI-01/08/09 closed; B2/B3 shipped)

**Context:** `ModelAssumptions.tsx` is the partner-facing list of "what the model does NOT do." It is an audit / trust artifact — partners read it to understand model limitations. Wrong claims here do not just mislead; they degrade the credibility of the other (correct) disclosures alongside them. Audit against current engine state (verified 2026-04-30) found five stale entries.

**Stale items (verified):**

| Line | Current text (truncated) | Status | Engine evidence |
|---|---|---|---|
| 30 | *"No day count conventions: Interest accrues as simple quarterly fractions (annual rate / 4)…"* | Stale | `dayCountFraction("actual_360"\|"30_360", periodStart, periodEnd)` live at `projection.ts:841-860`; applied across the period loop (lines 1370-1383, 1672, 1696, 1698, 2075, 2136, 2239). B3 closed Sprint 1. |
| 32 | *"Fixed-rate bonds accrue quarterly: All fixed-rate positions accrue interest as annual coupon / 4…"* | Partially stale | Tranche-side: `trancheDayFrac(t)` at `projection.ts:1382-1383` differentiates fixed (30/360) from floating (Actual/360). Asset-side: per-loan day-count is uniformly Actual/360 — that is [KI-28](#ki-28). The disclosure conflates the two. |
| 49 | *"No Senior Expenses Cap: Real deals cap total non-management expenses…"* | Stale | C3 shipped Sprint 3. `seniorExpensesCapBps` is a `ProjectionInputs` field; engine jointly caps trustee + admin and routes overflow to PPM steps (Y) and (Z). See [KI-08](#ki-08), [KI-16](#ki-16). |
| 57 | *"No post-acceleration waterfall: Following an Event of Default, the real waterfall collapses into a simplified combined priority. This distressed scenario is not modeled."* | Stale | B2 shipped Sprint 2. `runPostAccelerationWaterfall` at `projection.ts:652`; `POST_ACCEL_SEQUENCE` at `waterfall-schema.ts:58-74`. |
| 60 | *"No discount obligation haircut: Assets purchased below 85% of par should be carried at purchase price in OC calculations. The model only applies CCC excess haircuts."* | Partially stale | Engine applies `discountObligationHaircut` from `parValueAdjustments` at `projection.ts:1241, 1994`. Static snapshot only — not recomputed forward through reinvestment. That is [KI-29](#ki-29); the disclosure should describe the static-snapshot limitation, not deny the mechanic. |

**PPM-correct behavior:** N/A — documentation correctness item.

**Quantitative magnitude:** Zero numerical impact. Trust impact is the load-bearing axis: a partner reading these alongside a deal IRR sees model limitations that don't exist (lines 30, 32, 49, 57) or are out-of-date (line 60), and either dismisses the model surface as not maintained OR over-corrects manually for a mechanic the engine has already applied.

**Deferral rationale:** None.

**Path to close:**
1. **Delete** lines 49 ("No Senior Expenses Cap") and 57 ("No post-acceleration waterfall") — both fully closed, no residual gap to disclose.
2. **Reword** line 30 to: *"Day-count is Actual/360 (floating) and 30/360 US (fixed) per tranche. 30E/360 European and Actual/365 conventions for fixed-rate assets remain unmodeled — see [KI-28](#ki-28)."*
3. **Reword** line 32 to: *"Tranche fixed-rate accrual uses 30/360 US. Asset-side fixed-rate accrual uses Actual/360 — asymmetric, ~€4,335/quarter drift on Euro XV's fixed-rate slice. See [KI-28](#ki-28)."*
4. **Reword** line 60 to: *"Discount and long-dated obligation haircuts are static snapshots from the trustee report at projection start, not recomputed forward through reinvestment — see [KI-29](#ki-29)."*
5. Treat `ModelAssumptions.tsx` as a partner-facing extension of this ledger. Each disclosure line should map to either (a) an open KI here, OR (b) a deliberate scope decision that is also documented here. Items mapping to neither are stale.
6. Add a CI-time check (a vitest test that scans `ModelAssumptions.tsx` for any line referencing a KI number and verifies the cited KI exists in the Open or Latent or Deferred sections of this ledger; build fails if any cited KI is in the Closed section without the disclosure line being deleted/reworded).

**Test:** No active marker. After the rewording lands, the CI-time check above pins the discipline (and would catch this category of drift on every future PR).

---

<a id="ki-48"></a>
### [KI-48] `period-trace-lines` amortising-tranche heuristic is described in a comment but never implemented

**PPM reference:** Class X (and analogous amortising tranches) — principal pays from the interest waterfall on a fixed schedule, not from the principal waterfall. Rendering the row in the Principal section double-counts.

**Current engine behavior:** `web/app/clo/waterfall/period-trace-lines.ts:289-304`:

```
// Tranche principal payments (excluding amortising — those are emitted in
// the interest section by the engine. We use a heuristic: if the tranche
// also has interest paid and a principal entry > 0, it's likely amortising.
// The cleaner fix is for the engine to expose isAmortising on tranchePrincipal
// entries; that's deferred to a future engine instrumentation pass.)
for (const tp of period.tranchePrincipal) {
  if (tp.paid === 0) continue;
  lines.push({
    label: `${tp.className} principal`,
    amount: tp.paid,
    indent: 1,
    severity: "fee",
    outflow: true,
    section: "principal",
  });
}
```

The comment describes a heuristic ("if the tranche also has interest paid and a principal entry > 0, it's likely amortising — skip it"). The code itself only filters `tp.paid === 0`. No interest-also-paid check is applied. Amortising-tranche principal is rendered in the Principal section, where it is also counted by the interest-section emission upstream.

The engine's `ProjectionInputs.tranches[i]` carries `isAmortising` (`projection.ts:128`); `period.tranchePrincipal[i]` does not — the entry shape is `{ className, paid, endBalance }` only. The audit comment ("deferred to a future engine instrumentation pass") accurately describes what's missing.

**PPM-correct behavior:** The Principal section row should be skipped for any tranche where `t.isAmortising && period.trancheInterest[i].paid > 0` (i.e., the amortisation already flowed through the interest waterfall). The cleaner long-term fix is to extend `period.tranchePrincipal[i]` with `isAmortising: boolean` so the renderer doesn't have to cross-reference two arrays.

**Quantitative magnitude:** Zero on Euro XV (no amortising tranches in the current capital structure — Class X is not present). Latent on any deal whose capital structure includes Class X or any other amortising tranche. Display-side double-count; engine numbers are correct.

**Deferral rationale:** Display heuristic gap — engine truth is intact.

**Path to close:**
1. Either (a) implement the heuristic the comment describes by checking `period.trancheInterest[i].paid > 0` alongside `tp.paid > 0` for the same tranche, OR (b) extend `period.tranchePrincipal[i]` with `isAmortising: boolean` and filter on that. Option (b) is cleaner — the tranche metadata is in the engine, and surfacing it on the per-period entry removes the cross-array lookup.
2. Update `period-trace-lines.ts:289-304` to use the new field; remove the stale comment.
3. Add a unit test in `app/clo/waterfall/__tests__/period-trace-lines.test.ts` asserting that an amortising tranche with paid interest AND paid principal renders only ONE row (in the interest section).

**Test:** No active marker on Euro XV (no amortising tranches). After the fix, the new unit test pins the behavior on a synthetic period with `t.isAmortising: true`.

---

<a id="ki-49"></a>
### [KI-49] `stepTrace` emits requested fee amounts, not actually-paid amounts, when interest is exhausted (sub mgmt + six senior expenses, normal mode only)

**Scope correction (2026-04-30):** This entry was originally framed as a sub-mgmt-fee-only bug. Independent re-review found the same shape across the six senior-expense `stepTrace` fields. The "handled correctly by `applySeniorExpensesToAvailable` per KI-21 Scope 2" claim in the prior version was wrong — see verification below. The fix described here covers all seven emission points.

**PPM reference:** Steps (A.i) Taxes through (X) Sub Mgmt Fee — paid sequentially out of `availableInterest`. Under stress, residual interest can be insufficient before the entire sequence is paid; each unpaid step is a shortfall that does not flow.

**Current engine behavior:** Verified across two surfaces.

1. **Sub Mgmt Fee** (`projection.ts:2341-2342`) truncates correctly on cash:
   ```
   const subFeeAmount = beginningPar * (subFeePct / 100) * dayFracActual;
   availableInterest -= Math.min(subFeeAmount, availableInterest);
   ```
   But the `stepTrace` emission at `projection.ts:2465` reads `subMgmtFeePaid: subFeeAmount` — the **requested**, uncapped amount. Under stress (interest exhausted before step X), the trace overstates what was paid.

2. **Six senior-expense fields** (`projection.ts:2103-2106` and `:2451-2463`) have the same shape:
   ```
   ({ remainingAvailable: availableInterest } = applySeniorExpensesToAvailable(
     seniorExpenseBreakdown,
     availableInterest,
   ));
   ```
   The destructure discards `actualDeducted` (which the helper computes — verified by reading the helper at `senior-expense-breakdown.ts`). The `stepTrace` then emits the **requested** values from `seniorExpenseBreakdown.*`:
   - `taxes: seniorExpenseBreakdown.taxes` (PPM A.i)
   - `issuerProfit: seniorExpenseBreakdown.issuerProfit` (PPM A.ii)
   - `trusteeFeesPaid: seniorExpenseBreakdown.trusteeCapped` (PPM B, post-cap, pre-truncation)
   - `adminFeesPaid: seniorExpenseBreakdown.adminCapped` (PPM C, post-cap, pre-truncation)
   - `seniorMgmtFeePaid: seniorExpenseBreakdown.seniorMgmt` (PPM E)
   - `hedgePaymentPaid: seniorExpenseBreakdown.hedge` (PPM F)

   Under stress (interest exhausted partway through A→F), the fields late in the sequence emit values that exceed what was actually deducted from `availableInterest`. Cash flow is correct (the helper truncates internally); only the trace emission lies.

**Bug is normal-mode only.** The accelerated-mode executor (`projection.ts:733-737`) computes truncated payable amounts via `pay(input.<bucket>)` for each senior-expense field and the sub mgmt fee, and the period emission at `:1888` correctly forwards them via `accelResult.<field>Paid`. Under acceleration, the trace matches the cash. The bug is exclusive to the normal-mode period loop's emission block.

**PPM-correct behavior:** Each `stepTrace` field emits the **actually-paid** amount; under stress, paid < requested and the difference is a shortfall. Either:
- Capture the truncated value into per-bucket locals and emit those.
- Add `*Shortfall` fields per bucket so the trace shows requested AND paid (post-fix invariant: `paid + shortfall === requested` per field).
- Reuse the helper's `actualDeducted` return — propagate proportionally to each bucket per its share of the requested amount in PPM order.

**Quantitative magnitude:** Zero on Euro XV base case (interest is sufficient through step X — every bucket paid in full). Activates under stress where rated-tranche interest, OC cures, reinvestment OC diversion, and senior expenses sum to more than `interestCollected`. Bounded per bucket by the requested fee. The UI's per-period waterfall trace, partner-export PDF, and any downstream aggregator that sums `stepTrace.*` to reconcile against `interestCollected` will show fees > interest under stress, an obvious tell-tale once it fires.

**Deferral rationale:** Trace correctness gap. Cash flows downstream of `availableInterest` are right (they consume the truncated amount); only the partner-visible trace emission lies.

**Path to close:**
1. At `projection.ts:2103-2106`, destructure both `remainingAvailable` AND `actualDeducted` from `applySeniorExpensesToAvailable`. Either expose per-bucket paid values from the helper directly (preferred — single source for truncation order), or apply the cumulative-truncation logic in PPM order locally to derive per-bucket paid.
2. At `projection.ts:2341-2342`, capture `const subFeePaid = Math.min(subFeeAmount, availableInterest)` and use it in both the deduction and the trace emission.
3. Update the `stepTrace` emission at lines 2451-2465 to use the truncated values for all seven fields (taxes, issuerProfit, trusteeFeesPaid, adminFeesPaid, seniorMgmtFeePaid, hedgePaymentPaid, subMgmtFeePaid).
4. Add `*Shortfall: number` siblings to `PeriodStepTrace` for the seven fields so partner-visible trace can render both requested and paid.
5. Code-side comment cleanup ships in same PR: the stale `// PPM Step W: Subordinated management fee` comment at `projection.ts:2340` should read `// PPM Step X` (`ppm-step-map.ts:171` confirms the bucket maps to `["x.1", "x.2", "x.3"]`; the engine type docstring at `projection.ts:241` also says step X). Confined to the comment line; no functional change.
6. Re-run the N1 harness — Euro XV base case should be unaffected (shortfall = 0 across all seven fields).
7. Add a synthetic-stress test in `n1-correctness.test.ts` (or `projection-edge-cases.test.ts`) asserting on a high-fee / low-interest period: `paid + shortfall === requested` per field, and `Σpaid ≤ interestCollected`. Also assert acceleration-mode trace matches cash on the same scenario (no regression).

**Test:** No active marker on Euro XV. The synthetic-stress test above pins it.

---

<a id="ki-50"></a>
### [KI-50] `parseNumeric` strips commas without locale awareness — European-format numbers parse wrong

**Context:** SDF (Standard Distribution File) and trustee reports are produced by administrators who localize their output. American format uses `,` as thousands separator and `.` as decimal (`1,500,000.00`). European/continental format uses `.` as thousands separator and `,` as decimal (`1.500.000,00`).

**Current engine behavior:** `web/lib/clo/sdf/csv-utils.ts:60-69`:

```
export function parseNumeric(value: string | undefined | null): number | null {
  if (value == null || value.trim() === "") return null;
  let cleaned = value.trim();
  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNegative) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/,/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}
```

The `replace(/,/g, "")` strips ALL commas regardless of role. Behavior:

- American format `"1,500,000.00"` → strip commas → `"1500000.00"` → `parseFloat` returns `1500000` ✓
- European format `"1.500.000,00"` → `replace(/,/g, "")` strips the decimal comma (the function makes no distinction between thousands-separator commas and decimal commas) → `"1.500.000.00"` → `parseFloat` greedily parses up to the second `.` → returns `1.5`. **A 1,000,000× error on every numeric column from a European-format trustee report.**
- Currency-prefixed `"€1,234.56"` → comma stripped → `"€1234.56"` → `parseFloat` cannot parse leading non-numeric → `NaN` → returns `null`. Silent data loss.

The resolver has `normalizeNumericString` for some fields with locale handling, but `parseNumeric` is the front door for the SDF parsers (`parse-collateral`, `parse-notes`, `parse-asset-level`, `parse-test-results`, `parse-accounts`).

**PPM-correct behavior:** Locale-aware numeric parsing. Either (a) detect the format from the file (if `,` appears more often than `.`, treat `,` as thousands; otherwise treat `,` as decimal), or (b) take the locale as an ingest-time parameter from the trustee/administrator metadata.

**Quantitative magnitude:** Zero on Euro XV today (BNY trustee reports use American format). Catastrophic on any trustee whose reports use European decimal format — silent 1,000,000× errors on every par balance, market value, principal balance, and account balance. Currency-prefixed values silently disappear.

**Deferral rationale:** Latent. Critical the moment a non-American-format trustee report is ingested.

**Path to close:**
1. Replace `parseNumeric` at `csv-utils.ts:60-69` with a locale-detecting version. Detection heuristic: count `,` and `.` occurrences; if `,` count > `.` count, treat `,` as thousands and `.` as decimal (American); if reversed, vice versa (European); if equal, accept both formats by stripping the non-decimal separator only after detecting the trailing decimal candidate.
2. Strip leading currency symbols (`€`, `$`, `£`) before parsing.
3. Add unit tests covering: American thousands, European thousands, European decimal-only ("1,5"), currency-prefixed, parens-as-negative interaction with European format ("(1.500,00)").
4. Add an ingestion-gate validator that flags any numeric column where the parsed magnitude is suspiciously small (e.g., par balance < €1,000) — likely a locale mis-parse.

**Test:** No active marker on Euro XV. After the fix, parser unit tests pin the locale handling. Add a fixture-regeneration honesty guard that runs the parser against synthetic European-format SDF rows.

---

<a id="ki-51"></a>
### [KI-51] `normalizeComplianceTestType` derives `isPassing` as `actual >= trigger` for all tests, including lower-is-better

**PPM reference:** Compliance tests have two directional families. Higher-is-better: OC ratios, IC ratios, WAS, recovery rates. Lower-is-better: WARF, WAL, concentration limits (Caa, CCC, fixed-rate, cov-lite, single-obligor). Pass condition is `actual ≥ trigger` for the first family and `actual ≤ trigger` for the second.

**Current engine behavior:** `web/lib/clo/ingestion-gate.ts:140-148`:

```
let isPassing = test.isPassing;
if (isPassing == null && test.actualValue != null && test.triggerLevel != null) {
  const passing = test.actualValue >= test.triggerLevel;
  fixes.push({...});
  isPassing = passing;
}
```

The `actualValue >= triggerLevel` comparison is applied to **every** test where the source did not supply `isPassing`. For a WARF test with actual 3,100 and trigger 3,000 (max allowed), the test FAILS in PPM terms but the gate computes `3100 >= 3000 → true → PASSING`. Same for a Caa concentration test: `8% actual >= 7.5% trigger → PASSING` when the test has FAILED.

This fires only when the source data did not populate `isPassing` (a fallback path). The compliance-test ingest at `clo_compliance_tests` may or may not always populate; needs verification of how often the fallback fires in practice.

**PPM-correct behavior:** Direction depends on `testType`. The function would need to inspect `testType` and apply the appropriate comparison: `OC_PAR`, `IC`, `WAS`, `RECOVERY` → `>=`; `WARF`, `WAL`, `CONCENTRATION` (and any test in `c.testType` that maps to a "lower-is-better" family) → `<=`.

**Quantitative magnitude:** Display-side wrong-direction badges on lower-is-better tests when the source omits `isPassing`. Materiality depends on (a) how often the fallback fires vs source-populated values, and (b) whether downstream consumers (cross-reference UI, partner-facing compliance summary) treat `isPassing` as authoritative or recompute it themselves. Verification needed: grep consumers of the normalized `isPassing` flag, and audit production data for the % of compliance test rows where source `isPassing` is null.

**Deferral rationale:** Tentative until the consumer audit confirms partner-visible impact. The bug is real in the gate function; the question is how loud it is in practice.

**Path to close:**
1. Add a `lowerIsBetter` set: `{ "WARF", "WAL", "CONCENTRATION", "DIVERSITY_MIN" }` (verify the canonical set against the resolver's testType taxonomy and concentration categories).
2. Replace the comparison at `ingestion-gate.ts:141` with `const passing = lowerIsBetter.has(testType) ? actual <= trigger : actual >= trigger;`.
3. Add unit tests for both directions: WARF actual 3100 / trigger 3000 → failing; Caa actual 8% / trigger 7.5% → failing; OC actual 130% / trigger 105% → passing; IC actual 110% / trigger 105% → passing.
4. Audit downstream consumers of `isPassing` to confirm whether they trust this flag or recompute. Document the answer here.

**Test:** No active marker. After the fix, the directional unit tests above pin both families.

---

<a id="ki-52"></a>
### [KI-52] Forward-period EoD test principal-cash component hardcoded to 0 — CLOSED (commit `e3d5f1e`, 2026-04-23)

**Reconstructed retroactively (2026-04-30):** Bijection bookkeeping. The fix shipped without a ledger entry; this entry exists so the closure trail is auditable.

**PPM reference:** Condition 10(a)(iv) Adjusted Collateral Principal Amount (compositional EoD numerator). The numerator is the sum of: (1) APB of non-defaulted obligations, (2) MV × PB of defaulted obligations, (3) Principal Proceeds in the Principal Account on the Measurement Date. Component (3) is structurally part of the numerator — omitting it makes the test insensitive in distressed scenarios where principal cash is the largest contributor.

**Pre-fix behavior:** The forward-period EoD test in the engine's per-period loop passed `0` to `computeEventOfDefaultTest` for the principal-cash argument, regardless of the period's actual residual principal cash. Under stress (defaults spiking, reinvestment opportunities shrinking, post-RP with throttled reinvestment), the principal account is strictly positive at measurement and forms component (3) of the compositional numerator. Hardcoding to zero under-counted the numerator and made forward-loop EoD detection insensitive in exactly the distressed scenarios the test exists to catch.

**Fix (commit `e3d5f1e`, 2026-04-23):** Replaced the hardcoded `0` with `remainingPrelim` — the principal proceeds still parked on the Principal Account after the first paydown pass and before any further distribution, the same quantity used in the class OC numerator construction at `projection.ts:1994`. Rationale documented in the 10-line comment block at `projection.ts:2054-2063`.

**Quantitative magnitude:** Zero on Euro XV base case (no forward EoD breach in the projection horizon). Magnitude under stress depends on `remainingPrelim` per period — in heavy-loss scenarios it can be in the tens of millions of €, capable of flipping the EoD test from "passing" (numerator under-counted) to "failing" (numerator correct).

**Cross-references:**
- The OTHER forward-period EoD bug at `projection.ts:2050-2053` — literal `"Class A"` string match instead of `seniorityRank`-based discovery — is tracked separately as [KI-43](#ki-43). Both bugs lived in the same code block and KI-43 remains open. The two were not fixed together.
- The T=0 path for the principal-cash component uses `initialPrincipalCash` correctly (`projection.ts:1314`).

**Verification:** `n1-correctness.test.ts` and `b1-event-of-default.test.ts` continue to pass. The fix did not introduce new markers because the bug was latent on Euro XV (no forward breach in the test scenarios).

**Test:** No retrospective marker — the bug was not pinned by `failsWithMagnitude` before closure. A regression would manifest as the principal-cash bucket reading 0 in `numeratorComponents.principalCash` under a stress scenario; KI-43's planned synthetic-fixture #10 (post-v6 plan §6.1) covers this region.

---

<a id="ki-53"></a>
### [KI-53] `ppm-step-map.ts` docstring drift on closed buckets (bijection violation, same shape as KI-42)

**Context:** `ppm-step-map.ts` is the canonical mapping from engine `EngineBucket` field names to PPM step codes. The docstring annotations on each bucket (`// step a.i — NOT EMITTED by engine (KI-XX)`) are a load-bearing reading aid — a future engineer modifying the engine reads these to understand which buckets have shipped. The annotations have drifted away from current code state in the same shape [KI-42](#ki-42) documents for `failsWithMagnitude`.

**Current engine behavior:** Verified at `web/lib/clo/ppm-step-map.ts`:
- **Line 95 comment block:** `// Buckets the engine does NOT emit (A(i) taxes, A(ii) Issuer Profit, D, V, Y, Z, AA, BB) are modeled as zero by the harness — see KI-01/02/03/05/06`. A.i / A.ii / Y / Z are no longer in this set.
- **Line 102:** `| "taxes"               // step a.i  — NOT EMITTED by engine (KI-01)`. Stale on two counts: (a) `taxes` IS emitted via `seniorExpenseBreakdown.taxes` at `projection.ts:2451`; (b) the relevant KI for the taxes mechanic is [KI-09](#ki-09), not [KI-01](#ki-01). KI-09 is CLOSED.
- **Line 103:** `| "issuerProfit"        // step a.ii — NOT EMITTED by engine (KI-01)`. KI-01 is CLOSED. Engine emits via `seniorExpenseBreakdown.issuerProfit` at `projection.ts:2452`.
- **Line 127:** `| "trusteeOverflow"     // step y    — NOT EMITTED by engine pre-C3 (KI for Sprint 3)`. C3 shipped Sprint 3. Engine emits `trusteeOverflowPaid` at `projection.ts:2356, 2460` (see [KI-08](#ki-08)).
- **Line 128:** `| "adminOverflow"       // step z    — NOT EMITTED by engine pre-C3`. Same as line 127 — C3 closed.

**PPM-correct behavior:** N/A — code-comment correctness item.

**Quantitative magnitude:** Zero numerical impact. Affects every future PR that touches the waterfall — a reader checking "has this bucket shipped?" against the docstring gets the wrong answer for at least four buckets, and may then either re-implement an already-shipped mechanic or skip a closed-KI cleanup that was the actual goal.

**Deferral rationale:** Same shape as [KI-42](#ki-42) (`failsWithMagnitude` discipline gap on day-count residuals): a bijection bookkeeping violation between the ledger's recorded closures and the code's recorded state. Distinct site (code docstrings instead of test markers) but the same correctness-trail breach.

**Path to close:**
1. Refresh line 102 to: `// step a.i — emitted via seniorExpenseBreakdown.taxes (KI-09 closed Sprint 3)`.
2. Refresh line 103 to: `// step a.ii — emitted via seniorExpenseBreakdown.issuerProfit (KI-01 closed Sprint 4)`.
3. Refresh line 127 to: `// step y — emitted as trusteeOverflowPaid (C3 closed Sprint 3, KI-08 partial)`.
4. Refresh line 128 to: `// step z — emitted as adminOverflowPaid (C3 closed Sprint 3, KI-08 partial)`.
5. Update the line 95 comment block to remove A.i / A.ii / Y / Z from the "modeled as zero by the harness" enumeration.
6. Add a CI-time check (a vitest test that scans `ppm-step-map.ts` for any `NOT EMITTED` annotation and verifies the cited KI is in the Open or Latent or Deferred sections of this ledger; build fails if any cited KI is in the Closed section). Same shape as the [KI-47](#ki-47) check for `ModelAssumptions.tsx`.

**Test:** No active marker. After the refresh lands, the CI check above pins the discipline (and would catch this category of drift on every future PR).

---

