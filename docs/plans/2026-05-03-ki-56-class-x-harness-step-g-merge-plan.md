# KI-56 Class X harness step-(G) merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close KI-56 by merging the harness `classA_interest` and `classXAmortFromInterest` buckets into a single `stepG_interest` bucket so the N1 waterfall replay correctly compares engine step-(G) emissions against trustee step-(g) on Class X-bearing deals.

**Architecture:** Per the KI-56 ledger entry, choose **option (b)**: rename the harness bucket `classA_interest` to `stepG_interest`, populate it from `trancheInterestByClass.get("Class A") + p.stepTrace.classXAmortFromInterest`, drop `classXAmortFromInterest` from `EngineBucket`. The engine-side field `stepTrace.classXAmortFromInterest` stays — it is consumed by the UI period-trace (separate Class X amort row) and by engine internals; only the **harness bucket** changes. Per-source granularity is already preserved at the engine/UI layer where partners read it; the harness is a tie-out tool whose unit of comparison is the PPM step.

**Tech Stack:** TypeScript, Vitest. Pre/post-fix proven via a new synthetic Class X-bearing harness test that fails to even compile pre-fix (because `EngineBucket` lacks `stepG_interest`) and passes post-fix.

**Branch / worktree:** Create a feature branch off `main`, e.g. `ki-56-step-g-merge`. All work lives in `web/`.

**Verification command (full suite):** `cd web && npm test`. Targeted: `cd web && npm test -- ki56-class-x-step-g` or `cd web && npm test -- n1-correctness`.

---

## File Structure

Files modified, with one-line responsibility:

- `web/lib/clo/ppm-step-map.ts` — defines `EngineBucket` and `ENGINE_BUCKET_TO_PPM`. Source of truth for harness bucket vocabulary.
- `web/lib/clo/backtest-harness.ts` — defines `STEP_TOLERANCES_TARGET` and `extractEngineBuckets`. Maps engine `PeriodResult` → bucket map.
- `web/lib/clo/__tests__/n1-correctness.test.ts` — KI-12b-classA marker reads `drift("classA_interest")`; rename to `drift("stepG_interest")`.
- `web/app/clo/waterfall/HarnessPanel.tsx` — partner-facing blurb keyed on bucket name.
- `web/docs/clo-model-known-issues.md` — delete the KI-56 entry and its index pointer (per project rule "remove the entry, don't mark CLOSED").

Files created:

- `web/lib/clo/__tests__/ki56-class-x-step-g.test.ts` — synthetic Class X-bearing harness test asserting `stepG_interest` ties to a single trustee (G) row carrying combined Class A interest + Class X amort.

Files NOT modified (intentional — engine semantics unchanged):

- `web/lib/clo/projection.ts` — `stepTrace.classXAmortFromInterest` stays as an engine field.
- `web/app/clo/waterfall/period-trace-lines.ts` — UI period trace still reads `stepTrace.classXAmortFromInterest`.
- `web/app/clo/waterfall/__tests__/period-trace-lines.test.ts` — assertions on the engine field stay.

---

## Task 1: Branch + create the failing synthetic test

**Files:**
- Create: `web/lib/clo/__tests__/ki56-class-x-step-g.test.ts`

- [ ] **Step 1: Create a feature branch off main**

```bash
cd /Users/solal/Documents/GitHub/funzies
git checkout -b ki-56-step-g-merge
```

Expected: `Switched to a new branch 'ki-56-step-g-merge'`.

- [ ] **Step 2: Write the failing synthetic Class X-bearing harness test**

Create `web/lib/clo/__tests__/ki56-class-x-step-g.test.ts` with the following content:

