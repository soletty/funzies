# KI-16 — C3 Senior Expenses Cap PPM Verification Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify (or correct) three open C3 closure assumptions named in the KI-16 ledger entry plus a fourth surfaced during planning, all against the Ares European CLO XV Offering Circular: (1) the 20 bps default cap value, (2) the `max(2× observed, 20 bps)` heuristic, (3) the pro-rata overflow allocation between PPM steps (Y) and (Z), and (4) the pro-rata B/C allocation **within** the cap (`projection.ts:2841-2843`, separate from Y/Z overflow). Then close the KI-16 ledger entry. KI-08 stays PARTIAL after this — its day-count residual sub-component is independently blocked on KI-12a's data acquisition.

**Architecture:** Read Ares XV Offering Circular Condition 1 (Senior Expenses Cap definition), Condition 3(c) Interest Priority of Payments (steps B/C and Y/Z language and ordering), and cross-check against `ppm.json`. Pin verbatim quotes + PDF page numbers in a findings doc. For each of the four assumptions, mark VERIFIED / VERIFIED-WITH-AMENDMENT / CONTRADICTED. Ship code amendments only for contradicted/amendment assumptions; re-baseline C3 tests in lockstep; keep N1 bit-identical on Euro XV (whose observed senior expenses sit well below any plausible cap).

**Tech stack:** PPM offering circular PDF; existing `ppm.json` structured summary; `build-projection-inputs.ts` (cap default + heuristic); `projection.ts` (overflow allocation block); `c3-senior-expenses-cap.test.ts` (cap mechanics tests); `b2-post-acceleration.test.ts` (cap removal under acceleration — must remain bit-identical); `n1-correctness.test.ts` (Euro XV harness — must remain bit-identical).

---

## File Structure (in scope)

**READ-ONLY (verification source):**
- `~/Downloads/ARESXV_CDSDF_260401/Ares CLO XV - Final Offering Circular dated 14 December 2021.pdf` — 422pp offering circular, canonical source for Condition 1 + Condition 3(c)
- `/Users/solal/Documents/GitHub/funzies/ppm.json` — pre-extracted structured summary; confirms POP step letters (Y), (Z) and clause text but not Condition 1 definitions

**MODIFY (conditional on findings):**
- `web/lib/clo/build-projection-inputs.ts` — line 165 (`DEFAULT_ASSUMPTIONS.seniorExpensesCapBps: 20`), line 303 (`Math.max(observedRateBps * 2, 20)` heuristic). Static fallback when D3 can't infer; heuristic when D3 can.
- `web/lib/clo/projection.ts` — lines 3776–3784 (pro-rata overflow allocation block); lines 2814–2819 (cap construction) if the base or period changes.
- `web/lib/clo/resolver.ts` + `web/lib/clo/resolver-types.ts` — if PPM cap is a fixed extracted value, lift `seniorExpensesCapBps` into `ResolvedFees`/`ResolvedDealData` so the cap rides off the resolver, not a build-time heuristic.
- `web/lib/clo/__tests__/c3-senior-expenses-cap.test.ts` — re-baseline overflow magnitudes if allocation rule changes (currently asserts pro-rata split: 50 bps requested vs 20 bps cap → 30 bps overflow split between trustee+admin proportionally).

**CREATE:**
- `docs/plans/2026-05-04-ki-16-c3-ppm-verification-findings.md` — verbatim PPM quotes + page numbers + per-assumption verdict (VERIFIED / VERIFIED-WITH-AMENDMENT / CONTRADICTED). Persistent record so a future reviewer can audit the closure.

**DELETE (at closure):**
- KI-16 entry body, anchor (`<a id="ki-16">`), and index pointer in `web/docs/clo-model-known-issues.md`. Per project closure protocol — no `[CLOSED]` marker.
- Any `// KI-16` annotation in source (caught by `disclosure-bijection.test.ts`).

**UPDATE (at closure):**
- KI-08 entry text in `web/docs/clo-model-known-issues.md` — strip KI-16 cross-references; document the verification outcome inline; status remains PARTIAL because day-count residual markers are blocked on KI-12a.

---

## Branching strategy

Branch off `main` (KI-15 work is on `ki-15-accel-incentive-fee` and ready to merge per the existing task list). Don't predicate KI-16 on KI-15's merge landing — KI-16 touches C3 (cap mechanics) and KI-15 touches B2 (post-acceleration executor); zero file overlap, but keep the branches independent so either can merge first.

```bash
git checkout main
git pull --ff-only origin main
git checkout -b ki-16-c3-ppm-verification
```

Concurrent-agent risk: other agents may touch `build-projection-inputs.ts` or `projection.ts`. Re-fetch + rebase before each commit; final pre-merge step is `git fetch origin && git rebase origin/main`.

---

## Task 1 — Hard gate: PPM verification

