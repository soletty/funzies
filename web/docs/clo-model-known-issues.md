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

Updated per sprint. Entries are closed by deleting the entry, its index pointer, and its anchor entirely once the corresponding fix ships and is verified in the N1 harness — no `[CLOSED]` marker is left behind. The entry's `failsWithMagnitude` marker test is removed (or its assertion flipped from "documents the bug" to "asserts the fix") in the same change. Codebase rationale that the closed entry used to provide is described directly in code via inline invariant comments (no orphan KI-XX cross-references), so the bijection scan in `web/lib/clo/__tests__/disclosure-bijection.test.ts` flips loud on any stale reference.

---

## Index

Categorized so a partner reading cold can separate "what's still wrong" from "what we decided." Section membership is authoritative; the numerical KI order is historical (sprint-chronological).

### Open — currently wrong, path to close documented
- [KI-08 — `trusteeFeesPaid` bundled steps B+C (PARTIAL: pre-fill D3 + cap mechanics C3 shipped; KI-16 PPM verifications remain)](#ki-08)
- [KI-12a — Senior / sub management fee base discrepancy](#ki-12a)
- [KI-16 — KI-08 closure assumptions pending PPM verification](#ki-16)
- [KI-18 — pctCccAndBelow per-agency rollup ships; ~1.3pp residual from per-position rating extraction coverage gap](#ki-18)
- [KI-20 — D2 legacy escape-hatch on 6 test-factory sites](#ki-20)
- [KI-21 — Parallel implementations of same calculation (PARTIAL — Scope 1+2 closed; Scope 3 accel + T=0 remains)](#ki-21)
- [KI-23 — Industry taxonomy missing on BuyListItem + ResolvedLoan blocks industry-cap filtering](#ki-23)
- [KI-24 — E1 citation propagation coverage is partial (8 deferred paths)](#ki-24)
- [KI-27 — Pre-existing tranche `deferredInterestBalance` dropped at projection start](#ki-27)
- [KI-28 — Asset-side fixed-rate loans accrue on Actual/360 (mirrored tranche uses 30/360)](#ki-28)
- [KI-33 — Reinvestment loan synthesis assumes par-purchase (€1 diverted = €1 par)](#ki-33)
- [KI-34 — Non-call period not enforced; user-typed pre-NCP call dates pass through](#ki-34)
- [KI-35 — Partial DDTL draw silently discards the un-drawn commitment](#ki-35)

### Latent — currently inactive on Euro XV; emerges on portability or stress
*Distinct from "Deferred" (those are intentional design choices about mechanics that exist in the indenture but the model elects not to simulate). "Latent" entries are unmodeled or hardcoded paths whose current Euro XV magnitude happens to be zero, but which will produce wrong numbers the moment a deal hits the triggering condition (different deal structure, different PPM, non-zero balance, FX exposure, etc.). Treat each as a real bug whose materiality is data-dependent, not a deliberate scope decision.*

- [KI-26 — Reserve account opening balances dropped (Interest, Smoothing, Supplemental, Expense)](#ki-26)
- [KI-29 — Discount / long-dated obligation haircuts are static snapshots, not recomputed forward](#ki-29)
- [KI-31 — Hedge cost bps never extracted; engine emits zero on every hedged deal](#ki-31)
- [KI-32 — Per-position agency recovery rates ignored for forward defaults (used only for pre-existing defaulted positions)](#ki-32)
- [KI-36 — Per-tranche `payment_frequency` and `day_count_convention` extracted but not consumed](#ki-36)
- [KI-37 — Loan-level `floorRate`, `pikAmount`, `creditWatch`, `isCovLite` extracted but unused by engine](#ki-37)
- [KI-38 — FX / multi-currency unmodeled; `native_currency` parsed and discarded](#ki-38)
- [KI-51 — `normalizeComplianceTestType` derives `isPassing` as `actual >= trigger` for all tests, including lower-is-better (WARF, WAL, concentration)](#ki-51)
- [KI-56 — N1 harness step-G sharing: `classA_interest` bucket compares against trustee[g] which on a Class X-bearing deal includes Class X amort](#ki-56)
- [KI-60 — Three independent `normalizeClassName` implementations with divergent output shapes (sibling pattern to KI-21)](#ki-60)
- [KI-61 — Partial-default Caa/CCC concentration gap: surviving piece of partially-defaulted loan retained in denominator vs PPM whole-obligor exclusion (TENTATIVE — pending PPM read)](#ki-61)

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

<a id="ki-44"></a>
*KI-44 (proposed during 2026-04-30 audit, not added): a candidate raised that `parse-collateral.ts:209-210` writes absolute `Market_Value` into the percent-shaped `current_price` column, with the bug masked on Euro XV by Asset Level enrichment. Verified not a bug. Two pieces of evidence: (i) `ENRICHMENT_COLUMNS` at `sdf/ingest.ts:450` lists only `current_price`, not `market_value` — Asset Level cannot overwrite `market_value`; (ii) every fixture row shows `marketValue == currentPrice` (e.g. 80.097, 99.823, 91.797) which is consistent only with `raw.Market_Value` being itself percent-shaped. If `raw.Market_Value` were absolute, the two columns would diverge after enrichment because only `current_price` gets overwritten. Conclusion: `raw.Market_Value` is percent-shaped despite the misleading column name; parser is correct; consumers are correct. Disposition: not added to ledger. A future verification against the SDF spec would close the question definitively.*

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

**Day-count residual markers (registered via `failsWithMagnitude`, close with KI-12a harness fix):**
- `n1-correctness.test.ts > KI-08-dayCountResidual-trustee` — `expectedDrift: 13, tolerance: 5`.
- `n1-correctness.test.ts > KI-08-dayCountResidual-admin` — `expectedDrift: 709, tolerance: 50`.

Both markers track the 91/360-vs-90/360 day-count residual exposed by the harness period mismatch (sibling mechanism to the six KI-12b class-interest markers); they re-baseline or remove together when KI-12a lands.

**Cascade re-baselines**: KI-13a adjusted by the C3 split preserving aggregate behavior; `stepTrace.trusteeFeesPaid` currently bundles steps (B)+(C)+(Y)+(Z) to preserve the N1 harness bucket semantics. Split-out fields (`adminFeesPaid`, `trusteeOverflowPaid`, `adminOverflowPaid`) are additive diagnostic fields — the harness will be un-aggregated in a follow-up (see task #48).

**Ledger disposition**: remain OPEN (partial) until KI-16 resolves the three PPM verifications. Then move to Closed issues.

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

<a id="ki-18"></a>
### [KI-18] pctCccAndBelow per-agency rollup ships, but per-position rating extraction coverage gap leaves ~1.3pp residual

**PPM reference:** Condition 1 / definitions — "Caa Obligation", "CCC Obligation". Separate per-agency definitions (Moody's Caa1/Caa2/Caa3 + Ca + C, and Fitch CCC+/CCC/CCC-/CC/C). The trustee's "Caa and below" concentration test takes the **max across agencies** — a position counted by either rating agency flips it into the bucket. Per PPM definition (PDF p. 138), defaulted obligations are EXCLUDED from the Caa Obligations set.

**Current engine behavior:** `computePoolQualityMetrics` in `pool-metrics.ts` now computes per-agency Caa/CCC rollups (`isMoodysCaaOrBelow`, `isFitchCccOrBelow` from `rating-mapping.ts`) and takes max across agencies via `pctCccAndBelow = max(pctMoodysCaa, pctFitchCcc)` — the per-agency methodology required by the path-to-close. Defaulted positions are excluded **implicitly**: the engine moves par from `LoanState.survivingPar` into `LoanState.defaultedParPending` on default, so the `survivingPar > 0` filter at `projection.ts:1387` naturally drops fully-defaulted loans before they reach the helper. There is no explicit `!isDefaulted` boolean on `LoanState` — only `defaultedParPending: number`. The implicit filter is PPM-correct for FULL defaults (Caa Obligations, PDF p. 138). PARTIAL defaults are a separate known gap tracked as **KI-61** — a loan with `survivingPar > 0 && defaultedParPending > 0` retains its surviving piece in the concentration denominator while PPM would classify the whole obligor position as a Defaulted Obligation. **Additionally**, ~6% of Euro XV loan positions have `moodysRatingFinal === null && fitchRatingFinal === null` (per-agency rating extraction missing); these fall through to the coarse `ratingBucket === "CCC"` legacy path. The C2 parity tolerance currently sits at **±2pp** (`c2-quality-forward-projection.test.ts:100`) to absorb the resulting ~1.3pp residual drift.

**Why the entry stays open:** the path-to-close required tightening the C2 parity tolerance to ±0.1pp. ±2pp is a partial close — the per-agency methodology landed, but the residual extraction-coverage gap is still wide enough that the original ±3pp bug magnitude is within the test's tolerance. Deleting the entry while ±2pp tolerance is in place would be a fake-close (the assertion would pass even if the old methodology were reinstated). The remaining work is per-position rating extraction, NOT pool-metrics arithmetic.

**Quantitative magnitude:** Reduced from ±3pp (pre-fix) to ~1.3pp (post-fix); residual driven by extraction coverage, not by methodology.

**Impact on compliance enforcement:** Euro XV's Moody's Caa concentration trigger is 7.5% vs observed 6.92% — a 0.58 pp cushion. Engine's ~1.3pp residual is now 2× the cushion (down from 5×). C1 reinvestment compliance now DOES enforce against the Moody's Caa and Fitch CCC concentration tests via Feature A's multi-gate enrichment — the trigger numerator uses `pctMoodysCaa` / `pctFitchCcc` from the per-agency rollup directly, NOT the coarse `pctCccAndBelow`, so the ±2pp parity drift on the legacy aggregate does not bleed into the compliance gate. The compliance gate's correctness is bound by per-loan rating extraction quality, not by the parity tolerance.

**Path to close (revised):** (a) Improve per-loan rating extraction such that `moodysRatingFinal` and `fitchRatingFinal` are populated for ≥95% of positions on Euro XV. The remaining 5% legacy-bucket fallback is acceptable. (b) Tighten the C2 parity tolerance from ±2pp to ±0.1pp once coverage is sufficient. (c) Document the bijection between the per-agency rollup (used by C1 enforcement) and the legacy aggregate `pctCccAndBelow` (used for partner-facing display) so neither drifts independently.

**Defaulted-position semantics correction:** an earlier draft of this entry's path-to-close said "include defaulted positions in Caa bucket." That was wrong — per PPM PDF p. 138 the Caa Obligations definition explicitly EXCLUDES Defaulted Obligations. The current implementation is PPM-correct **for full defaults** via the implicit `survivingPar > 0` exit at `projection.ts:1387` plus LML exclusion inside the pool-metrics loop. The invariant lives at the call site as a comment in `pool-metrics.ts:159-176`. The partial-default case is NOT handled by this filter and is tracked separately as KI-61.

**Test:** `c2-quality-forward-projection.test.ts:100` — current tolerance ±2pp on `pctCccAndBelow` is the ledger anchor for the residual extraction-coverage gap. Tighten to ±0.1pp on closure.

**⚠ No active honesty-guard test for partial enforcement.** C1 enforcement against Caa/CCC concentration tests is now LIVE (per Feature A), so the prior "we don't enforce Caa" stance has flipped — the c1 test file's positive-enforcement assertions cover the new path. The remaining concern is the parity-tolerance gap on the legacy aggregate; pinning that requires re-validation each time the rating extraction pipeline changes.

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

<a id="ki-56"></a>
### [KI-56] N1 harness step-G sharing: `classA_interest` bucket compares against trustee[g] which on a Class X-bearing deal includes Class X amort

**PPM reference:** PPM Condition 7 / step (G) — interest waterfall pari-passu disbursement to Class A interest AND Class X scheduled amortisation. Trustees report a single line for step (g) summing both flows; the engine emits them separately into `stepTrace.classA_interest` (via `trancheInterest[]`) and `stepTrace.classXAmortFromInterest`.

**Current engine behavior:** `web/lib/clo/ppm-step-map.ts:149-195` (the `ENGINE_BUCKET_TO_PPM` map) maps `classA_interest: ["g"]`. The new `classXAmortFromInterest` bucket is mapped to `[]` (audit-metric, no PPM steps) as an interim measure documented inline in that file. The harness at `backtest-harness.ts:197-221` iterates buckets and sums trustee amounts at each bucket's mapped steps, comparing against the engine value.

On Euro XV (no Class X tranche), the harness behavior is correct: `classXAmortFromInterest` engine value is 0; trustee step-(g) row reports only Class A interest; `classA_interest` ties to trustee[g]; `classXAmortFromInterest` ties to its empty-mapping zero comparison. No false delta.

On a future deal whose capital structure includes Class X (or any other amortising tranche): trustee step-(g) reports the SUM of Class A interest + Class X amort. The engine's `classA_interest` bucket would then compare against `trustee[g] = classA_interest_actual + classX_amort_actual`, producing a spurious delta of approximately `classX_amort_actual` per period — flagged by the harness as a `classA_interest` failure even though the engine is emitting the right number into the right bucket.

**PPM-correct behavior:** The harness must compare `(engine.classA_interest + engine.classXAmortFromInterest)` against `trustee[g]`, OR split the trustee step-(g) row by sub-type (Class A interest line vs Class X amort line) — the latter requires per-row trustee data that may not be reliably parseable across all trustees / vintages. Two options for the bucket map:
- **(a)** `classXAmortFromInterest: ["g"]` alongside `classA_interest: ["g"]`, and update the harness loop to sum trustee[g] across BOTH engine buckets when comparing — turns the 1:1 bucket-step relationship into 1-many on step g.
- **(b)** Merge `classA_interest` + `classXAmortFromInterest` into a combined `stepG_interest` bucket whose engine value is `trancheInterest["Class A"].paid + classXAmortFromInterest`, restoring 1:1.

Option (a) preserves per-source granularity in the harness output (partner can see separately how much was Class A interest vs Class X amort) but requires harness logic changes. Option (b) is simpler but loses the per-source split.

**Quantitative magnitude:** Zero on Euro XV. On a Class X-bearing deal, magnitude per period equals the Class X amort schedule paid in that period — typically 0.5%-1% of original Class X par per quarter, e.g. €500K/quarter on a €5M Class X amortising over 10 quarters. Compounds to a `classA_interest` bucket failure equal to total Class X amort over the harness period.

**Deferral rationale:** Latent. Euro XV has no Class X. Filing per the discipline so the issue is captured before the first Class X-bearing deal is ingested into the harness — at which point the false `classA_interest` delta would be the harness's loudest failure and could be misread as an engine-side bug.

**Path to close:**
1. Decide between option (a) and option (b) above. Recommend (b) for simplicity if the partner-facing harness table doesn't need per-source breakdown; (a) if it does.
2. If (a): change `ppm-step-map.ts` mapping to `classXAmortFromInterest: ["g"]`, and update the harness comparison loop at `backtest-harness.ts:197-221` to sum across all buckets sharing a step. Update the reverse-lookup `ppmStepToEngineBucket` to handle 1-many or document it as 1-of-many.
3. If (b): rename `classA_interest` to `stepG_interest`, change `extractEngineBuckets` to populate from `trancheInterestByClass.get("Class A") + p.stepTrace.classXAmortFromInterest`, drop `classXAmortFromInterest` from `EngineBucket`. Update `STEP_TOLERANCES_TARGET` accordingly.
4. Add a marker test that constructs a synthetic harness scenario with a Class X tranche (using a synthetic trustee distribution row at step g containing both Class A interest and Class X amort), and asserts the bucket comparison succeeds. Pre-fix the marker would assert the spurious delta; post-fix it flips to assertion of correctness.

**Test:** No active marker on Euro XV (no Class X). After the fix, the synthetic harness scenario above pins it.

---

<a id="ki-60"></a>
### [KI-60] Three independent `normalizeClassName` implementations with divergent output shapes — sibling pattern to KI-21 (parallel-implementation drift)

**Context:** Three separate `normalizeClassName` functions exist across the codebase, each with a different output shape on the same input. Same shape as the (now closed) KI-21 Scope 1 quality-metric drift — three implementations of the "same" logic that diverge silently. KI-21 was retired by extracting a single canonical helper; KI-60 awaits the same treatment.

**Current behavior — three implementations, three output shapes:**

| File | Sub aliasing | "Class A-1" → | "Sub Notes" → |
|---|---|---|---|
| `web/lib/clo/intex/parse-past-cashflows.ts:207-220` (exported, used by intex parser + ingest) | "Subordinated" / "Sub" / "Equity" / "Income Note" → `"sub"` | `"a-1"` (lowercase, no prefix) | `"sub"` |
| `web/lib/clo/sdf/parse-notes.ts:54-73` (private, used inside parse-notes only) | Only `includes("Subordinated")` collapses to `"Subordinated Notes"` — there is **no** alias path for the literal `"Sub Notes"` / `"Sub"` / `"Equity"` / `"Income Note"` shapes. | `"Class A-1"` (mixed case, prefix preserved) | `"Class Sub"` — verified by tracing: `includes("Subordinated")` → false (substring missing); `match(/^([A-Z][A-Z0-9-]*)/)` captures `"Sub"`; returns `"Class Sub"`. The literal substring `"Subordinated"` is required for the verbatim alias branch to fire. |
| `web/lib/clo/api.ts:418-424` (exported, used by `app/api/clo/waterfall/check-data/route.ts:164,176`) | Alias map: SUB / SUBORD / SUB-NOTES / SUBORDINATED-NOTES → `"SUBORDINATED"`; EQ / EQUITY-NOTES → `"EQUITY"`; MEZZ → `"MEZZANINE"`; INCOME / INCOME-NOTES / RESIDUAL → `"INCOME-NOTE"` | `"A-1"` (UPPERCASE, no prefix) | `"SUBORDINATED"` |

The three live in three layers (source-data, source-data, route-handler) and were written independently. Each works self-consistently within its own caller's `Map<normalizedKey, X>` builds and lookups — but any cross-normalizer build/lookup pair would silently miss.

**PPM-correct behavior:** A single canonical normalizer (per CLAUDE.md layering: ideally in the source-data layer, exported and consumed by all downstream sites). The choice of casing is mechanical (lowercase or UPPERCASE — pick one and migrate). The choice of subordinated-aliasing is more substantive: the sub-collapse style (intex's `"sub"`) is simpler; the alias-map style (api's `"SUBORDINATED"` / `"EQUITY"` / `"MEZZANINE"` / `"INCOME-NOTE"`) preserves more granularity for downstream consumers that want to distinguish equity vs subordinated. The PPM correctness question is whether ANY downstream consumer DOES distinguish those — if yes, alias-map shape wins; if no, sub-collapse wins.

**Quantitative magnitude:** Tentative. Currently zero observable drift on Euro XV: each normalizer is used self-consistently within its own caller. The latent risk is the next developer adding a `Map<className, X>` who imports one normalizer for the build and another for the lookup — silent miss, no warning, no test. Same shape and the same materiality argument as the (closed) KI-21 Scope 1 incident.

**Verification chain (file:line):**
- `intex/parse-past-cashflows.ts:207` exports `normalizeClassName` (returns `"a-1"` / `"sub"`).
- `intex/ingest.ts:4,49,80` uses the parser's normalizer for both build and lookup. ✓ self-consistent.
- `sdf/parse-notes.ts:54` private (not exported). Used at `parse-notes.ts:115` to populate `class_name` field on parsed SDF notes. Output style `"Class A-1"` flows into the DB row's `clo_tranches.class_name` column.
- `api.ts:418` exports `normalizeClassName` (returns `"A-1"` / `"SUBORDINATED"`).
- `app/api/clo/waterfall/check-data/route.ts:164` builds `tranchesWithSnapshots` Set with api's normalizer; `:176` reads with same. ✓ self-consistent.

**The shipped data** (`clo_tranches.class_name` populated by the SDF path at parse-notes:115) carries the parse-notes shape (`"Class A-1"` style). The intex parser then runs `intex/parse-past-cashflows.ts:283 normalizeClassName(t.className)` on that string when building `dealByNorm` — and on the CSV's group-row cells when walking. Same input shape, same normalizer → consistent. ✓.

But — the api.ts route reads `clo_tranches.class_name` ("Class A-1") and runs api's normalizer over it ("A-1"). It then compares against another normalized value (also api's normalizer). Self-consistent. ✓.

So **no current cross-normalizer site exists**, but the architectural shape is fragile.

**Deferral rationale:** Latent. Multi-file consolidation requires deciding the canonical case (UPPERCASE per api.ts is the most permissive — preserves alias-map granularity; lowercase per intex is the simplest), then migrating each call site, then deleting the duplicates. Each migration is a Map-lookup correctness surface where casing changes can silently break extant lookups. Deserves its own focused PR with the discipline of `git grep`-driven call-site review, not a close-out batch.

**Path to close:**
1. Decide the canonical normalizer's location and shape. Recommended: lift to `web/lib/clo/normalize-class-name.ts` (top of the source-data layer); pick UPPERCASE + alias-map shape (api.ts's), since it preserves the most granularity. The intex parser's `lowercase + sub-collapse` shape loses the `"EQUITY"` / `"SUBORDINATED"` distinction — that distinction is needed for any consumer that wants to badge tranches differently.
2. Re-implement the parser's `looksLikeTrancheName` to admit cells matching the canonical (case-insensitive at the input boundary).
3. Migrate `intex/ingest.ts:49,80` to the canonical normalizer. Re-run intex tests.
4. Migrate `app/api/clo/waterfall/check-data/route.ts:164,176` to the canonical normalizer (no behavior change — already aligned).
5. Migrate `sdf/parse-notes.ts:54-73` to the canonical normalizer. The `class_name` column shape on `clo_tranches` rows changes from `"Class A-1"` to `"A-1"` — backfill migration required, OR keep parse-notes-shape as the persisted shape and apply canonical normalization at read time. Decide based on which call sites are easier to migrate.
6. Delete the two non-canonical implementations. Confirm zero remaining `normalizeClassName` definitions outside the canonical file.
7. Flip the marker test from asserting `.not.toBe(...)` (current divergence) to asserting `.toBe(...)` (consolidated convergence) — or delete the test and replace with a focused unit test of the canonical normalizer's behavior.

**Test:** `web/lib/clo/__tests__/normalize-classname-divergence.test.ts` — `KI-60: triple normalizeClassName divergence (locks current bug)`. Two assertions: `intexNormalize("Class A-1") !== apiNormalize("Class A-1")` and `intexNormalize("Sub Notes") !== apiNormalize("Sub Notes")`. Plain `it()` (structural divergence, not a numeric drift). When the consolidation lands, the `.not.toBe` flips to `.toBe` (or the test is deleted). If the consolidation deletes one of the imports, the test file becomes uncompilable — same closure signal at the type level.

---

<a id="ki-61"></a>
### [KI-61] Partial-default Caa/CCC concentration gap — surviving piece of partially-defaulted loan retained in denominator vs PPM whole-obligor exclusion (TENTATIVE)

**Status:** Tentative pending PPM read of the Caa/CCC Obligations definition's treatment of partial recoveries, plus an engine trace confirming the partial-default state shape.

**PPM reference:** Condition 1 / definitions — "Caa Obligations" (PDF p. 138), "CCC Obligations" (PDF p. 127). Both definitions exclude "Defaulted Obligations" categorically. Whether a position with `survivingPar > 0` AND `defaultedParPending > 0` is classified as a Defaulted Obligation in its entirety, or only its defaulted portion is excluded, is the open question.

**Current engine behavior:** `LoanState` in `projection.ts:1135-1175` carries `survivingPar: number` and `defaultedParPending: number` — no boolean `isDefaulted` flag. On default, par migrates from `survivingPar` to `defaultedParPending` (in whole or in part depending on the default-draw model). The per-period `computeQualityMetrics` filter at `projection.ts:1387` keeps only loans with `survivingPar > 0`, so a fully-defaulted loan exits cleanly. A PARTIALLY defaulted loan, however, retains its surviving piece in the concentration denominator (`concDenom`) AND in the per-agency Caa/CCC numerator if its rating still maps Caa/CCC. PPM intent for partial recoveries is the trigger for this entry.

**PPM-correct behavior (tentative):** if PPM treats any loan with non-zero defaulted balance as a Defaulted Obligation, the engine must skip the entire loan (both surviving and pending portions) from the concentration denominator and numerators, not just the defaulted portion. The fix would be a `defaultedParPending > 0` guard in the `computeQualityMetrics` filter (or an `isDefaultedObligor` derived predicate at the LoanState level).

**Quantitative magnitude:** Zero on Euro XV today (the fixture has no partial defaults; `preExistingDefaultedPar` is fully recovered/written-off). Emerges on (a) any deal with reported partial recoveries, (b) any forward-projection scenario where a defaulted loan recovers fractionally and the recovery lag spans multiple quarters with surviving par on the books, or (c) a stress scenario where the engine's default-draw model produces fractional defaults across the pool.

**Impact on compliance enforcement:** Affects `pctMoodysCaa`, `pctFitchCcc`, and the C1 reinvestment compliance gate's Caa/CCC predicates (which read these from the same per-period helper). Could over-state or under-state the concentration depending on whether the partially-defaulted loan's rating is Caa/CCC. Worst-case shape: a deal with multiple partially-defaulted Caa-rated loans during the recovery lag would report concentration above the 7.5% trigger when PPM math says they should be excluded entirely — engine permits a reinvestment that PPM would block, or vice versa.

**Path to close:** (a) Read PPM Condition 1 "Defaulted Obligations" definition (PDF index TBD) to determine partial-recovery treatment. (b) Trace the engine's partial-default state: does `defaultedParPending > 0` always co-occur with full `survivingPar = 0`, or do partial defaults leave both > 0 simultaneously? Look at the default-draw site (`projection.ts` Monte Carlo loop) and the recovery pipeline. (c) If PPM excludes the whole obligor, add `defaultedParPending > 0` as a skip condition in `computeQualityMetrics` at `projection.ts:1387` (and the parallel filter in `maxCompliantReinvestment`). If PPM admits the surviving piece, retain current behavior and tighten this entry to a "verified, no action" closure.

**Why the entry stays open until PPM read:** the partial-default semantics question is silent today on Euro XV (zero magnitude) but load-bearing on portability and stress scenarios. CLAUDE.md doctrine: "honest uncertainty" is allowed in the ledger; "confident-but-wrong" claims are not. This entry quarantines the question until the PPM read resolves the path-to-close.

**Test:** `web/lib/clo/__tests__/ki61-partial-default-concentration.test.ts` — pending. Marker test should construct a synthetic LoanState with `survivingPar > 0 && defaultedParPending > 0` AND ratingBucket === "CCC", run `computeQualityMetrics`, and assert the loan IS counted in `pctMoodysCaa` numerator under current behavior. When KI-61 closes against PPM-says-exclude, the assertion flips to `.not.toBeIncluded`. Until the marker test ships, the entry is doubly tentative — no test pin, no path-to-close anchor.

---