```typescript
/**
 * KI-56: harness step-(G) merge correctness on Class X-bearing deals.
 *
 * On a deal with an amortising Class X tranche, PPM step (G) pays Class A
 * interest AND Class X scheduled amortisation pari-passu pro-rata from the
 * interest pool. Trustee waterfall reports step (g) as a single line summing
 * both flows. The harness merges the engine's Class A interest payment with
 * `stepTrace.classXAmortFromInterest` into a single `stepG_interest` bucket
 * so the comparison against trustee[g] ties out.
 *
 * Pre-merge (which this test pins as the post-fix correct shape) the harness
 * had separate `classA_interest: ["g"]` and `classXAmortFromInterest: []`
 * buckets, and `classA_interest` would diverge from trustee[g] by exactly
 * `classXAmortFromInterest`.
 */

import { describe, it, expect } from "vitest";
import { runProjection, addQuarters, type ProjectionInputs, type LoanInput } from "../projection";
import { CLO_DEFAULTS } from "../defaults";
import { runBacktestHarness } from "../backtest-harness";
import type { BacktestInputs } from "../backtest-types";
import { uniformRates } from "./test-helpers";

describe("KI-56 harness step-(G) merge", () => {
  it("stepG_interest bucket equals Class A interest + Class X amort and ties to trustee[g]", () => {
    // Build a synthetic deal with an amortising Class X tranche (rank 1) and
    // a non-amortising Class A (rank 2). Class X amort fires on period 0
    // because no amortStartDate is set.
    const loans: LoanInput[] = Array.from({ length: 5 }, (_, i) => ({
      parBalance: 30_000_000,
      maturityDate: addQuarters("2026-03-09", 24 + i),
      ratingBucket: "B",
      spreadBps: 410,
    }));

    const inputs: ProjectionInputs = {
      initialPar: 150_000_000,
      wacSpreadBps: 410,
      baseRatePct: CLO_DEFAULTS.baseRatePct,
      baseRateFloorPct: CLO_DEFAULTS.baseRateFloorPct,
      seniorFeePct: 0,
      subFeePct: 0,
      trusteeFeeBps: 0,
      hedgeCostBps: 0,
      incentiveFeePct: 0,
      incentiveFeeHurdleIrr: 0,
      postRpReinvestmentPct: 0,
      callMode: "none",
      callDate: null,
      callPricePct: 100,
      callPriceMode: "par",
      reinvestmentOcTrigger: null,
      tranches: [
        {
          className: "Class X",
          currentBalance: 4_000_000,
          spreadBps: 0,
          seniorityRank: 1,
          isFloating: false,
          isIncomeNote: false,
          isDeferrable: false,
          isAmortising: true,
          amortisationPerPeriod: 400_000,
        },
        {
          className: "Class A",
          currentBalance: 100_000_000,
          spreadBps: 110,
          seniorityRank: 2,
          isFloating: true,
          isIncomeNote: false,
          isDeferrable: false,
        },
        {
          className: "Subordinated Notes",
          currentBalance: 30_000_000,
          spreadBps: 0,
          seniorityRank: 3,
          isFloating: false,
          isIncomeNote: true,
          isDeferrable: false,
        },
      ],
      ocTriggers: [],
      icTriggers: [],
      reinvestmentPeriodEnd: "2030-06-15",
      maturityDate: "2034-06-15",
      currentDate: "2026-03-09",
      loans,
      defaultRatesByRating: uniformRates(0),
      cprPct: 0,
      recoveryPct: 0,
      recoveryLagMonths: 6,
      ratingAgencies: ["moodys", "sp", "fitch"],
      reinvestmentSpreadBps: 0,
      reinvestmentTenorQuarters: 8,
      reinvestmentRating: null,
      cccBucketLimitPct: 100,
      cccMarketValuePct: 100,
      deferredInterestCompounds: true,
      useLegacyBucketHazard: true,
    };

    // 1. Run the engine and read the period-0 Class A interest paid + Class X
    //    amort paid from interest. Both must be > 0 for the test to be
    //    discriminating.
    const result = runProjection(inputs);
    const p0 = result.periods[0];
    expect(p0).toBeDefined();
    const classAPaid = p0.trancheInterest.find((t) => t.className === "Class A")?.paid ?? 0;
    const classXAmort = p0.stepTrace.classXAmortFromInterest;
    expect(classAPaid, "Class A interest paid must be > 0 — test isn't discriminating otherwise").toBeGreaterThan(0);
    expect(classXAmort, "Class X amort paid from interest must be > 0 — test isn't discriminating otherwise").toBeGreaterThan(0);

    // 2. Build a synthetic trustee BacktestInputs whose only INTEREST step is
    //    a single (G) line carrying classAPaid + classXAmort — the realistic
    //    shape of a trustee report on a Class X-bearing deal.
    const trusteeStepG = classAPaid + classXAmort;
    const backtest: BacktestInputs = {
      reportDate: "2026-04-01",
      paymentDate: "2026-04-15",
      beginningPar: 150_000_000,
      waterfallSteps: [
        {
          waterfallType: "INTEREST",
          priorityOrder: 7,
          description: "(G)",
          amountDue: trusteeStepG,
          amountPaid: trusteeStepG,
          fundsAvailableBefore: null,
          fundsAvailableAfter: null,
          isOcTestDiversion: false,
          isIcTestDiversion: false,
        },
      ],
      trancheSnapshots: [],
      complianceTests: [],
      accountBalances: [],
    };

    // 3. Run the harness; the stepG_interest bucket must tie to trustee[g]
    //    within €1 (pure arithmetic — no day-count / period-mismatch noise
    //    on a synthetic single-period deal).
    //
    // The `as string` cast on the find lets this test type-check cleanly
    // BOTH pre-rename (when "stepG_interest" is not yet in the EngineBucket
    // union — TS2367 otherwise) and post-rename. Same shape used for the
    // two retired-bucket finds below.
    const harness = runBacktestHarness(inputs, backtest);
    const stepG = harness.steps.find((s) => (s.engineBucket as string) === "stepG_interest");
    expect(stepG, "harness must emit a stepG_interest bucket").toBeDefined();
    expect(stepG!.actual).toBeCloseTo(trusteeStepG, 2);
    expect(stepG!.projected).toBeCloseTo(classAPaid + classXAmort, 2);
    expect(Math.abs(stepG!.delta)).toBeLessThan(1);

    // 4. The old separate `classXAmortFromInterest` bucket must no longer be
    //    emitted (it was merged into stepG_interest).
    const orphanBucket = harness.steps.find((s) => (s.engineBucket as string) === "classXAmortFromInterest");
    expect(orphanBucket, "classXAmortFromInterest bucket must be retired post-merge").toBeUndefined();

    // 5. The old bucket name `classA_interest` must also be gone.
    const oldClassA = harness.steps.find((s) => (s.engineBucket as string) === "classA_interest");
    expect(oldClassA, "classA_interest bucket must be renamed to stepG_interest post-merge").toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails (RED)**

Run: `cd web && npm test -- ki56-class-x-step-g`

Expected: Vitest reports a failure with `expect(stepG).toBeDefined()` — the bucket doesn't exist yet, so `harness.steps.find(...)` returns `undefined`. The `as string` cast on the literal comparison keeps the test file type-clean, so `tsc --noEmit` between Task 1 and Task 2 only complains about the source files, not this test file.

If the test errors out before reaching the `stepG` assertion (e.g. `runProjection` throws because of a missing field), inspect the throw and tighten the synthetic input. The pari-passu-absorption test (`projection-pari-passu-absorption.test.ts:267-302`) is the working reference shape for synthetic Class X inputs.

- [ ] **Step 4: DO NOT COMMIT YET**

Per Defect 2 of the independent plan review: an isolated "failing test" commit landing on `main` after fast-forward merge would leave a deliberately-broken commit in `main`'s history, which breaks `git bisect` and any post-merge CI re-run. Instead, this plan commits the test + the implementation as ONE atomic commit on the feature branch (in Task 7). Leave the new test file uncommitted in the working tree and proceed.

Verify with `git status`: `web/lib/clo/__tests__/ki56-class-x-step-g.test.ts` should appear under "Untracked files".

---

## Task 2: Rename `classA_interest` → `stepG_interest` and merge `classXAmortFromInterest` in `ppm-step-map.ts`

**Files:**
- Modify: `web/lib/clo/ppm-step-map.ts`

- [ ] **Step 1: Update the `EngineBucket` type — rename `classA_interest` and remove `classXAmortFromInterest`**

In `web/lib/clo/ppm-step-map.ts`, replace the line:

```typescript
  | "classA_interest"       // step g    (from PeriodResult.trancheInterest[ClassA].paid)
