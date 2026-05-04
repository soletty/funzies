# KI-15 — B2 Accelerated-Mode Incentive Fee — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate PPM step (V) post-acceleration incentive collateral management fee — replace the hardcoded `incentiveFeeActive: false` and the flat-pct executor body with the IRR-gated `resolveIncentiveFee` solver applied to the combined pre-breach + accel-mode equity cash-flow series.

**Architecture:** Push `priorEquityCashFlows: number[]` + `incentiveFeeHurdleIrr: number` into `PostAccelExecutorInput`; have `runPostAccelerationWaterfall` call the same private `resolveIncentiveFee` helper used by normal-mode step (CC). The boolean `incentiveFeeActive` gate disappears — the IRR check inside `resolveIncentiveFee` subsumes it. Caller in the period loop (line 2959) passes the live `equityCashFlows` accumulator (already in scope, already populated with pre-breach distributions through the prior `equityCashFlows.push(equityDistribution)` sites at lines 3815 and 3010).

**Tech Stack:** TypeScript (engine layer), vitest, existing `failsWithMagnitude` marker pattern, existing `resolveIncentiveFee` solver, existing synthetic-stress fixture builder in `b2-post-acceleration.test.ts`.

---

## Verified current state (file:line, all read 2026-05-03)

- `PostAccelExecutorInput` declares `incentiveFeeActive: boolean; incentiveFeePct: number;` — `web/lib/clo/projection.ts:961-962`
- Executor body uses **flat-pct, not IRR-gated**: `incentiveFeePaid = input.incentiveFeeActive ? pay(Math.max(0, remaining) * (input.incentiveFeePct / 100)) : 0` — `projection.ts:1080-1082`. Inline comment confirms simplification: *"Flat percentage of remaining cash before residual (simplified — proper model would use IRR threshold waterfall)."*
- Caller (period loop, accel branch) passes `incentiveFeeActive: false` hardcoded — `projection.ts:2992`
- Pre-fix comment at `projection.ts:2987-2991` already names the fix: *"carry equityCashFlows into accel branch and run resolveIncentiveFee here."*
- `equityCashFlows: number[]` initialized at `projection.ts:1973`, seeded with `-equityInvestment` at `:2015`, mutated through the period loop (normal-mode `push` at `:3815`, accel-mode `push` at `:3010`). At line 2959 (the executor call), the array contains all pre-breach distributions but NOT yet the current accel period's residual — exactly the right "prior" series for the IRR test.
- `incentiveFeeHurdleIrr` is in scope at the call site via the destructure at `projection.ts:1287`.
- `resolveIncentiveFee` is a private function at `projection.ts:3997` (not exported). Same module as the executor, so callable directly. Three regimes: pre-fee IRR ≤ hurdle → 0; full-fee IRR ≥ hurdle → full fee; bisect otherwise.
- Normal-mode step (CC) call template at `projection.ts:3763-3768`: `resolveIncentiveFee(equityCashFlows, availableInterest, incentiveFeePct, incentiveFeeHurdleIrr, 4)`. Step (U) follow-up at `:3799-3807`.
- Existing executor unit tests (4 callers of `runPostAccelerationWaterfall` directly) all pass `incentiveFeeActive: false` — `web/lib/clo/__tests__/b2-post-acceleration.test.ts:85, 115, 141, 168`.
- No active KI-15 marker test today (per `grep "KI-15\|ki-15" __tests__/`).

## Tradeoffs considered

- **Alternative A (rejected):** keep `incentiveFeeActive: boolean`; have the caller compute the boolean by calling `resolveIncentiveFee` itself and gate the executor on the result. Worse — splits the IRR-gating logic across two sites, and the executor still uses the flat-pct simplification (does not produce the bisected fee amount under regime 3).
- **Alternative B (chosen):** push `priorEquityCashFlows + hurdleIrr` into the executor, call `resolveIncentiveFee` inside the executor body, return the bisected amount. Matches normal-mode pattern; encapsulates the calculation in the helper layer (per CLAUDE.md engine-as-source-of-truth: pure deterministic helpers own their math).

## PPM verification gate (Task 1)

The ledger describes the target behavior in PPM language but does not pin the verification against the Euro XV PPM PDF directly. Per the rule that drove KI-16 (PPM-cross-reference required before claiming KI-08 fully closed), the same gate applies here. Four points must be verified against the PPM before code changes ship:

1. **Hurdle definition.** Is the post-accel hurdle the same as normal-mode step (CC) — "annualized IRR on Sub Note cash-flow series since closing" — and does the series include both pre-breach and accel-mode distributions? (Plausible alternative the PPM might specify: a separate accel-mode hurdle, or a hurdle defined only on pre-breach distributions.)
2. **Fee percentage.** Is the accel-mode fee percentage identical to the normal-mode `incentiveFeePct`? Both come from the same indenture term in most CLO PPMs; some structures specify a different post-accel rate.
3. **Step ordering.** Is step (V) positioned between sub mgmt fee (Q) and residual to sub holders, matching the executor's current ordering? The executor pays `subMgmtFee → incentiveFee → residualToSub` (lines 1075-1085); if PPM step (V) sits before sub mgmt fee or after residual, the executor's ordering is also wrong and Task 4 expands.
4. **Multi-period accel: pre-fee or post-fee priors?** Under sustained acceleration, period N+1 sees a `priorEquityCashFlows` accumulator that already includes period N's POST-fee residual (because the engine pushes `equityDistributionAccel = accelResult.residualToSub` at projection.ts:3010, after the fee is taken). This is the same convention as normal-mode step (CC) at line 3815. But it has a subtle property: in regime 3 of `resolveIncentiveFee`, the bisection lands period N's fee exactly at the hurdle, leaving zero IRR margin entering period N+1 — so period N+1's pre-fee test starts from a borderline-cleared IRR. PPM-correct if the indenture defines the test on prior actual (post-fee) distributions. Some indentures define it on pre-fee distributions instead, which would require carrying a parallel pre-fee accumulator. Verify which convention applies before relying on the existing post-fee push.

If any of (1)–(4) diverge from this plan's assumptions, **stop and amend the plan** before writing code. The rest of the tasks below assume the four points verify cleanly.

> **Note on stale line numbers in the ledger entry:** the KI-15 entry at `web/docs/clo-model-known-issues.md:383` cites `projection.ts:1797` (caller — actual: 2992), `:624` (declaration — actual: 961), `:737` (consumption — actual: 1080), and a phantom `pay(input.incentiveFee)` (actual gate uses both `incentiveFeeActive` AND `incentiveFeePct`). Moot at closure (Task 8 deletes the entry), but the line-number drift makes the cross-reference harder during Task 1. Use this plan's verified line numbers as the source of truth.

---

### Task 1: PPM verification of step (V) — IRR threshold, fee percentage, ordering

**Files:**
- Read: `~/Downloads/AresEuroCLO_XV_PPM_condensed.pdf` (Condition 10(b) Post-Acceleration Priority of Payments)
- Read (cross-reference): `web/lib/clo/projection.ts:1075-1095` (executor sub-fees ordering), `:3759-3808` (normal-mode steps CC + U for hurdle/percentage definition)

- [ ] **Step 1: Locate Condition 10(b) Post-Acceleration POP step (V)**

Open the PPM PDF, search for "Post-Acceleration Priority of Payments" / "Condition 10(b)" / "Incentive Collateral Management Fee" under the post-acceleration section. Note the line numbers (the existing engine code cites "PPM ll. 14167-14177" for the step (B)+(C) cap proviso — adjacent to step (V)).

- [ ] **Step 2: Verify the three assumptions**

Document each as a one-line finding in this plan file (replace the bullet text below):

- **Hurdle:** [PPM ll. ____, quote: "____"] — confirms / amends to: __________
- **Fee percentage:** [PPM ll. ____, quote: "____"] — confirms / amends to: __________
- **Ordering relative to Q and residual:** [PPM ll. ____, quote: "____"] — confirms / amends to: __________

- [ ] **Step 3: Decision gate**

If all three confirm: proceed to Task 2 unchanged.
If any amend: stop, post the diverging finding to the conversation, wait for user direction. Do not write code against an unverified PPM assumption (CLAUDE.md correctness-first rule).

- [ ] **Step 4: Commit the verification finding**

```bash
git add docs/plans/2026-05-03-ki-15-accel-incentive-fee-plan.md
git commit -m "KI-15: pin PPM step (V) verification findings before code change"
```

---

### Task 2: Add KI-15 marker test pinning the current bug magnitude

**Files:**
- Modify: `web/lib/clo/__tests__/b2-post-acceleration.test.ts` (add new `describe` block at end of file)
- Reference: `web/lib/clo/__tests__/fails-with-magnitude.ts` (helper)
- Reference: `web/docs/clo-model-known-issues.md` § KI-15 (ledger entry)

The marker is a unit-level test against `runPostAccelerationWaterfall` directly. An integration test through `runProjection` is harder to construct cleanly (requires a synthetic deal with significant pre-breach equity distributions then a sudden EoD trip; defaults are coupled to many other invariants). The unit test is sufficient: it pins the executor's incentive-fee math directly, which is the locus of the bug.

- [ ] **Step 1: Probe `resolveIncentiveFee` against candidate scenarios — pin the exact magnitude before writing the marker**

The marker has to (a) excite the bug — i.e., the prior cashflow series must actually clear the hurdle, so post-fix the executor returns a positive fee distinguishable from the pre-fix zero — and (b) pin the exact post-fix fee so `expectedDrift` matches `failsWithMagnitude`'s tolerance window.