**Files (read):**
- `~/Downloads/ARESXV_CDSDF_260401/Ares CLO XV - Final Offering Circular dated 14 December 2021.pdf`
- `/Users/solal/Documents/GitHub/funzies/ppm.json`

**Files (write):**
- `docs/plans/2026-05-04-ki-16-c3-ppm-verification-findings.md`

This task is a hard gate. No code change lands without verbatim PPM quotes pinned for each of the four assumptions. Quotes come with page numbers; conclusions cite specific clauses.

- [ ] **Step 1.1: Locate Condition 1 — "Senior Expenses Cap" definition**

  Search anchor: per `ppm.json:415`, "Condition 1 Index of Defined Terms spans PDF pp. 390–397. Key definitions referenced: ... Senior Expenses Cap." Open the OC PDF at pp. 390–397 and search for "Senior Expenses Cap". Capture verbatim into the findings doc:

  - Cap formula: absolute bps × base, or absolute € figure, or tiered (e.g., bps + €floor)
  - Base: Collateral Principal Amount (CPA) vs Aggregate Principal Balance (APB) vs another defined term. KI-12a established CPA ≠ APB (`beginningPar`); a CPA-based cap would create a parallel fee-base mismatch.
  - Period: per Payment Date (quarterly), per Determination Date, per annum, per fiscal year
  - Scope: trustee fees (B) + admin expenses (C) only, or broader (e.g., includes hedge counterparty replacement payments?)
  - **B/C allocation rule WITHIN the cap** (separate from Y/Z overflow rule). The engine currently splits the capped portion pro-rata between trustee (B) and admin (C) via `cappedRatio = cappedPaid / cappedRequested` at `projection.ts:2841-2843`. PPM may specify (i) joint cap with pro-rata split (current), (ii) separate caps per bucket, or (iii) sequential-within-cap (B paid up to cap, C from cap remainder). This is a **fourth assumption** beyond the three named in the KI-16 ledger entry; if the PPM contradicts current behavior the amendment also touches this block, and the KI-16 entry text is updated to acknowledge the gap.
  - Any allowed-additions language (e.g., Expense Reserve Account augmentation per Condition 3(j)(x)(4) — already PPM-grounded in engine at `projection.ts:2807-2817`)

- [ ] **Step 1.2: Locate Condition 3(c) — steps (Y) and (Z) verbatim language**

  Read the Interest Priority of Payments table for clauses (Y) and (Z). Capture verbatim:

  - Step (Y) text in full: "Trustee Fees & Expenses not paid under cap" — confirm wording and any allocation language
  - Step (Z) text in full: same for Administrative Expenses
  - Whether the POP introduction uses sequential language ("in the order of priority", "and then") or parallel ("pari passu", "pro rata across")
  - Whether (Y) is exhausted before (Z) receives anything, or whether they share residual interest

- [ ] **Step 1.3: Cross-check against `ppm.json`**

  Run: `jq '.section_6_waterfall.interest_priority_of_payments.clauses[] | select(.clause == "Y" or .clause == "Z")' ppm.json`

  Expected output (already verified):
  ```json
  {"clause": "Y", "application": "Trustee Fees & Expenses not paid under cap"}
  {"clause": "Z", "application": "Administrative Expenses not paid under cap"}
  ```

  Confirm the parsed summary matches the verbatim PPM language. If they diverge, ppm.json itself has a defect to flag separately.

- [ ] **Step 1.4: Decide verdict per assumption**

  Write the findings doc with the following table (one row per assumption). Each row is one of three states; the verdict drives whether code changes ship.

  | Assumption | PPM language (verbatim + page) | Verdict |
  |---|---|---|
  | (1) 20 bps default cap | "Senior Expenses Cap means …" (p. XX) | VERIFIED / AMEND / CONTRADICTED |
  | (2) max(2× observed, 20) heuristic | "Senior Expenses Cap means …" (p. XX) | (always CONTRADICTED unless the PPM names a 2×-observed buffer, which is non-standard) |
  | (3) Pro-rata Y/Z overflow allocation | "(Y) Trustee Fees and Expenses … (Z) Administrative Expenses …" (p. XX) | VERIFIED / AMEND / CONTRADICTED |
  | (4) Pro-rata B/C allocation **within** cap | "Senior Expenses Cap means …" + Condition 3(c) (B)/(C) text (p. XX) | VERIFIED / AMEND / CONTRADICTED |

  Decision rule per row:
  - **VERIFIED** → engine matches PPM exactly. No code change. Closure is documentation-only.
  - **VERIFIED-WITH-AMENDMENT** → engine intent matches PPM but the implementation has a minor divergence (e.g., right base, wrong rounding). Small fix.
  - **CONTRADICTED** → engine implements a different rule from the PPM. Real fix; re-baseline C3 tests; consider whether a KI-16 marker test should pin the pre-fix magnitude before the amendment lands (per the bijection rule).