```

with:

```typescript
  | "stepG_interest"        // step g    (Class A interest + Class X amort paid from interest, pari-passu per PPM step G; sourced from PeriodResult.trancheInterest[ClassA].paid + stepTrace.classXAmortFromInterest)
```

Then DELETE the `classXAmortFromInterest` line (the long inline comment) entirely. The current text spans lines ~135 (one type-union member with a multi-sentence comment).

- [ ] **Step 2: Update `ENGINE_BUCKET_TO_PPM` — rename and remove**

Replace the line:

```typescript
  classA_interest: ["g"],
```

with:

```typescript
  stepG_interest: ["g"],
```

Then DELETE the multi-line `classXAmortFromInterest: [],` block (lines ~181-189), including its preceding comment block. The result of step 2 is one less map entry overall.

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`

Expected: TypeScript reports errors in `backtest-harness.ts` and `n1-correctness.test.ts` and `HarnessPanel.tsx` because they still reference `classA_interest` / `classXAmortFromInterest`. Those callsites are fixed in tasks 3-5.

- [ ] **Step 4: Do NOT commit yet**

The codebase is broken until tasks 3-5 land. Continue.

---

## Task 3: Update the harness extractor + tolerance map in `backtest-harness.ts`

**Files:**
- Modify: `web/lib/clo/backtest-harness.ts:55,70,302,337`

