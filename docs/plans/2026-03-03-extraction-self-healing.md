# Extraction Self-Healing & Truncation Continuation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the extraction pipeline self-correcting — detect validation failures and truncated outputs, then automatically retry with targeted prompts that fix the specific problem.

**Architecture:** Add a post-extraction repair loop to `runner.ts`. After the initial 5 passes run and validation completes, check for two categories of problems: (1) validation failures that indicate a specific pass produced wrong/incomplete data, and (2) truncated passes that didn't finish outputting. For each, re-run the affected pass with a repair prompt that includes the specific discrepancy. Also add cross-chunk dedup for holdings (Pass 2) in the normalizer. Max 1 repair cycle to bound cost/time.

**Tech Stack:** TypeScript, Anthropic API (tool use), existing Zod schemas

---

### Task 1: Add holdings dedup to normalizer

Holdings from multi-chunk extraction or repeated extraction can produce duplicates. Add dedup by ISIN/LX ID (strongest identifier), falling back to obligor+facility name.

**Files:**
- Modify: `web/lib/clo/extraction/normalizer.ts`

**Step 1: Add `deduplicateHoldings` function**

Add after the existing `deduplicateComplianceTests` function, before `normalizePass1`:

```typescript
/** Dedup key for a holding: prefer ISIN > LXID > obligor+facility */
function holdingDedupKey(h: { obligorName?: string | null; facilityName?: string | null; isin?: string | null; lxid?: string | null }): string {
  if (h.isin) return `isin:${h.isin.trim().toUpperCase()}`;
  if (h.lxid) return `lxid:${h.lxid.trim().toUpperCase()}`;
  const obligor = (h.obligorName ?? "").toLowerCase().trim();
  const facility = (h.facilityName ?? "").toLowerCase().trim();
  return `name:${obligor}|${facility}`;
}

/** Score a holding by data completeness (higher = more complete) */
function holdingDataScore(h: Record<string, unknown>): number {
  let score = 0;
  if (h.parBalance != null) score += 10;
  if (h.spreadBps != null) score += 5;
  if (h.moodysRating != null) score += 3;
  if (h.spRating != null) score += 3;
  if (h.maturityDate != null) score += 2;
  if (h.industryDescription != null) score += 2;
  if (h.currentPrice != null) score += 1;
  if (h.allInRate != null) score += 1;
  return score;
}

/** Deduplicate holdings — keep the entry with most data for each unique asset */
function deduplicateHoldings(
  holdings: Pass2Output["holdings"],
): Pass2Output["holdings"] {
  if (holdings.length === 0) return holdings;

  const groups = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const key = holdingDedupKey(h);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(h);
  }

  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return group[0];
    // Merge: start with most complete entry, fill nulls from others
    group.sort((a, b) => holdingDataScore(b) - holdingDataScore(a));
    const best = { ...group[0] };
    for (const other of group.slice(1)) {
      for (const [key, val] of Object.entries(other)) {
        if (val != null && (best as Record<string, unknown>)[key] == null) {
          (best as Record<string, unknown>)[key] = val;
        }
      }
    }
    return best;
  });
}
```

**Step 2: Wire it into `normalizePass2`**

Change `normalizePass2` to call the dedup:

```typescript
export function normalizePass2(data: Pass2Output, reportPeriodId: string): {
  holdings: Record<string, unknown>[];
} {
  const base = { report_period_id: reportPeriodId };
  const deduped = deduplicateHoldings(data.holdings);
  return {
    holdings: deduped.map((h) => toDbRow(h, base)),
  };
}
```

**Step 3: Verify build**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add web/lib/clo/extraction/normalizer.ts
git commit -m "feat(clo): add holdings deduplication in normalizer"
```

---

### Task 2: Add repair prompt generators

Create targeted repair prompts that tell Claude exactly what went wrong and what to re-extract. These are appended to the original pass prompts when a repair is needed.

**Files:**
- Modify: `web/lib/clo/extraction/prompts.ts`

**Step 1: Add repair prompt functions**

Add at the end of the file:

```typescript
/** Build a repair user prompt for Pass 2 when holdings count is off */
export function pass2RepairPrompt(
  reportDate: string,
  extractedCount: number,
  expectedCount: number,
): { system: string; user: string } {
  const base = pass2Prompt(reportDate);
  return {
    system: base.system,
    user: `${base.user}

REPAIR CONTEXT — CRITICAL:
A previous extraction attempt found only ${extractedCount} holdings, but the pool summary indicates ${expectedCount} assets. You are MISSING approximately ${expectedCount - extractedCount} positions. This is likely because:
- The extraction stopped partway through the asset tables
- Some tables (Asset Information II, III) were skipped
- Holdings starting with later letters (D-Z) were not reached

You MUST extract ALL ${expectedCount} positions. Do NOT stop early. Continue through every page of asset data until you have extracted every single holding.`,
  };
}