- [ ] **Step 1.5: Surface any out-of-scope findings as new KIs**

  If the PPM read reveals a defect outside the KI-16 four-assumption scope, file a fresh KI entry rather than expanding KI-16. Likely candidates:

  - Cap base is **CPA** but engine uses APB (`beginningPar`): file as KI-XX or annotate KI-12a (parallel mechanism). Don't fold into KI-16.
  - Cap period is **per annum (single annual cap)** rather than **per Payment Date (quarterly cap × 4 = annual)**: would require multi-period state; new KI.
  - Cap covers more buckets than B + C (e.g., includes step (D) Expense Reserve top-up): new KI.

  Per the project rule, file the KI tentative if uncertain rather than asserting it as real or rejecting it. Marker test ships in the same change.

- [ ] **Step 1.6: Commit findings doc**

  ```bash
  git add docs/plans/2026-05-04-ki-16-c3-ppm-verification-findings.md
  git commit -m "KI-16: pin PPM verification findings for C3 cap + Y/Z overflow"
  ```

  This is the gate commit. If all four verdicts are VERIFIED, skip directly to Task 6 (close). Otherwise continue.

---

## Task 2 — Bug-pin marker tests for any contradictions

**Files:**
- Modify: `web/lib/clo/__tests__/c3-senior-expenses-cap.test.ts`

Per project bijection rule: every documented magnitude in the ledger must trace to a `failsWithMagnitude` marker. A KI-16 amendment that closes a contradicted assumption must pin the pre-fix wrong magnitude in a marker before the amendment lands; the marker flips to a positive assertion in the closure commit.

This task only runs if Task 1 found CONTRADICTED verdicts.

**Critical scenario constraint:** the existing C3 test scenarios (lines 44-122 of `c3-senior-expenses-cap.test.ts`) are all **residual-ample** — residual interest after tranche interest + sub mgmt fee comfortably covers any overflow request, so pro-rata and sequential allocation produce identical bucket totals. They cannot be reused to discriminate between the two rules. Each contradicted-assumption marker must construct its own scenario that genuinely separates the rules.

- [ ] **Step 2.1: (assumption 1 — cap value) marker**

  If Task 1 finds the PPM cap is e.g. 25 bps not 20 bps, write a marker that runs the engine on the Euro XV fixture with a default-only path (no overflow override) and asserts the current cap value emitted on a stress-input scenario where the cap actually bites. Concrete shape: trusteeFeeBps + adminFeeBps configured to straddle 20 bps and the PPM-true value (e.g., requested 22 bps combined). Under current 20 bps cap → 2 bps overflow; under PPM-true 25 bps cap → 0 overflow. Marker pins the 2 bps overflow magnitude pre-fix.

- [ ] **Step 2.2: (assumption 2 — heuristic) marker**

  The Euro XV fixture cannot fire the heuristic into a wrong number — `max(2 × 5.24, 20) = 20` lands on the static fallback regardless. The bug only fires when observed combined > 12.5 bps, which Euro XV doesn't reach. **Construct a synthetic raw-waterfall fixture** with elevated step (B) + (C) `amountPaid` values that drive `observedRateBps` above 12.5 bps (e.g., 15 bps observed combined → heuristic = max(30, 20) = 30, vs PPM-true value e.g. 25). The marker pins the heuristic-derived 30 bps cap pre-fix.

  Synthetic fixture shape: clone Euro XV, edit `raw.waterfallSteps[stepB].amountPaid` and `raw.waterfallSteps[stepC].amountPaid` so combined annualized = 15 bps × beginPar / 4. The exact numbers come from the fixture's beginPar and the desired `observedRateBps`. Add the synthetic fixture as a separate JSON or as an inline override in the test file — the existing `defaultsFromResolved` accepts the raw object directly.

  If constructing the synthetic fixture is itself substantial scope, the alternative is to **defer this marker** and document the unverified-on-Euro-XV gap in the closure findings doc. Per the project bijection rule, deferring means KI-16's heuristic sub-component does NOT close in this PR — the closure scope narrows to assumptions 1 and 3, with assumption 2 remaining open as a tentative entry pending the synthetic fixture. Decide which path in Step 1.4 of Task 1 (the verdict step) and document the choice.