- [ ] **Step 1: Update `STEP_TOLERANCES_TARGET`**

Replace the line:

```typescript
  classXAmortFromInterest: Infinity, // step g — audit metric until Class X-bearing deal lands; current []-empty mapping compares against trustee 0 (zero on Euro XV which has no Class X). See ppm-step-map.ts notes.
```

DELETE this line entirely (the bucket no longer exists).

Replace the line:

```typescript
  classA_interest: 1,                // step g        — tightest post-B3
```

with:

```typescript
  stepG_interest: 1,                 // step g        — Class A interest + Class X amort merged (KI-56 closed); tightest post-B3
```

- [ ] **Step 2: Update `extractEngineBuckets`**

Replace the line:

```typescript
    classA_interest: trancheInterestByClass.get("Class A") ?? 0,
```

with:

```typescript
    stepG_interest: (trancheInterestByClass.get("Class A") ?? 0) + p.stepTrace.classXAmortFromInterest,
```

Then DELETE the `classXAmortFromInterest:` field assignment block (lines ~332-337), including the preceding 4-line comment that explains the (now-retired) audit-metric framing:

```typescript
    // Class X (or any amortising-tranche) scheduled amort paid from the
    // interest pool at PPM step G, pari-passu with Class A interest.
    // Treated as audit metric until a Class X-bearing deal lands and the
    // step-g sharing with classA_interest is properly resolved (see
    // ppm-step-map.ts comments). Zero on Euro XV.
    classXAmortFromInterest: p.stepTrace.classXAmortFromInterest,
```

Replace with a one-line comment above the `stepG_interest` field:

```typescript
    // PPM step (G): Class A interest + Class X amort paid pari-passu from
    // interest pool. On Euro XV (no Class X) the second term is 0.
```

- [ ] **Step 3: Update the JSDoc comment**

Update the line:

```typescript
  /** Engine-side bucket identifier (e.g., "classA_interest"). */
```

to:

```typescript
  /** Engine-side bucket identifier (e.g., "stepG_interest"). */
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`

Expected: errors in `backtest-harness.ts` are gone. Remaining errors only in `n1-correctness.test.ts` and `HarnessPanel.tsx`.

---

## Task 4: Update the KI-12b-classA marker in `n1-correctness.test.ts`

**Files:**
- Modify: `web/lib/clo/__tests__/n1-correctness.test.ts:178-180`

- [ ] **Step 1: Update the marker call**

Replace the block at lines 176-180:

```typescript
  failsWithMagnitude(
    { ki: "KI-12b-classA", closesIn: "KI-12a harness fix", expectedDrift: 25540.56, tolerance: 50 },
    "classA_interest KI-12b day-count drift",
    () => drift("classA_interest"),
  );
```