/** Build a continuation user prompt for a truncated pass */
export function passContinuationPrompt(
  passNum: number,
  reportDate: string,
  lastItems: string[],
  arrayField: string,
): { system: string; user: string } {
  const promptFn = passNum === 2 ? pass2Prompt
    : passNum === 3 ? pass3Prompt
    : passNum === 4 ? pass4Prompt
    : pass5Prompt;
  const base = promptFn(reportDate);

  return {
    system: base.system,
    user: `${base.user}

CONTINUATION — CRITICAL:
A previous extraction was TRUNCATED and did not complete. The last items extracted in the "${arrayField}" array were:
${lastItems.map((item) => `- ${item}`).join("\n")}

You MUST continue extracting from where the previous extraction stopped. Include ALL remaining items that were not yet extracted. Do NOT re-extract items that were already captured — start from the NEXT item after the ones listed above.`,
  };
}
```

**Step 2: Verify build**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/prompts.ts
git commit -m "feat(clo): add repair and continuation prompt generators"
```

---

### Task 3: Add repair logic to the runner

This is the core change. After the initial extraction and validation, check for problems and re-run affected passes with targeted repair prompts.

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts`

**Step 1: Add helper to detect repairable problems**

Add after the `PassResult` interface (line 172), before `runExtraction`:

```typescript
interface RepairAction {
  pass: number;
  reason: string;
  type: "validation_mismatch" | "truncation";
}

function detectRepairNeeds(
  pass1Data: import("./schemas").Pass1Output,
  passResults: PassResult[],
  validationResult: import("./validator").ValidationResult,
): RepairAction[] {
  const repairs: RepairAction[] = [];

  // Check for truncated passes
  for (const pr of passResults) {
    if (pr.truncated && pr.data) {
      repairs.push({
        pass: pr.pass,
        reason: `Pass ${pr.pass} output was truncated`,
        type: "truncation",
      });
    }
  }

  // Check validation: holdings count mismatch (Pass 2)
  const p2 = passResults.find((p) => p.pass === 2);
  if (p2?.data) {
    const holdings = (p2.data as unknown as import("./schemas").Pass2Output).holdings;
    const expectedAssets = pass1Data.poolSummary.numberOfAssets;
    if (expectedAssets != null && holdings.length < expectedAssets * 0.85) {
      // More than 15% missing — worth repairing
      repairs.push({
        pass: 2,
        reason: `Extracted ${holdings.length} holdings but pool summary says ${expectedAssets} assets`,
        type: "validation_mismatch",
      });
    }
  }

  // Deduplicate — if a pass has both truncation and validation issues, keep validation (more targeted)
  const seen = new Set<number>();
  return repairs.filter((r) => {
    if (seen.has(r.pass)) return false;
    seen.add(r.pass);
    return true;
  });
}