- [ ] **Step 2.3: (assumption 3 — Y/Z allocation) marker**

  Under residual-ample paths pro-rata and sequential are indistinguishable. The marker requires a **constrained-residual scenario** where:

  - residual interest after tranche interest + sub mgmt fee is intentionally insufficient to pay both overflow buckets in full
  - pro-rata splits the available residual proportionally to each bucket's request
  - sequential pays (Y) trustee in full first, then (Z) admin from whatever remains

  Concrete shape: clone existing scenario 3 (lines 99-122) which uses trustee 150 / admin 150 / cap 1 → 299 bps overflow combined ≈ €3.7M requested overflow on Euro XV beginPar × 91/360. Lower the equity-residual surface by raising tranche interest (a high-spread synthetic input), or by reducing `beginningPar` directly. Aim for a scenario where residual ≈ trustee_overflow_requested (i.e., enough for trustee but only ~50% of admin under sequential).

  Marker assertion shape (pre-fix, pro-rata):
  ```ts
  failsWithMagnitude({
    ki: 'KI-16-overflow-allocation',
    description: 'pro-rata Y/Z allocation diverges from PPM sequential ordering on residual-constrained path',
    expectedDrift: <pre-fix pro-rata trustee_overflow_paid - <PPM-correct sequential trustee_overflow_paid>>,
    tolerance: <appropriate wiggle>,
    run: () => {
      // constrained-residual scenario; assert current pro-rata trustee_overflow_paid
    },
  });
  ```

  Post-fix (sequential): `trusteeOverflowPaid = trusteeOverflowRequested` (full); `adminOverflowPaid = max(0, residual - trusteeOverflowRequested)` (partial). Marker FAILS, then flips to positive assertion of the sequential split.

- [ ] **Step 2.4: (assumption 4 — B/C in-cap allocation) marker**

  Like assumption 3, the existing scenarios are residual-ample with respect to the **cap pool** as well — when `cappedRequested ≤ capAmount` (no cap binding) the in-cap allocation rule is invisible because each bucket gets paid in full regardless. To discriminate between the candidate rules (current pro-rata vs. PPM-true separate-caps vs. PPM-true sequential-within-cap), the cap must bind AND the rule must change which bucket is short-paid.

  Two scenario shapes depending on what the PPM specifies:

  - **If PPM specifies separate caps per bucket** (e.g., trustee cap = 5 bps, admin cap = 15 bps; total = 20 bps but each bucket bound separately): construct a scenario where one bucket's request exceeds its individual cap while the other is under its cap. Concrete example: trusteeFeeBps=10, adminFeeBps=5, joint cap 20 bps with separate caps trustee=5/admin=15 → under separate-caps trustee paid 5 (capped, overflow 5), admin paid 5 (uncapped). Under current pro-rata of joint-cap-20 the math is different. Marker pins the current pro-rata trusteeFeeAmount / adminFeeAmount magnitudes; flips post-fix.
  - **If PPM specifies sequential-within-cap (e.g., B paid first up to cap)**: straddle scenario where total request modestly exceeds cap. Concrete example: trusteeFeeBps=15, adminFeeBps=15, cap=20 bps → cappedRequested 30, cap 20. Under current pro-rata: trusteeFeeAmount = 10, adminFeeAmount = 10 (each gets 2/3). Under sequential B-first: trusteeFeeAmount = 15 (full), adminFeeAmount = 5 (cap remainder). Marker pins the 10/10 split; flips to 15/5 post-fix.

  The exact shape and magnitudes are decided by Task 1.4's verdict for assumption 4. If verdict is VERIFIED (current pro-rata matches PPM), no marker needed for this assumption.

- [ ] **Step 2.5: Run marker(s) — verify they document current behavior**

  Run: `cd web && npm test -- c3-senior-expenses-cap.test.ts`
  Expected: marker(s) PASS in their bug-pin form.

- [ ] **Step 2.6: Commit markers**

  ```bash
  git add web/lib/clo/__tests__/c3-senior-expenses-cap.test.ts
  git commit -m "KI-16: pin C3 cap/overflow magnitudes as failsWithMagnitude markers"
  ```

---

## Task 3 — Code amendments

**Files (per finding — only modify rows that contradicted):**
- `web/lib/clo/build-projection-inputs.ts:165` — `DEFAULT_ASSUMPTIONS.seniorExpensesCapBps`
- `web/lib/clo/build-projection-inputs.ts:303` — `Math.max(observedRateBps * 2, 20)` heuristic
- `web/lib/clo/projection.ts:2841-2843` — B/C in-cap allocation (`cappedRatio` block)
- `web/lib/clo/projection.ts:3776-3784` — Y/Z overflow allocation block
- `web/lib/clo/resolver.ts` + `web/lib/clo/resolver-types.ts` — if cap value is PPM-extracted, lift to `ResolvedFees.seniorExpensesCapBps`

The amendment shape depends on the finding. Four concrete shapes to anticipate:

- [ ] **Step 3.1 (if assumption 1 is CONTRADICTED): replace static fallback**

  Replace `seniorExpensesCapBps: 20` at `build-projection-inputs.ts:165` with the PPM-extracted absolute value (e.g., `seniorExpensesCapBps: 25` if PPM specifies 0.25%). If the PPM specifies a non-bps mechanism (e.g., absolute € floor + bps cap), the type widens — `seniorExpensesCapBps: number` becomes `seniorExpensesCap: { bpsPerYear: number; absoluteFloorEur?: number }`. Type widening propagates through `ProjectionInputs`, `defaultsFromResolved`, and the projection consumer at `projection.ts:2814`.