with:

```typescript
  failsWithMagnitude(
    { ki: "KI-12b-classA", closesIn: "KI-12a harness fix", expectedDrift: 25540.56, tolerance: 50 },
    "stepG_interest (Class A interest; Class X amort = 0 on Euro XV) KI-12b day-count drift",
    () => drift("stepG_interest"),
  );
```

Rationale: Euro XV has no Class X, so `classXAmortFromInterest = 0` and the merged bucket value equals the old `classA_interest` value exactly. The drift magnitude (€25,540.56) is unchanged; only the bucket name updates.

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`

Expected: errors in `n1-correctness.test.ts` are gone. Remaining errors only in `HarnessPanel.tsx`.

---

## Task 5: Update the harness panel blurb key

**Files:**
- Modify: `web/app/clo/waterfall/HarnessPanel.tsx:49`

- [ ] **Step 1: Read the surrounding context**

Read `web/app/clo/waterfall/HarnessPanel.tsx` lines 40-70 to confirm the blurb-map shape (a `Record<EngineBucket, { ids, blurb }>` keyed on the bucket name). The single line at 49 is:

```typescript
  classA_interest: { ids: ["KI-12b", "KI-12a"], blurb: "Class A interest day-count drift. Engine Q2 (91/360) vs trustee Q1 (90/360) period mismatch — closes with KI-12a." },
```

- [ ] **Step 2: Rename the key**

Replace with:

```typescript
  stepG_interest: { ids: ["KI-12b", "KI-12a"], blurb: "Step (G): Class A interest + Class X amort, pari-passu. Day-count drift on Class A interest is the only material component on Euro XV (no Class X); engine Q2 (91/360) vs trustee Q1 (90/360) period mismatch closes with KI-12a." },
```

- [ ] **Step 3: Type-check the whole codebase**

Run: `cd web && npx tsc --noEmit`

Expected: zero errors. The rename is fully propagated.

---

## Task 6: Run the targeted KI-56 test and the full N1 correctness suite

- [ ] **Step 1: Run the new synthetic test**

Run: `cd web && npm test -- ki56-class-x-step-g`

Expected: PASS. The single test in the file passes; `stepG_interest.delta < 1`, both old buckets undefined.

- [ ] **Step 2: Run the N1 correctness suite to confirm Euro XV bucket math is unchanged**

Run: `cd web && npm test -- n1-correctness`

Expected: PASS. KI-12b-classA marker still pins €25,540.56 ± 50 against `stepG_interest` (which on Euro XV equals the old `classA_interest` value exactly, since `classXAmortFromInterest = 0`).

- [ ] **Step 3: Run the harness integrity tests**

Run: `cd web && npm test -- backtest-harness`

Expected: PASS. The "every EngineBucket in ENGINE_BUCKET_TO_PPM is produced by the harness extractor" test (line ~77) confirms `extractEngineBuckets` now emits `stepG_interest` and no longer emits the retired buckets.

- [ ] **Step 4: Run the period-trace tests to confirm the engine field path is untouched**

Run: `cd web && npm test -- period-trace-lines`

Expected: PASS. `stepTrace.classXAmortFromInterest` is still consumed by the UI period-trace mapping — only the **harness bucket** was renamed/merged, not the engine field.

- [ ] **Step 5: Run the full test suite**

Run: `cd web && npm test`

Expected: PASS across the board, with no new red marks. If any unrelated test fails, investigate before proceeding — do NOT mask with `--bail` or skips.

---

## Task 7: Commit the implementation (atomic — test + fix together)

Per Defect 2 of the plan review: this commit bundles the synthetic test (written but not yet committed in Task 1) with the rename + extractor + tolerance + marker + blurb fixes (Tasks 2-5). One atomic commit on the feature branch keeps `main` green at every commit after the eventual merge.

- [ ] **Step 1: Stage everything together and commit**

```bash
cd /Users/solal/Documents/GitHub/funzies
git add \
  web/lib/clo/__tests__/ki56-class-x-step-g.test.ts \
  web/lib/clo/ppm-step-map.ts \
  web/lib/clo/backtest-harness.ts \
  web/lib/clo/__tests__/n1-correctness.test.ts \
  web/app/clo/waterfall/HarnessPanel.tsx