/** Get the last N items from the largest array in a pass result, for continuation context */
function getLastItems(data: Record<string, unknown>, n: number): { field: string; items: string[] } {
  let largestField = "";
  let largestArray: unknown[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val) && val.length > largestArray.length) {
      largestField = key;
      largestArray = val;
    }
  }

  if (largestArray.length === 0) return { field: "", items: [] };

  const last = largestArray.slice(-n);
  const items = last.map((item) => {
    if (typeof item === "object" && item !== null) {
      // Pick a human-readable summary: obligorName, testName, description, className, etc.
      const obj = item as Record<string, unknown>;
      const name = obj.obligorName ?? obj.testName ?? obj.description ?? obj.className ?? obj.bucketName ?? obj.feeType ?? "";
      return String(name);
    }
    return String(item);
  });

  return { field: largestField, items };
}
```

**Step 2: Add the repair loop into `runExtraction`**

In `runner.ts`, after the validation result is computed (after line 407 `const validationResult = validateExtraction(...)`) and BEFORE the final status update query (line 410), insert the repair loop:

```typescript
  // ─── Repair Loop: re-extract passes with validation failures or truncation ───
  const repairNeeds = detectRepairNeeds(pass1Data, passResults, validationResult);

  if (repairNeeds.length > 0) {
    console.log(`[extraction] Repair needed for ${repairNeeds.length} pass(es): ${repairNeeds.map((r) => `Pass ${r.pass} (${r.reason})`).join(", ")}`);

    for (const repair of repairNeeds) {
      const pr = passResults.find((p) => p.pass === repair.pass);

      if (repair.type === "truncation" && pr?.data) {
        // Continuation: re-run with context about where we stopped
        const { field, items } = getLastItems(pr.data as Record<string, unknown>, 3);
        if (field && items.length > 0) {
          const contPrompt = passContinuationPrompt(repair.pass, reportDate, items, field);
          const schema = repair.pass === 2 ? pass2Schema : repair.pass === 3 ? pass3Schema : repair.pass === 4 ? pass4Schema : pass5Schema;
          const toolName = `extract_pass${repair.pass}`;

          console.log(`[extraction] Running continuation  for Pass ${repair.pass}, last items: ${items.join(", ")}`);
          const contResult = await callClaudeStructured(apiKey, contPrompt.system, documents, contPrompt.user, 65536, schema, toolName);

          if (contResult.data && !contResult.error) {
            // Merge continuation results into existing data
            const existing = pr.data as Record<string, unknown>;
            for (const [key, val] of Object.entries(contResult.data as Record<string, unknown>)) {
              if (val == null) continue;
              const baseVal = existing[key];
              if (Array.isArray(val) && Array.isArray(baseVal)) {
                existing[key] = [...baseVal, ...val];
              } else if (existing[key] == null) {
                existing[key] = val;
              }
            }
            pr.truncated = contResult.truncated;
            rawOutputs[`pass${repair.pass}_continuation`] = contResult.data;
          }
        }
      } else if (repair.type === "validation_mismatch" && repair.pass === 2) {
        // Full re-extraction with repair context
        const holdings = pr?.data ? (pr.data as unknown as import("./schemas").Pass2Output).holdings : [];
        const expectedAssets = pass1Data.poolSummary.numberOfAssets ?? 0;
        const repairPr = pass2RepairPrompt(reportDate, holdings.length, expectedAssets);

        console.log(`[extraction] Running repair extraction for Pass 2 (${holdings.length}/${expectedAssets} holdings)`);
        const repairResult = await callClaudeStructured(apiKey, repairPr.system, documents, repairPr.user, 65536, pass2Schema, "extract_pass2");

        if (repairResult.data && !repairResult.error) {
          try {
            const validated = pass2Schema.parse(repairResult.data);
            const newHoldings = validated.holdings;
            // Only use repair result if it actually got more holdings
            if (newHoldings.length > holdings.length) {
              console.log(`[extraction] Repair improved Pass 2: ${holdings.length} → ${newHoldings.length} holdings`);
              const prIdx = passResults.findIndex((p) => p.pass === 2);
              passResults[prIdx] = {
                pass: 2,
                data: validated as unknown as Record<string, unknown>,
                truncated: repairResult.truncated,
                raw: JSON.stringify(repairResult.data),
              };
              rawOutputs.pass2_repair = repairResult.data;

              // Re-insert holdings
              const normalized = normalizePass2(validated, reportPeriodId);
              await replaceIfPresent("clo_holdings", normalized.holdings);
            } else {
              console.log(`[extraction] Repair did not improve Pass 2 (${newHoldings.length} ≤ ${holdings.length}), keeping original`);
            }
          } catch (e) {
            console.log(`[extraction] Repair Pass 2 validation failed: ${(e as Error).message}`);
          }
        }
      }
    }

    // Re-run validation after repairs
    const repairedP2 = passResults.find((p) => p.pass === 2);
    const repairedPass2Data = repairedP2?.data as unknown as import("./schemas").Pass2Output | null;
    const repairedPass3Data = (passResults.find((p) => p.pass === 3)?.data as unknown as import("./schemas").Pass3Output) ?? null;
    const repairedValidation = validateExtraction(pass1Data, repairedPass2Data ?? null, repairedPass3Data);

    // Use repaired validation for final status
    Object.assign(validationResult, repairedValidation);
  }