- [ ] **Step 3.2 (if assumption 2 is CONTRADICTED — almost certain): replace heuristic with extracted value**

  At `build-projection-inputs.ts:298-304`, the `max(2× observed, 20)` heuristic should become `if (resolvedCapBps != null) base.seniorExpensesCapBps = resolvedCapBps;` — the cap value rides off PPM extraction, not observed × multiple. The "Q1 observed × 2" buffer was engineering judgment with no PPM grounding; per project rule (silent fallbacks on extraction failures are bugs), if extraction genuinely fails the resolver should emit a `severity: "error"` blocking warning, not silently accept a heuristic.

  **Resolver-pipeline mechanism (pinned, not under-specified):** verified 2026-05-04 — `seniorExpensesCap` does NOT appear in `resolver.ts`, `resolver-types.ts`, or `ppm.json` today. There is no upstream representation of the cap value. Three options; **option (a) is the path:**

  - **(a) [chosen] Extend `ppm.json` with a structured `senior_expenses_cap` block.** Manually transcribe Condition 1's definition from the OC at PDF pp. 390-397 into a new `section_1_definitions.senior_expenses_cap` field with `{ value_bps_per_annum: <number>, base: "CPA" | "APB" | …, period: "per_payment_date" | "per_annum" | …, allocation_within_cap: "pro_rata" | "sequential_b_first" | …, overflow_steps: ["Y", "Z"], allocation_y_z: "pro_rata" | "sequential_y_first" | …, source_pages: [390, …] }`. Then extend `resolver.ts` to read `ppm.section_1_definitions.senior_expenses_cap.value_bps_per_annum` into `ResolvedFees.seniorExpensesCapBps` (and the structured fields if the cap is more complex than a simple bps).
  - (b) Add a structured-PPM ingest pass (out of scope; broader infrastructure)
  - (c) Hardcode per-deal in resolver (rejected — overfits to Euro XV per project rule)

  Resolver-side test (`web/lib/clo/__tests__/resolver-fees.test.ts` or equivalent) pins the extracted cap value against the Euro XV PPM page number.

- [ ] **Step 3.3 (if assumption 3 is CONTRADICTED — likely sequential): rewrite overflow allocation**

  Current block (`projection.ts:3776-3784`):
  ```ts
  let trusteeOverflowPaid = 0;
  let adminOverflowPaid = 0;
  if (cappedOverflowTotal > 0 && availableInterest > 0) {
    const overflowPayable = Math.min(cappedOverflowTotal, availableInterest);
    const overflowRatio = cappedOverflowTotal > 0 ? overflowPayable / cappedOverflowTotal : 0;
    trusteeOverflowPaid = trusteeOverflowRequested * overflowRatio;
    adminOverflowPaid = adminOverflowRequested * overflowRatio;
    availableInterest -= overflowPayable;
  }
  ```

  Sequential replacement (Y first, then Z):
  ```ts
  // PPM Condition 3(c) (Y): trustee fee overflow paid in full from residual
  // interest before (Z) admin overflow receives anything.
  const trusteeOverflowPaid = Math.min(trusteeOverflowRequested, availableInterest);
  availableInterest -= trusteeOverflowPaid;
  const adminOverflowPaid = Math.min(adminOverflowRequested, availableInterest);
  availableInterest -= adminOverflowPaid;
  ```

  Note: if PPM specifies a different sequence (e.g., admin first, or "pari passu" but with a different proration formula like balance-weighted), match exactly. Don't paraphrase.