git commit -m "$(cat <<'EOF'
ki-56: merge classA_interest + classXAmortFromInterest into stepG_interest

PPM step (G) pays Class A interest AND Class X scheduled amortisation
pari-passu pro-rata from the interest pool, and trustees report a single
(g) line summing both flows. The harness's previous separate buckets
(classA_interest mapped to ["g"], classXAmortFromInterest mapped to [])
would diverge from trustee[g] by exactly classXAmortFromInterest on any
Class X-bearing deal — silent on Euro XV (no Class X) but a loud false
"engine bug" signal on the next deal whose capital structure includes
an amortising tranche.

Option (b) per the ledger: rename the harness bucket to stepG_interest
and populate it from trancheInterestByClass.get("Class A") +
stepTrace.classXAmortFromInterest. The engine field
stepTrace.classXAmortFromInterest stays — UI period-trace consumes it
to render the Class X amort row separately, and partner-facing per-source
granularity is preserved at that layer. The harness is a tie-out tool
whose unit of comparison is the PPM step.

Marker: KI-12b-classA's drift("classA_interest") becomes
drift("stepG_interest"); on Euro XV the merged bucket value equals the
old classA_interest value because classXAmortFromInterest = 0, so the
pinned magnitude (€25,540.56) is unchanged.

Ships with synthetic Class X-bearing harness marker test
(ki56-class-x-step-g.test.ts) per ledger ↔ test bijection rule.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify clean status**

Run: `git status`

Expected: working tree clean except for the pending KI-56 ledger deletion (next task).

---

## Task 8: Delete KI-56 entry + index pointer from the ledger

**Files:**
- Modify: `web/docs/clo-model-known-issues.md`

Per project convention (memory: "On closure PRs delete the ledger entry + index pointer + anchor entirely; do not leave [CLOSED] markers behind") AND the editorial principle in the ledger header ("Entries are closed by deleting the entry, its index pointer, and its anchor entirely once the corresponding fix ships and is verified").

- [ ] **Step 1: Remove the index pointer**

In `web/docs/clo-model-known-issues.md`, find the line in the "Latent — currently inactive on Euro XV" index section (line ~44):

```markdown
- [KI-56 — N1 harness step-G sharing: `classA_interest` bucket compares against trustee[g] which on a Class X-bearing deal includes Class X amort](#ki-56)
```

DELETE this line entirely.

- [ ] **Step 2: Remove the KI-56 entry**

Delete lines 740-770 inclusive (the `<a id="ki-56"></a>` anchor at line 740 through the trailing blank at line 770, which sits between KI-56's closing `---` at line 769 and the next entry's anchor at line 771). Per the independent plan review (Defect 1) the closing `---` is at line 769, not 768; deleting only 740-768 would leave an orphan `---` next to the prior entry's closing `---`. The 740-770 range preserves the `--- / blank / next-anchor` boundary.

Verify with `head -n 745 web/docs/clo-model-known-issues.md | tail -n 15` after the edit: the output should show KI-38's closing `---`, a blank line, then the `<a id="ki-63"></a>` anchor — no orphan separators.

- [ ] **Step 3: Confirm no stale `KI-56` references remain in source code**

Run:

```bash
grep -rn "KI-56\|ki-56\|ki56" web --include="*.ts" --include="*.tsx" --include="*.md"
```

Expected output: only the new test file `web/lib/clo/__tests__/ki56-class-x-step-g.test.ts` (filename + JSDoc reference). No live source-code references to `KI-56`. If any other reference exists (e.g. an inline comment in `ppm-step-map.ts` or `backtest-harness.ts` left over from the old portability framing), remove it.

Note: per the plan review's stylistic note 5, `disclosure-bijection.test.ts` does NOT scan test files — its `SCAN_FILES` covers `ppm-step-map.ts`, `projection.ts`, `resolver.ts`, etc. So the bijection scanner (Step 4) catches stale `KI-56` references in source code, but the manual grep above is the load-bearing safety check for test-file references. Treat the grep result, not the bijection-test result, as the authority on test files.