A scenario that LOOKS like it clears the hurdle by hand can fail to clear under the actual IRR math. Concrete example: `[-20M, 2M×8, +4M]` sums to 0, so periodic IRR = 0% (NPV = 0 only at r = 0; single sign change → unique root), annualized = 0%, far below a 12% hurdle — `resolveIncentiveFee` regime 1 returns 0, and the marker would silently pin a non-bug. Probe before writing.

Temporarily add `export` to the `function resolveIncentiveFee` declaration at `projection.ts:3997` (one line: `export function resolveIncentiveFee(...)` instead of `function resolveIncentiveFee(...)`). This is cleaner than copying the function body into a scratch script — eliminates copy drift between probe and engine. Revert before committing the marker.

`/tmp/probe-ki15.ts`:
```typescript
import { resolveIncentiveFee } from "@/lib/clo/projection";

// Investment: 20M Sub Note. Class A P+I retires (100M + 1M = 101M); residual
// after Class A = 105M − 101M = 4M. We want a prior series whose IRR (with
// 4M residual appended) clears the 12% hurdle.
const residual = 105_000_000 - 100_000_000 - 1_000_000;  // = 4_000_000

for (const distrib of [2_000_000, 2_500_000, 3_000_000, 3_500_000]) {
  const prior = [-20_000_000, ...Array(8).fill(distrib)];
  const fee = resolveIncentiveFee(prior, residual, 20, 0.12, 4);
  console.log(`distrib ${distrib}: fee = ${fee.toFixed(2)}`);
}
```

Run:

```bash
cd /Users/solal/Documents/GitHub/funzies/web
npx tsx --tsconfig ./tsconfig.json /tmp/probe-ki15.ts
```