- [ ] **Step 3.4 (if assumption 4 is CONTRADICTED): rewrite B/C in-cap allocation**

  Current block (`projection.ts:2841-2843`):
  ```ts
  const cappedRatio = cappedRequested > 0 ? cappedPaid / cappedRequested : 0;
  const trusteeFeeAmount = trusteeFeeRequested * cappedRatio;
  const adminFeeAmount = adminFeeRequested * cappedRatio;
  ```

  Two amendment shapes depending on PPM finding:

  - **If PPM specifies separate caps per bucket:** `seniorExpensesCapBps` widens to `{ trusteeBps: number; adminBps: number }` (or two siblings: `trusteeCapBps`, `adminCapBps`). Block becomes:
    ```ts
    const trusteeCapAmount = beginningPar * (trusteeCapBps / 10000) * dayFracActual + expenseReserveBalance / 2;
    const adminCapAmount = beginningPar * (adminCapBps / 10000) * dayFracActual + expenseReserveBalance / 2;
    const trusteeFeeAmount = Math.min(trusteeFeeRequested, trusteeCapAmount);
    const adminFeeAmount = Math.min(adminFeeRequested, adminCapAmount);
    const cappedPaid = trusteeFeeAmount + adminFeeAmount;
    const trusteeOverflowRequested = trusteeFeeRequested - trusteeFeeAmount;
    const adminOverflowRequested = adminFeeRequested - adminFeeAmount;
    ```
    Reserve-balance split between buckets is itself a PPM question — verify in Task 1.1 capture.

  - **If PPM specifies sequential within cap (B paid first, C from cap remainder):**
    ```ts
    // PPM Condition 3(c) (B): trustee fees paid in full up to cap; (C) admin
    // expenses paid from any cap headroom remaining.
    const trusteeFeeAmount = Math.min(trusteeFeeRequested, capAmount);
    const adminFeeAmount = Math.min(adminFeeRequested, capAmount - trusteeFeeAmount);
    const cappedPaid = trusteeFeeAmount + adminFeeAmount;
    const trusteeOverflowRequested = trusteeFeeRequested - trusteeFeeAmount;
    const adminOverflowRequested = adminFeeRequested - adminFeeAmount;
    ```

  Caution: this block is upstream of the `cappedOverflowTotal` computation at `:2819` — bucket-overflow is the diff between bucket-requested and bucket-capped under the new rule, not the pro-rata diff. Read the current downstream consumers (lines 2844-2846) and verify the surrounding `cappedRequested - cappedPaid` math still works — it does, because `cappedPaid = trusteeFeeAmount + adminFeeAmount` under both new rules, so the existing overflow path stays consistent.

- [ ] **Step 3.5: Run marker(s) — verify they FAIL after amendment**

  Run: `cd web && npm test -- c3-senior-expenses-cap.test.ts`
  Expected: bug-pin marker(s) from Task 2 now FAIL (the magnitude they documented no longer reproduces).

- [ ] **Step 3.6: Flip markers to positive assertions**

  Convert each `failsWithMagnitude` block to a regular `expect()` asserting the post-fix correct magnitude. Per the bijection rule — when the upstream KI closes, the marker either flips to a positive assertion or is deleted.

  Re-run the test file. Expected: PASS in positive-assertion form.

- [ ] **Step 3.7: Commit amendments**

  ```bash
  git add <modified files>
  git commit -m "KI-16: amend C3 to match PPM Condition <X> Senior Expenses Cap"
  ```

---

## Task 4 — Verify downstream test invariance + targeted re-baselines

**Files:**
- Verify: `web/lib/clo/__tests__/c3-senior-expenses-cap.test.ts` — existing assertions
- Verify: `web/lib/clo/__tests__/b2-post-acceleration.test.ts` — should remain bit-identical (cap removed under acceleration)
- Verify: `web/lib/clo/__tests__/d3-defaults-from-resolved.test.ts` — re-baseline only if heuristic was replaced AND a D3 test asserts on `seniorExpensesCapBps` heuristic output

**Invariance claim (verified 2026-05-04):** the existing C3 overflow scenarios (lines 44-122 of `c3-senior-expenses-cap.test.ts`) are **all residual-ample** — under both pro-rata and sequential allocation rules they pay the same totals. Specifically:

- Scenario 1 (lines 44-77, 50 bps overflow): asserts `(adminOverflowPaid / trusteeOverflowPaid) ≈ 4` (request-ratio 24:6). Under sequential each is paid in full → 24:6 = 4:1 identical.
- Scenario 2 (lines 79-97, 1 bps cap): asserts overflow TOTAL only. Identical under both rules when residual ample.
- Scenario 3 (lines 99-122, 300 bps fees): asserts only `≥ 0` and `≤ requested`. Either rule passes.

Therefore Task 4 is mostly a verification pass, not a re-baseline. Only the markers added in Task 2 (constrained-residual scenarios) are sensitive to the rule change.

- [ ] **Step 4.1: Verify existing C3 overflow scenarios still pass**

  After Task 3 amendment (overflow allocation rewrite), run:
  ```bash
  cd web && npm test -- c3-senior-expenses-cap
  ```
  Expected: existing scenarios 1, 2, 3 all PASS unchanged. Only the Task-2 markers (which Task 3.5 flipped to positive assertions) reflect the new rule.

  If any existing assertion fails: that's a real bug — the amendment leaked into a residual-ample path or unintentionally changed the request → paid relationship. Investigate before continuing.

- [ ] **Step 4.2: Run B2 + D3 suites**

  ```bash
  cd web && npm test -- b2-post-acceleration d3-defaults-from-resolved
  ```

  Expected: all PASS. B2 untouched (cap removed under acceleration per Condition 10(b) proviso, already PPM-grounded at `projection.ts:2829-2837`). D3 re-baseline only if Step 3.2 changed the heuristic output and a D3 test asserts on `seniorExpensesCapBps` from `defaultsFromResolved` — verify by grepping `d3-defaults-from-resolved.test.ts` for `seniorExpensesCapBps`.

---

## Task 5 — N1 harness verification (Euro XV bit-identity)