```

**Step 3: Add the imports for the new prompt functions**

Update the import at the top of `runner.ts`:

```typescript
import { pass1Prompt, pass2Prompt, pass3Prompt, pass4Prompt, pass5Prompt, pass2RepairPrompt, passContinuationPrompt } from "./prompts";
```

**Step 4: Also need to re-insert continuation data for truncated passes**

After the repair loop's continuation merge, if Pass 2 data changed, re-insert. For Pass 2 truncation continuations, add re-insertion logic. Actually this is already handled — the existing insert code runs BEFORE the repair loop. We need to re-insert after repairs.

Restructure: Move the Pass 2/3/4/5 DB insertion code into a helper function so it can be called again after repair. OR simpler: just re-insert Pass 2 after a truncation repair.

Add after the truncation merge block (inside the `if (repair.type === "truncation"` branch), if it was Pass 2:

```typescript
          // Re-insert if this was a holdings continuation
          if (repair.pass === 2) {
            try {
              const validated = pass2Schema.parse(existing);
              const normalized = normalizePass2(validated, reportPeriodId);
              await replaceIfPresent("clo_holdings", normalized.holdings);
            } catch { /* validation failed, keep original data */ }
          }
```

**Step 5: Verify build**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add web/lib/clo/extraction/runner.ts
git commit -m "feat(clo): add self-healing repair loop for extraction pipeline"
```

---

### Task 4: Handle truncation continuation for Passes 3-5

The repair loop in Task 3 handles Pass 2 re-insertion for both truncation and validation. For Passes 3-5 truncation continuations, we also need to re-insert the merged data.

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts`

**Step 1: Add re-insertion for Passes 3-5 truncation continuations**

Inside the truncation continuation block (the `if (repair.type === "truncation"` branch), after the existing Pass 2 re-insertion, add:

```typescript
          if (repair.pass === 3) {
            try {
              const validated = pass3Schema.parse(existing);
              const normalized = normalizePass3(validated, reportPeriodId);
              await replaceIfPresent("clo_concentrations", normalized.concentrations);
            } catch { /* keep original */ }
          }

          if (repair.pass === 4) {
            try {
              const validated = pass4Schema.parse(existing);
              const normalized = normalizePass4(validated, reportPeriodId);
              await replaceIfPresent("clo_waterfall_steps", normalized.waterfallSteps);
              await replaceIfPresent("clo_proceeds", normalized.proceeds);
              await replaceIfPresent("clo_trades", normalized.trades);
            } catch { /* keep original */ }
          }
```

**Step 2: Verify build**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/runner.ts
git commit -m "feat(clo): handle truncation continuation re-insertion for passes 3-5"
```

---

### Task 5: Update final status to reflect repairs

After the repair loop, the final status computation should account for whether repairs succeeded.

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts`

**Step 1: Update the status computation**

Replace the existing status computation (the `const failedPasses...` / `const status...` block) with a version that runs AFTER the repair loop. Move it to just before the final UPDATE query:

```typescript
  // Determine final status (after any repairs)
  const finalFailedPasses = passResults.filter((p) => !p.data);
  const finalTruncatedPasses = passResults.filter((p) => p.truncated);
  const status = finalFailedPasses.length > 0 ? "partial"
    : (p1Result.truncated || finalTruncatedPasses.length > 0) ? "partial"
    : "complete";
```

The key change: the existing code computes status BEFORE repairs. Move it AFTER the repair loop so that if a truncated pass was continued successfully (and is no longer truncated), the status can be "complete".

**Step 2: Verify build**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/runner.ts
git commit -m "fix(clo): compute extraction status after repair loop"
```

---

### Task 6: Final integration verification

**Step 1: Full build check**

Run: `cd /Users/solal/Documents/GitHub/funzies && cd web && npx next build`
Expected: Build succeeds with no TypeScript errors

**Step 2: Review the complete flow**

Verify the runner now follows this flow:
1. Pass 1 (blocking) → get reportDate
2. Passes 2-5 (parallel)
3. Normalize + insert all pass data
4. Run cross-validation
5. **NEW: Detect repair needs (truncation + validation mismatches)**
6. **NEW: Run targeted repairs (continuation prompts for truncation, repair prompts for validation)**
7. **NEW: Re-insert improved data**
8. **NEW: Re-run validation after repairs**
9. Compute final status (accounts for repairs)
10. Write status + data_quality to DB

**Step 3: Commit if any final fixes needed**

```bash
git commit -m "fix(clo): final adjustments for self-healing extraction"
```