Independent verification (reviewer's probe): with `distrib = 3_000_000`, expected output is `fee ≈ 800000` (regime 2: full fee = 0.20 × 4M = 800K, because the post-full-fee IRR still clears 12%). With `distrib = 2_000_000`, expected output is `fee = 0` (regime 1: pre-fee IRR = 0% < 12%).

Pick the smallest `distrib` value where `fee > 0` AND the fee equals exactly `residual × incentiveFeePct/100` (regime 2 — clean to assert against). Likely `3_000_000`, but the probe confirms.

- [ ] **Step 2: Revert the temporary export**

In `projection.ts:3997`, restore `function resolveIncentiveFee(...)` (drop the `export`). Verify with `git diff projection.ts` — should show no changes.

- [ ] **Step 3: Write the marker test pinning the bug**

Use the probe's confirmed `distrib` value. The example below assumes `distrib = 3_000_000` and `fee = 800_000` from the probe; if the probe returns different numbers, update the constants accordingly.

Append to `b2-post-acceleration.test.ts`:

```typescript
import { failsWithMagnitude } from "./fails-with-magnitude";

describe("KI-15 — accel-mode incentive fee currently hardcoded inactive", () => {
  /**
   * Synthetic scenario: a deal whose Sub Notes have already received large
   * pre-breach distributions clearing the IRR hurdle. Then EoD trips and the
   * accel waterfall runs with cash remaining after rated tranche P+I. Under
   * PPM step (V), the incentive fee should fire at `incentiveFeePct` of the
   * residual (or a bisected lower amount if the full fee would push IRR back
   * below hurdle). Current engine emits 0 because `incentiveFeeActive` is
   * hardcoded false and the executor body uses a flat-pct gate that ignores
   * IRR entirely.
   *
   * Cashflow design (verified via /tmp/probe-ki15.ts on 2026-05-03):
   *   prior = [-20M, +3M × 8]; residual = 4M; pct = 20; hurdle = 0.12
   *   → resolveIncentiveFee returns 800_000 (regime 2 — full flat fee fires
   *     because pre-fee IRR ≈ 31.6% well above hurdle, and post-full-fee IRR
   *     still clears).
   * The 2M × 8 alternative was REJECTED: it sums to 0 against the residual,
   * giving periodic IRR = 0%, regime 1 returns 0, marker would pin a non-bug.
   */
  const baseTranches = [
    { className: "Class A", currentBalance: 100_000_000, spreadBps: 100, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: false, isAmortising: false, amortisationPerPeriod: null, amortStartDate: null },
    { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 8, isFloating: false, isIncomeNote: true, isDeferrable: false, isAmortising: false, amortisationPerPeriod: null, amortStartDate: null },
  ];
  const trancheBalances = { "Class A": 100_000_000, "Sub": 20_000_000 };
  const deferredBalances = { "Class A": 0, "Sub": 0 };
  const interestDue = { "Class A": 1_000_000, "Sub": 0 };
  const seniorExpenses = { taxes: 0, issuerProfit: 0, trusteeFees: 0, adminExpenses: 0, seniorMgmtFee: 0, hedgePayments: 0 };

  // Pre-breach distribution series that clears a 12% annualized hurdle.
  // Equity invested: 20M; 8 quarters of 3M; residual 4M (appended internally
  // by resolveIncentiveFee). Periodic IRR ≈ 7.1%, annualized ≈ 31.6%.
  const priorEquityCashFlows = [-20_000_000, ...Array(8).fill(3_000_000)];

  failsWithMagnitude(
    {
      ki: "KI-15",
      closesIn: "Sprint TBD",
      // Documented current behavior: 0. Expected post-fix: 800K (20% of 4M
      // post-Class-A residual; regime 2 of resolveIncentiveFee). Drift =
      // observed − expected_post_fix = 0 − 800K = -800K (engine UNDER-reports).
      expectedDrift: -800_000,
      tolerance: 50_000,
      closeThreshold: 100_000,
    },
    "executor emits incentive fee under accel when prior IRR clears hurdle",
    () => {
      // 105M cash: covers Class A P+I (101M) + 4M residual.
      const result = runPostAccelerationWaterfall({
        totalCash: 105_000_000,
        tranches: baseTranches,
        trancheBalances: { ...trancheBalances },
        deferredBalances,
        seniorExpenses,
        interestDueByTranche: interestDue,
        subMgmtFee: 0,
        // Current bug: hardcoded inactive — fee = 0 even when IRR clears.
        incentiveFeeActive: false,
        incentiveFeePct: 20,
      });
      const observedFee = result.incentiveFeePaid;
      const expectedFee = 800_000;
      return observedFee - expectedFee;
    },
  );
});
```

- [ ] **Step 4: Run the marker test, verify it passes (documents the bug)**

```bash
cd web && npx vitest run lib/clo/__tests__/b2-post-acceleration.test.ts -t "KI-15"
```

Expected: PASS. The marker name in the output reads `[KI-15, closes Sprint TBD] executor emits incentive fee under accel when prior IRR clears hurdle — expected drift -800K ± 50K`. The PASS confirms the bug is at the documented magnitude.

- [ ] **Step 5: Commit**

```bash
git add web/lib/clo/__tests__/b2-post-acceleration.test.ts
git commit -m "KI-15: marker test documenting accel-mode incentive fee = 0 under IRR-clear scenario"
```

---

### Task 3: Extend `PostAccelExecutorInput` — replace boolean gate with cashflow series + hurdle

**Files:**
- Modify: `web/lib/clo/projection.ts:961-962` (interface declaration)
- Modify: `web/lib/clo/projection.ts:1080-1082` (executor body — see Task 4)
- Modify: `web/lib/clo/projection.ts:2987-2993` (caller — see Task 5)
- Modify: `web/lib/clo/__tests__/b2-post-acceleration.test.ts:85, 115, 141, 168` (4 unit tests — see Task 6)

- [ ] **Step 1: Replace the field declarations on `PostAccelExecutorInput`**

In `projection.ts`, change lines 959-962 from:

```typescript
  /** Whether the incentive-fee IRR hurdle is currently met. Simplified flag;
   *  caller can pass false to disable under distress. */
  incentiveFeeActive: boolean;
  incentiveFeePct: number;
```

to:

```typescript
  /** Sub Note cash-flow series prior to this accel period's residual.
   *  Series convention: index 0 is the equity investment (negative);
   *  subsequent entries are quarterly distributions (signed positive
   *  for inflows). Used by `resolveIncentiveFee` to test whether the
   *  cumulative IRR clears `incentiveFeeHurdleIrr`. Same convention as
   *  the normal-mode `equityCashFlows` accumulator at projection.ts:1973. */
  priorEquityCashFlows: number[];
  /** Annualized IRR hurdle for step (V) post-accel incentive fee.
   *  Same units as `incentiveFeeHurdleIrr` on `ProjectionInputs` (decimal,
   *  e.g. 0.12 for 12%). Zero disables the fee entirely. */
  incentiveFeeHurdleIrr: number;
  incentiveFeePct: number;
```

- [ ] **Step 2: Run typecheck — expect 6 callers to break**

```bash
cd web && npx tsc --noEmit
```

Expected: 6 type errors — 1 in `projection.ts` itself (caller at line 2992) and 5 in `b2-post-acceleration.test.ts` (the 4 existing tests at lines 85, 115, 141, 168 PLUS the KI-15 bug-pin marker added in Task 2, which uses the old `incentiveFeeActive: false` shape). Do not commit yet — type errors get fixed in Tasks 4-6.

---

### Task 4: Replace executor body with `resolveIncentiveFee` call

**Files:**
- Modify: `web/lib/clo/projection.ts:1077-1082` (executor incentive-fee block)

- [ ] **Step 1: Replace the flat-pct gate with the IRR-gated solver**

In `projection.ts`, change lines 1077-1082 from:

```typescript
  // Incentive fee: only if hurdle met AND cash remains. Flat percentage of
  // remaining cash before residual (simplified — proper model would use IRR
  // threshold waterfall). Under distress, hurdle rarely met.
  const incentiveFeePaid = input.incentiveFeeActive
    ? pay(Math.max(0, remaining) * (input.incentiveFeePct / 100))
    : 0;
```

to:

```typescript
  // PPM Post-Accel POP step (V): Incentive Collateral Management Fee. Same
  // IRR-threshold mechanics as normal-mode step (CC) — see projection.ts
  // §10 (line ~3763). The cumulative Sub Note IRR is computed on the prior
  // cashflow series + this period's pre-fee residual; if the hurdle clears,
  // the fee fires at `incentiveFeePct` (or a bisected lower amount under
  // regime 3 of `resolveIncentiveFee`). Mirrors the normal-mode call shape.
  let incentiveFeePaid = 0;
  if (
    input.incentiveFeePct > 0 &&
    input.incentiveFeeHurdleIrr > 0 &&
    remaining > 0
  ) {
    const fee = resolveIncentiveFee(
      input.priorEquityCashFlows,
      Math.max(0, remaining),
      input.incentiveFeePct,
      input.incentiveFeeHurdleIrr,
      4,
    );
    incentiveFeePaid = pay(fee);
  }
```

> **Why `pay(fee)` and not `remaining -= fee`:** preserves the existing `pay` helper's invariant that `remaining` never goes negative (line 999-1003). Functionally equivalent here because `fee ≤ remaining * incentiveFeePct/100 < remaining`.

- [ ] **Step 2: Run typecheck — should drop to 5 errors (just the b2 test sites + caller)**

```bash
cd web && npx tsc --noEmit
```

Expected: 5 errors in `b2-post-acceleration.test.ts` (4 existing + KI-15 marker) plus 1 error in `projection.ts` for the caller at line 2992. Total: 6 if the caller is still unchanged. Task 4 (this task) only changes the executor body — it does not introduce or fix any error site by itself. Move on; Task 5 fixes the caller, Task 6 fixes the b2 sites.

---

### Task 5: Update caller — pass `equityCashFlows` + `incentiveFeeHurdleIrr`

**Files:**
- Modify: `web/lib/clo/projection.ts:2987-2993`

- [ ] **Step 1: Replace the hardcoded `false` with the live cashflow series + hurdle**

In `projection.ts`, change lines 2987-2993 from:

```typescript
        // KI-15: incentive fee under acceleration hardcoded inactive. Correct
        // under most distressed paths (hurdle not met) but wrong for edge
        // scenarios with accumulated pre-breach equity distributions. Fix
        // plan: carry equityCashFlows into accel branch and run
        // resolveIncentiveFee here — ~0.5 day per KI-15 ledger.
        incentiveFeeActive: false,
        incentiveFeePct,
```

to:

```typescript
        // PPM Post-Accel POP step (V): incentive fee gated on cumulative
        // Sub Note IRR including pre-breach distributions. The executor
        // calls `resolveIncentiveFee(priorEquityCashFlows, residual, ...)`
        // internally; pass the live `equityCashFlows` accumulator (already
        // contains pre-breach + earlier accel-mode distributions; does NOT
        // yet contain this period's residual, which the executor is about
        // to compute).
        priorEquityCashFlows: equityCashFlows,
        incentiveFeeHurdleIrr,
        incentiveFeePct,
```

- [ ] **Step 2: Run typecheck — caller error gone, 5 test errors remain**

```bash
cd web && npx tsc --noEmit
```

Expected: 5 errors in `b2-post-acceleration.test.ts` only (4 existing tests + KI-15 marker). Move on to Task 6.

---

### Task 6: Update existing 4 b2-post-acceleration unit tests for new signature

**Files:**
- Modify: `web/lib/clo/__tests__/b2-post-acceleration.test.ts:85, 115, 141, 168`

The 4 existing tests construct executor inputs directly. They all want the existing behavior of "no incentive fee fires" because their scenarios don't supply meaningful prior cashflows. Two equivalent ways to keep that behavior under the new signature:

- (a) Pass `incentiveFeeHurdleIrr: 0` — the executor's `if (input.incentiveFeeHurdleIrr > 0 && ...)` gate short-circuits to zero. Cleanest analog of "disable."
- (b) Pass `incentiveFeePct: 0` — same gate short-circuits. The 4 existing tests already pass `incentiveFeePct: 0` in three of four cases (lines 86, 116, 142); only the residual-to-Sub test passes a non-zero pct.

Use (a) — set `incentiveFeeHurdleIrr: 0` everywhere — for clarity. Plus `priorEquityCashFlows: []` (irrelevant when hurdle is 0).

- [ ] **Step 1: Update each of the 4 existing tests' callers**

All four existing tests use `incentiveFeePct: 0` (verified at lines 86, 116, 142, 169). For each of lines 85, 115, 141, 168, replace:

```typescript
      incentiveFeeActive: false,
      incentiveFeePct: 0,
```

with:

```typescript
      priorEquityCashFlows: [],
      incentiveFeeHurdleIrr: 0,
      incentiveFeePct: 0,
```

- [ ] **Step 2: Replace the KI-15 marker (from Task 2) with the closure assertion**

This is the bijection rule's "flip" moment: the marker that documented the bug pre-fix now becomes the assertion of the fix. Updating it now (before running the suite) avoids the contradiction of "all PASS" while the marker still references a removed field.

Replace the entire `describe("KI-15 — accel-mode incentive fee currently hardcoded inactive", () => { ... })` block from Task 2 with a positive assertion that covers both regime-1 and regime-2 paths through `resolveIncentiveFee`:

```typescript
describe("KI-15 — accel-mode incentive fee fires when cumulative Sub Note IRR clears hurdle (CLOSED)", () => {
  const baseTranches = [
    { className: "Class A", currentBalance: 100_000_000, spreadBps: 100, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: false, isAmortising: false, amortisationPerPeriod: null, amortStartDate: null },
    { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 8, isFloating: false, isIncomeNote: true, isDeferrable: false, isAmortising: false, amortisationPerPeriod: null, amortStartDate: null },
  ];
  const trancheBalances = { "Class A": 100_000_000, "Sub": 20_000_000 };
  const deferredBalances = { "Class A": 0, "Sub": 0 };
  const interestDue = { "Class A": 1_000_000, "Sub": 0 };
  const seniorExpenses = { taxes: 0, issuerProfit: 0, trusteeFees: 0, adminExpenses: 0, seniorMgmtFee: 0, hedgePayments: 0 };

  it("regime 2: full flat fee fires when prior IRR comfortably clears hurdle", () => {
    // 8 quarters of 3M on 20M invested → annualized IRR ≈ 31.6%, well above
    // 12% hurdle. Probe (/tmp/probe-ki15.ts on 2026-05-03) confirms regime 2:
    // full fee = 0.20 × 4M = 800K, post-full-fee IRR still clears.
    // 2M × 8 was REJECTED — sums to 0 against the 4M residual, IRR = 0% < 12%.
    const priorEquityCashFlows = [-20_000_000, ...Array(8).fill(3_000_000)];

    const result = runPostAccelerationWaterfall({
      totalCash: 105_000_000,
      tranches: baseTranches,
      trancheBalances: { ...trancheBalances },
      deferredBalances,
      seniorExpenses,
      interestDueByTranche: interestDue,
      subMgmtFee: 0,
      priorEquityCashFlows,
      incentiveFeeHurdleIrr: 0.12,
      incentiveFeePct: 20,
    });

    // Pin the exact regime-2 value: full fee = availableAmount × pct/100 =
    // 4M × 0.20 = 800K (no FP drift — multiplication of two exact values).
    expect(result.incentiveFeePaid).toBeCloseTo(800_000, -1);
    expect(result.residualToSub).toBeCloseTo(3_200_000, -1);
  });

  it("regime 1: zero incentive fee when prior cashflow IRR is below hurdle", () => {
    // Same scenario, hurdle artificially high (99%) — prior IRR ≈ 31.6%
    // doesn't clear, regime 1 returns 0.
    const priorEquityCashFlows = [-20_000_000, ...Array(8).fill(3_000_000)];

    const result = runPostAccelerationWaterfall({
      totalCash: 105_000_000,
      tranches: baseTranches,
      trancheBalances: { ...trancheBalances },
      deferredBalances,
      seniorExpenses,
      interestDueByTranche: interestDue,
      subMgmtFee: 0,
      priorEquityCashFlows,
      incentiveFeeHurdleIrr: 0.99,
      incentiveFeePct: 20,
    });
    expect(result.incentiveFeePaid).toBe(0);
    expect(result.residualToSub).toBeCloseTo(4_000_000, -1);
  });
});
```

> **Why two assertions:** one for the IRR-clears-hurdle path (regime 2 — full fee fires), one for the IRR-below-hurdle path (regime 1 — fee = 0). Together they pin the gate's behavior in both directions and lock against a future regression that hardcodes either branch. The two scenarios use the SAME `priorEquityCashFlows` and only flip the hurdle — isolates the gate to a single variable.

> **Regime 3 (bisection) is not directly covered.** A scenario where the full fee would push IRR below hurdle but a partial fee would land exactly at hurdle is constructible but fragile (depends on the bisection's 20-iteration precision). Defer to the normal-mode tests in `projection-edge-cases.test.ts:887-893` and `projection-advanced.test.ts:370-405` which already exercise regime 3 via the same shared `resolveIncentiveFee` helper. The accel and normal paths now route through identical math; regime 3 coverage transfers.

- [ ] **Step 3: Run typecheck — clean**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors. The KI-15 marker no longer references the removed `incentiveFeeActive` field; all 4 existing tests use the new signature.

- [ ] **Step 4: Run the b2 test file — all green**

```bash
cd web && npx vitest run lib/clo/__tests__/b2-post-acceleration.test.ts
```

Expected: all tests PASS, including both KI-15 (CLOSED) assertions and the unchanged 4 unit tests + the integration tests (lines 181-...).

- [ ] **Step 5: Commit**

```bash
git add web/lib/clo/projection.ts web/lib/clo/__tests__/b2-post-acceleration.test.ts
git commit -m "KI-15: activate IRR-gated incentive fee under acceleration via resolveIncentiveFee"
```

---

### Task 7: Run full suite — verify N1 unchanged on Euro XV, no regressions elsewhere

**Files:**
- No file edits; verification only.

Euro XV does not accelerate (EoD cushion 158.52% vs 102.5% trigger), so the accel branch never executes on the live data path. N1 harness numbers must be bit-identical pre- and post-fix. Any divergence in N1 means the change leaked into normal-mode somehow — investigate before continuing.

- [ ] **Step 1: Run the full vitest suite**

```bash
cd web && npm test
```

Expected: all tests PASS. Pay particular attention to:
- `n1-correctness.test.ts` (Euro XV bucket-by-bucket harness — must be unchanged)
- `b1-event-of-default.test.ts` (EoD detection — interacts with the accel flip)
- `b2-post-acceleration.test.ts` (the file modified — should be clean from Task 6 already)
- `eod-materiality-euro-xv.test.ts` (Euro XV stress materiality)
- `non-deferrable-shortfall-eod.test.ts` (alternate EoD trigger)
- `architecture-boundary.test.ts` (AST guard — the change is engine-internal, should be untouched)

- [ ] **Step 2: Run the lint**

```bash
cd web && npm run lint
```

Expected: clean.

- [ ] **Step 3: Run the typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Verify no orphan KI-15 references remain in code or disclosures**

```bash
grep -rn "KI-15\|ki-15\|ki15" web/lib web/app web/docs/clo-model-known-issues.md 2>/dev/null
```

Expected: matches only in (a) the KI-15 ledger entry itself (about to be removed in Task 8), (b) the test names from Task 6 Step 2 ("KI-15 — accel-mode incentive fee fires…"), and possibly (c) historical comments. No live `KI-15` annotation should remain on engine code that asserts current-bug behavior.

- [ ] **Step 5: Commit if any cleanup needed**

If any orphan annotations need removal, do so in a separate commit:

```bash
git add web/...
git commit -m "KI-15: remove stale KI-15 annotation now that fee is live"
```

---

### Task 8: Close the ledger entry per project closure protocol

**Files:**
- Modify: `web/docs/clo-model-known-issues.md` (delete KI-15 entry + index pointer + anchor entirely)

Per CLAUDE.md and the ledger header: *"Entries are closed by deleting the entry, its index pointer, and its anchor entirely once the corresponding fix ships and is verified in the N1 harness — no `[CLOSED]` marker is left behind."*

- [ ] **Step 1: Remove the KI-15 entry body**

Delete lines containing the `<a id="ki-15"></a>` anchor and the entire `### [KI-15] B2 accelerated-mode incentive fee hardcoded inactive` section through to the next `---` separator. (Currently roughly lines 379-389 of the ledger; verify by re-reading before deleting.)

- [ ] **Step 2: Remove the KI-15 index pointer**

In the "Deferred — intentionally not modeled" section (around ledger line 53):

```markdown
- [KI-15 — B2 accelerated-mode incentive fee hardcoded inactive](#ki-15)
```

Delete this line.

- [ ] **Step 3: Verify disclosure-bijection test still passes**

```bash
cd web && npx vitest run lib/clo/__tests__/disclosure-bijection.test.ts
```

Expected: PASS. Any orphan reference to `KI-15` in code, docstrings, or disclosures (anywhere outside the test names from Task 6) would trip this scanner. If it fails, follow the test's reported file:line and clean up the orphan reference.

- [ ] **Step 4: Commit ledger closure**

```bash
git add web/docs/clo-model-known-issues.md
git commit -m "KI-15 closure — remove ledger entry + strip KI-15 references from source"
```

---

### Task 9: Final verification — full suite + N1 bit-identity check

**Files:**
- No file edits; verification only.

- [ ] **Step 1: Run full suite once more after ledger closure**

```bash
cd web && npm test
```

Expected: all PASS. The disclosure-bijection scanner should still be green from Task 8 Step 3.

- [ ] **Step 2: Spot-check N1 numbers against the pre-fix baseline**

The N1 harness at `n1-correctness.test.ts` reports per-step bucket drift on Euro XV. Capture the test output before and after the fix; on Euro XV (no acceleration), every bucket value must be identical — the post-accel branch never executes, so its changes have zero numerical impact on the harness. If any N1 bucket drifts by even a cent, investigate before claiming closure: it means the change leaked into normal-mode (e.g., via a shared helper or a typecheck-induced refactor).

- [ ] **Step 3: Final commit gate**

If everything green: nothing more to commit. If something needed cleanup: commit it as a follow-up.

---

### Task 10: Merge per global CLAUDE.md rule

**Files:**
- N/A (git operation).

Per the global CLAUDE.md: *"After committing you should make sure to merge. After finishing always merge with the branch you branched off of."*

- [ ] **Step 1: Determine current branch**

```bash
git branch --show-current
```

If the branch is `main`: nothing to merge — commits already on main. Done.
If the branch is a feature branch (e.g., `ki-15`): merge to `main`.

- [ ] **Step 2: Merge to main if on a feature branch**

```bash
git checkout main && git merge --ff-only <feature-branch>
```

`--ff-only` is preferred when the branch is a clean linear set of commits ahead of main. If a non-fast-forward merge is needed, ask the user before proceeding (per CLAUDE.md "actions visible to others or that affect shared state" — merges into main count).

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage:** Tasks 1-10 cover Task 1 (PPM verify, four points including multi-period priors convention), Task 2 (probe-pinned bug marker), Tasks 3/4 (input type + executor body), Task 5 (caller wiring), Task 6 (test signature update + bijection flip in single ordered sequence), Task 7 (full-suite verification), Task 8 (ledger closure), Task 9 (final regression check), Task 10 (merge). All ledger Path-to-Close items addressed.

- [ ] **Placeholder scan:** "Sprint TBD" appears once in Task 2 Step 3 — intentional placeholder for the marker's `closesIn` field, replaced by the actual sprint name when the closure PR ships. No other placeholders.

- [ ] **Type consistency:** `priorEquityCashFlows: number[]` and `incentiveFeeHurdleIrr: number` consistent across Task 3 (declaration), Task 4 (executor body consumption), Task 5 (caller-side production), Task 6 (test inputs).

- [ ] **Magnitude pinned by probe, not by guess:** Task 2 Step 1 mandates running `/tmp/probe-ki15.ts` against the actual `resolveIncentiveFee` (via temporary export) before writing the marker. The bug-pin uses `3M × 8` (verified to clear 12% hurdle, regime 2 fee = 800K), NOT `2M × 8` (which sums to zero against the residual and silently fails to excite the bug). The closure assertion in Task 6 Step 2 uses the same `3M × 8` to ensure pre-fix-pin and post-fix-assertion exercise the same code path.

- [ ] **Step ordering inside Task 6:** marker update (Step 2) precedes typecheck (Step 3) and suite run (Step 4). No "all PASS" claim made while the marker still references a removed interface field.

- [ ] **PPM gate honored:** Task 1 is a hard prerequisite; Tasks 2-10 assume the four-point gate clears. No code change ships against an unverified PPM assumption.

---

## Open questions / risks

1. **`incentiveFeeHurdleIrr` units (verified decimal).** `ProjectionInputs.incentiveFeeHurdleIrr` is decimal (e.g. 0.12 for 12%) per the docstring at `projection.ts:132` and the comparison at `:3764` (`if (incentiveFeeHurdleIrr > 0 && ...)` consistent with decimal — a 12% hurdle stored as `12` would still hit `> 0` but `resolveIncentiveFee` tests against an annualized IRR also in decimal, so the comparison `12 < 0.31` would always fail and the fee would never fire). Plan-side: pass through unchanged at the caller (Task 5).

2. **The existing 4 b2 unit tests (Class A absorbs cash first, etc.) should NOT be re-baselined to exercise the NEW gate.** Those tests pin orthogonal mechanics (pari passu, residual-to-sub, shortfall-not-PIKed). Keeping them on `incentiveFeeHurdleIrr: 0` preserves their original assertion shape. The two new assertions in Task 6 Step 2 cover the gate behavior on their own.

3. **Multi-period priors convention.** Surfaced as Task 1 verification point (4); duplicated here for visibility. Each accel-mode period's `priorEquityCashFlows` includes the prior period's POST-fee residual (because `equityDistributionAccel = accelResult.residualToSub` is pushed at `:3010`). Under regime 3 bisection this leaves zero IRR margin entering the next period, so a borderline-hurdle scenario at period N can produce a regime-1-zero at period N+1. PPM-correct if the indenture defines the test on actual prior distributions (the common convention); requires a parallel pre-fee accumulator if the indenture defines it differently. Resolve in Task 1 before relying on the existing post-fee push.