**Files:**
- Verify: `web/lib/clo/__tests__/n1-correctness.test.ts`

Euro XV's observed combined senior expenses (~5.24 bps) sit well below any plausible cap value (12.5–50 bps). The cap doesn't bite on Euro XV under any of the four amendment paths above. So the N1 harness MUST stay bit-identical pre/post.

- [ ] **Step 5.1: Run N1 harness pre-amendment (baseline snapshot)**

  Run on the pre-Task-3 commit (or temporarily revert): `cd web && npm test -- n1-correctness.test.ts`. Capture the diagnostic table.

- [ ] **Step 5.2: Run N1 harness post-amendment**

  Run on the post-Task-3 commit. Capture the diagnostic table. Expected: every bucket value is bit-identical.

- [ ] **Step 5.3: If any bucket drifts, investigate**

  Drift on Euro XV means one of:
  - The amendment unintentionally fires the cap on Euro XV's observed expenses (impossible if the cap value is in the 12.5–50 bps range; investigate the amendment if observed)
  - The amendment changed an unrelated surface (e.g., type widening leaked into the IC numerator path)

  Either is a real bug — fix before continuing.

---

## Task 6 — Close KI-16 ledger entry

**Files:**
- Modify: `web/docs/clo-model-known-issues.md` — delete KI-16 entry, anchor, index pointer; update KI-08 cross-references

Per project closure protocol: delete entry + anchor + index pointer entirely. No `[CLOSED]` marker (per `feedback_ki_closure_remove_not_mark.md`). KI-08 stays open as PARTIAL because day-count residuals are blocked on KI-12a — its entry text needs the KI-16 cross-reference removed and a brief verification result inlined where useful.

- [ ] **Step 6.1: Delete KI-16 entry block**

  Remove lines containing the KI-16 entry body, the `<a id="ki-16">` anchor, and the index pointer in the "Open" section.

- [ ] **Step 6.2: Update KI-08 entry text + fix stale claims (in passing)**

  KI-08's entry has accumulated stale references that need a passing fix:

  - Stale line citations at :388/:390 (current — :390 in the ledger): `projection.ts:2344-2358` → now `:3776-3784`; `build-projection-inputs.ts:147` → now `:165`; `:278` → now `:303`. Update all three to current line numbers.
  - **Inverted + scaled-wrong magnitude claim** at :388: "the current pro-rata split routes ~€36K to trustee overflow and ~€1K to admin overflow." Wrong on both axes. With trusteeFeeBps=10, adminFeeBps=40, cap=20, beginPar≈€493M, dayFrac=91/360 the actual numbers are: total overflow = 30 bps × €493M × 91/360 ≈ **€374K**; pro-rata split is **trustee ≈ €75K (6 bps share), admin ≈ €299K (24 bps share)** — i.e., admin is ~4× trustee, not the inverse, and the total is ~10× the stated "~€37K". Replace the sentence with the correct magnitudes.

  In KI-08's "What is NOT verified yet (blocks 'FULLY CLOSED' status — tracked in KI-16)" section, either:
  - If all four assumptions VERIFIED: replace the section with "Verified against Ares XV Offering Circular Condition 1 (PDF pp. 390-397) and Condition 3(c) (p. XX) on YYYY-MM-DD: cap value, base, B/C in-cap allocation, and Y/Z overflow allocation all match engine implementation."
  - If amendments shipped: "Verified-and-amended against PPM. Cap default now <new value> (was 20 bps heuristic); B/C in-cap allocation now <new rule> (was pro-rata); Y/Z overflow allocation now <new rule> (was pro-rata). See findings doc at `docs/plans/2026-05-04-ki-16-c3-ppm-verification-findings.md`." Omit clauses for assumptions that VERIFIED unchanged.

  KI-08 status remains PARTIAL — its day-count residual markers `KI-08-dayCountResidual-trustee` / `-admin` are blocked on KI-12a's data acquisition (per the existing blocker note). Do NOT promote KI-08 to closed.

- [ ] **Step 6.3: Update KI-08 status header**

  KI-08's title still reads "PARTIAL: pre-fill D3 + cap mechanics C3 shipped; KI-16 PPM verifications remain". Change to "PARTIAL: pre-fill D3 + cap mechanics C3 shipped + KI-16 PPM verifications cleared; day-count residuals remain (blocked on KI-12a)".

- [ ] **Step 6.4: Strip any source-file `// KI-16` annotations**

  ```bash
  grep -rn "KI-16" web/lib/clo/ web/app/clo/
  ```

  For each match: if the annotation references the KI-16 entry that no longer exists, strip the comment per project closure protocol. Disclosure-bijection scanner (`web/lib/clo/__tests__/disclosure-bijection.test.ts`) will fail loud on any stale reference.

- [ ] **Step 6.5: Run disclosure-bijection scanner**

  Run: `cd web && npm test -- disclosure-bijection`
  Expected: PASS (no orphan KI-16 references).