- [ ] **Step 4: Run the disclosure-bijection test**

Run: `cd web && npm test -- disclosure-bijection`

Expected: PASS. No KI-56 references in code without a corresponding ledger entry.

- [ ] **Step 5: Commit the ledger deletion**

```bash
cd /Users/solal/Documents/GitHub/funzies
git add web/docs/clo-model-known-issues.md
git commit -m "$(cat <<'EOF'
ki-56 closure — remove ledger entry + index pointer

The harness step-(G) merge (classA_interest + classXAmortFromInterest →
stepG_interest) shipped in the prior commit, with a synthetic Class X
marker test pinning the post-fix correctness assertion. Per project
convention, closed entries are removed from the ledger entirely (no
[CLOSED] marker left behind) so the disclosure-bijection scanner does
not surface stale KI-56 cross-references.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification + merge to main

- [ ] **Step 1: Re-run the full suite as a final guard**

Run: `cd web && npm test`

Expected: PASS across the board.

- [ ] **Step 2: Type-check the whole codebase**

Run: `cd web && npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `cd web && npm run lint`

Expected: no errors. Warnings unrelated to this change are acceptable; warnings the change introduced are not.

- [ ] **Step 4: Review the full diff against main**

Run:

```bash
git diff main...ki-56-step-g-merge
```

Sanity-check:
- `classA_interest` does not appear anywhere in `web/lib/clo/` or `web/app/clo/` (other than possibly a JSDoc comment about the rename, which should also be removed).
- `classXAmortFromInterest:` does not appear as a harness-bucket key in `EngineBucket`, `ENGINE_BUCKET_TO_PPM`, `STEP_TOLERANCES_TARGET`, or `extractEngineBuckets` (it MAY still appear as `stepTrace.classXAmortFromInterest` — that engine field stays).
- KI-56 entry and its index pointer are deleted from `web/docs/clo-model-known-issues.md`.
- The new test file exists and passes.
- KI-12b-classA marker still pins €25,540.56 ± 50, against `stepG_interest`.

- [ ] **Step 5: Merge to main**

Per global CLAUDE.md ("After committing you should make sure to merge"):

```bash
cd /Users/solal/Documents/GitHub/funzies
git checkout main
git merge --ff-only ki-56-step-g-merge
```

If the fast-forward fails (main moved), do `git rebase main` from the feature branch first, re-run the full suite, and try again. Do NOT use `--no-ff` or merge commits unless the user explicitly asks.

- [ ] **Step 6: Delete the feature branch**

```bash
git branch -d ki-56-step-g-merge
```

Expected: branch deleted (`-d` refuses if unmerged; the prior step ensures it is merged).

---

## Notes / Out-of-Scope

- **Engine field rename is NOT in scope.** `stepTrace.classXAmortFromInterest` stays. The UI period-trace `period-trace-lines.ts` reads it directly to render a separate Class X amort row in the partner-facing trace; renaming the engine field would break that surface and is unrelated to KI-56's actual concern (harness portability).

- **No extension to other amortising tranches in scope.** Per the engine code (`projection.ts:3422-3430`), `_stepTrace_classXAmortFromInterest` accumulates amort across ALL `isAmortising` tranches in the senior-non-amort rank group, not just a tranche literally named "Class X". The merge handles any amortising senior tranche correctly without code changes.

- **No KI-12a interaction.** KI-12a (harness period mismatch) is blocked on Q4 2025 data acquisition. The KI-56 fix does NOT depend on KI-12a; the rename leaves the KI-12b-classA drift magnitude unchanged on Euro XV (since `classXAmortFromInterest = 0`, the merged value equals the old `classA_interest` value to the cent).

- **No changes to `STEP_TOLERANCES_TARGET` semantics.** The new `stepG_interest` inherits the old `classA_interest: 1` tolerance. Once a Class X-bearing fixture lands, the tolerance may need re-baselining if Class X amort introduces day-count residuals; that is downstream work tied to the first Class X deal's harness onboarding.