- [ ] **Step 6.6: Commit closure**

  ```bash
  git add web/docs/clo-model-known-issues.md <any source files with stripped annotations>
  git commit -m "KI-16 closure — remove ledger entry + strip references from source"
  ```

---

## Task 7 — Full suite + final regression

**Files:** none (verification only).

- [ ] **Step 7.1: Run full vitest suite**

  Run: `cd web && npm test`
  Expected: all tests pass. Test count should be ≥ 1259 (the post-KI-15 baseline), plus any markers added in Task 2 minus any markers flipped to positive in Task 3.5.

- [ ] **Step 7.2: Run typecheck**

  Run: `cd web && npm run typecheck`
  Expected: zero errors. Type widening (if Step 3.1 widened `seniorExpensesCapBps` to a structured type) must propagate cleanly.

- [ ] **Step 7.3: Run lint on changed files**

  Run: `cd web && npx eslint <list of files modified>`
  (Project-wide eslint is OOM-prone; lint only the diff.)

---

## Task 8 — Merge

- [ ] **Step 8.1: Re-fetch + rebase**

  ```bash
  git fetch origin
  git rebase origin/main
  ```

  If concurrent agents touched any of the in-scope files, resolve conflicts manually. Re-run Task 7 after rebase.

- [ ] **Step 8.2: Fast-forward merge**

  ```bash
  git checkout main
  git merge --ff-only ki-16-c3-ppm-verification
  ```

  Per the user's standing instruction in CLAUDE.md, merge after committing.

---

## Self-Review checklist

After writing this plan, the following spec-coverage check applies:

- **Spec coverage:** the four KI-16 assumptions each have a verification step (1.1 + 1.2), a marker step (2.1 / 2.2 / 2.3 / 2.4), and an amendment step (3.1 / 3.2 / 3.3 / 3.4). The findings doc (1.4) routes per-assumption verdict to per-assumption fix. Task 6 closes the entry; Task 4 verifies downstream invariance.
- **Placeholder scan:** the only intentional unknowns are PPM page numbers (XX) — those resolve in Task 1 and are not implementation placeholders.
- **Type consistency:** if Step 3.1 widens `seniorExpensesCapBps` to a structured type, OR Step 3.4 splits it into per-bucket caps (`trusteeCapBps`, `adminCapBps`), the propagation must hit `ProjectionInputs` (line 124), `DEFAULT_ASSUMPTIONS` (line 165 of build-projection-inputs.ts), `defaultsFromResolved` (`base.seniorExpensesCapBps = …`), the consumer at `projection.ts:2814` AND the in-cap allocation block at `:2841-2843`, and the post-accel branch's omission (cap not consulted under acceleration per the existing proviso). Plan flags this; the implementer must follow the type through.

---

## Risks / open questions surfaced ahead of read

1. **Cap base = CPA, not APB.** If Condition 1 defines the cap base as Collateral Principal Amount, the engine's `beginningPar * (capBps/10000)` is computing against the wrong denominator — parallel mechanism to KI-12a (where the fee-base mismatch was identified for senior+sub mgmt fees). This would surface as a NEW KI, not a KI-16 amendment. Filing it tentative pending PPM read.

2. **Cap period = annual single cap, not per-payment-date cap.** If the PPM specifies "0.X% per annum" as a hard annual ceiling (rather than a quarterly accrual that resets each Payment Date), the engine's per-period dayFrac multiplication is correct AS LONG AS no period accrues more than the residual annual headroom. Multi-period state would be needed (rolling annual sum). New KI candidate.

3. **Trustee Fees rate "Per Trust Deed".** ppm.json shows the trustee fee rate is deferred to the Trust Deed (separate document, not in OC). The cap itself is in OC Condition 1 — that distinction matters. The cap can have a numeric value even if the trustee rate doesn't. If KI-16 read finds the cap is also "Per Trust Deed", the verification is partial — flag and continue.

4. **PPM may include a fixed € floor.** Some CLO PPMs structure the cap as `max(bps × CPA, fixed € amount)` to ensure trustees aren't unpaid on small/runoff deals. If present, the type widens (Step 3.1 anticipates this).

5. **Concurrent-agent risk.** Other agents touching `build-projection-inputs.ts` or `projection.ts` between branch creation and merge. Rebase before each commit; full Task 7 re-run after rebase.

6. **The 2× observed heuristic might also be silently correct on Euro XV.** Euro XV observed combined ≈ 5.24 bps; `max(2 × 5.24, 20) = 20`. The static and the observed-derived path both produce 20 bps on Euro XV — the heuristic is masked. If PPM cap is 25 bps, the heuristic produces a wrong number ONLY when observed > 12.5 bps (i.e., on a deal with substantially higher trustee/admin expenses than Euro XV). Latent on Euro XV; partner-visible on the next deal — the same shape that drives most of the ledger.

---
