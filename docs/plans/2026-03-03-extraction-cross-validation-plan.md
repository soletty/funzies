# Extraction Cross-Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic cross-validation checks to CLO report extraction + migrate to structured output for guaranteed schema compliance.

**Architecture:** After all 5 extraction passes complete, a pure validator function compares data across passes (pool summary totals vs holdings aggregates, compliance test math, concentration consistency). Results stored as JSONB on `clo_report_periods`. A small dashboard badge surfaces quality status. Separately, `callAnthropic` switches to tool_use API for schema-guaranteed output.

**Tech Stack:** TypeScript, Zod, Anthropic Messages API (tool_use), Next.js, PostgreSQL

---

### Task 1: Add data_quality column to clo_report_periods

**Files:**
- Modify: `web/lib/schema.sql` (line ~485, after `supplementary_data JSONB`)
- Create: `web/lib/migrations/046_add_data_quality.sql`

**Step 1: Add column to schema.sql**

In `web/lib/schema.sql`, add `data_quality JSONB` to the `clo_report_periods` table definition, after the `supplementary_data` line:

```sql
  supplementary_data JSONB,
  data_quality JSONB,                              -- Cross-validation results from extraction
```

**Step 2: Create migration file**

Check the existing migration numbering convention first:
```bash
ls web/lib/migrations/ | tail -5
```

Create migration `web/lib/migrations/046_add_data_quality.sql` (adjust number to follow sequence):

```sql
ALTER TABLE clo_report_periods ADD COLUMN IF NOT EXISTS data_quality JSONB;
```

**Step 3: Run migration**

```bash
cd web && npx tsx lib/migrate.ts
```

**Step 4: Commit**

```bash
git add web/lib/schema.sql web/lib/migrations/046_add_data_quality.sql
git commit -m "feat(clo): add data_quality column to clo_report_periods"
```

---

### Task 2: Create the cross-validation engine

**Files:**
- Create: `web/lib/clo/extraction/validator.ts`

This is a pure function with no side effects. It takes the parsed outputs from all 5 passes and returns validation results.

**Step 1: Create validator.ts**

```typescript
import type { Pass1Output, Pass2Output, Pass3Output } from "./schemas";

export interface ValidationCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  expected: number | null;
  actual: number | null;
  discrepancy: number | null;
  message: string;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  score: number;
  totalChecks: number;
  checksRun: number;
  checksSkipped: number;
}

// Ratings considered CCC or below (Moody's Caa and below, S&P CCC and below)
const CCC_RATINGS = new Set([
  "caa1", "caa2", "caa3", "caa", "ca", "c", "d",           // Moody's
  "ccc+", "ccc", "ccc-", "cc", "c", "d", "sd",             // S&P
  "ccc", "cc", "c", "d", "rd",                              // Fitch
]);

function isCccOrBelow(rating: string | null | undefined): boolean {
  if (!rating) return false;
  return CCC_RATINGS.has(rating.toLowerCase().trim());
}

function pctDiff(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return Math.abs((actual - expected) / expected) * 100;
}

function absDiff(expected: number, actual: number): number {
  return Math.abs(actual - expected);
}

function check(
  name: string,
  expected: number | null | undefined,
  actual: number | null | undefined,
  tolerance: number,
  unit: "pct" | "abs",
  description: string,
): ValidationCheck | null {
  if (expected == null || actual == null) return null;

  const diff = unit === "pct" ? pctDiff(expected, actual) : absDiff(expected, actual);
  const withinTolerance = diff <= tolerance;
  // Warn if close to tolerance (>50% of tolerance used), fail if over
  const status = withinTolerance ? "pass" : diff <= tolerance * 2 ? "warn" : "fail";

  const discrepancy = unit === "pct"
    ? Math.round(diff * 100) / 100
    : Math.round(diff * 100) / 100;

  const msg = withinTolerance
    ? `${description}: matches within ${discrepancy}${unit === "pct" ? "%" : ""}`
    : `${description}: expected ${expected}, got ${actual} (off by ${discrepancy}${unit === "pct" ? "%" : ""})`;

  return { name, status, expected, actual, discrepancy, message: msg };
}

export function validateExtraction(
  pass1: Pass1Output | null,
  pass2: Pass2Output | null,
  pass3: Pass3Output | null,
): ValidationResult {
  const checks: ValidationCheck[] = [];
  let skipped = 0;

  const pool = pass1?.poolSummary;
  const holdings = pass2?.holdings;
  const tests = pass1?.complianceTests;
  const concentrations = pass3?.concentrations;

  // ─── Pool-Level Checks (Pass 1 vs Pass 2) ───

  if (pool && holdings && holdings.length > 0) {
    const holdingsWithPar = holdings.filter((h) => h.parBalance != null);
    const totalHoldingsPar = holdingsWithPar.reduce((sum, h) => sum + (h.parBalance ?? 0), 0);

    // Check 1: Total Par
    const c1 = check("total_par_match", pool.totalPar, totalHoldingsPar, 2, "pct", "Total par");
    if (c1) checks.push(c1); else skipped++;

    // Check 2: Obligor Count
    const uniqueObligors = new Set(holdings.map((h) => h.obligorName?.toLowerCase().trim()).filter(Boolean)).size;
    const c2 = check("obligor_count", pool.numberOfObligors, uniqueObligors, 2, "abs", "Obligor count");
    if (c2) checks.push(c2); else skipped++;

    // Check 3: Asset Count
    const c3 = check("asset_count", pool.numberOfAssets, holdings.length, 1, "abs", "Asset count");
    if (c3) checks.push(c3); else skipped++;

    // Check 4: WA Spread
    if (pool.wacSpread != null) {
      const holdingsWithSpread = holdingsWithPar.filter((h) => h.spreadBps != null);
      if (holdingsWithSpread.length > 0) {
        const totalParForSpread = holdingsWithSpread.reduce((sum, h) => sum + (h.parBalance ?? 0), 0);
        const waSpread = totalParForSpread > 0
          ? holdingsWithSpread.reduce((sum, h) => sum + (h.spreadBps ?? 0) * (h.parBalance ?? 0), 0) / totalParForSpread
          : 0;
        const c4 = check("wa_spread", pool.wacSpread, waSpread, 10, "abs", "WA spread (bps)");
        if (c4) checks.push(c4); else skipped++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }

    // Check 5: Fixed Rate %
    if (pool.pctFixedRate != null && totalHoldingsPar > 0) {
      const fixedPar = holdings.filter((h) => h.isFixedRate === true).reduce((sum, h) => sum + (h.parBalance ?? 0), 0);
      const calcFixedPct = (fixedPar / totalHoldingsPar) * 100;
      const c5 = check("fixed_rate_pct", pool.pctFixedRate, calcFixedPct, 1, "abs", "Fixed rate %");
      if (c5) checks.push(c5); else skipped++;
    } else {
      skipped++;
    }

    // Check 6: CCC %
    if (pool.pctCccAndBelow != null && totalHoldingsPar > 0) {
      const cccPar = holdings
        .filter((h) => isCccOrBelow(h.moodysRating) || isCccOrBelow(h.spRating) || isCccOrBelow(h.compositeRating))
        .reduce((sum, h) => sum + (h.parBalance ?? 0), 0);
      const calcCccPct = (cccPar / totalHoldingsPar) * 100;
      const c6 = check("ccc_pct", pool.pctCccAndBelow, calcCccPct, 1, "abs", "CCC & below %");
      if (c6) checks.push(c6); else skipped++;
    } else {
      skipped++;
    }

    // Check 7: Defaulted %
    if (pool.pctDefaulted != null && totalHoldingsPar > 0) {
      const defaultedPar = holdings.filter((h) => h.isDefaulted === true).reduce((sum, h) => sum + (h.parBalance ?? 0), 0);
      const calcDefaultedPct = (defaultedPar / totalHoldingsPar) * 100;
      const c7 = check("defaulted_pct", pool.pctDefaulted, calcDefaultedPct, 0.5, "abs", "Defaulted %");
      if (c7) checks.push(c7); else skipped++;
    } else {
      skipped++;
    }
  } else {
    skipped += 7; // All pool-level checks skipped
  }

  // ─── Compliance Test Consistency (Pass 1 vs Pass 3) ───

  if (concentrations && concentrations.length > 0 && tests && tests.length > 0) {
    // Check 8: Industry concentration — largest bucket ≤ test limit
    const industryBuckets = concentrations.filter((c) => c.concentrationType === "INDUSTRY");
    const maxIndustryPct = industryBuckets.reduce((max, c) => Math.max(max, c.actualPct ?? 0), 0);
    const industryTests = tests.filter((t) =>
      t.testType === "CONCENTRATION" && t.testName?.toLowerCase().includes("industry")
    );
    if (maxIndustryPct > 0 && industryTests.length > 0) {
      const industryLimit = industryTests[0].triggerLevel ?? industryTests[0].thresholdLevel;
      if (industryLimit != null) {
        const status = maxIndustryPct <= industryLimit ? "pass" : "fail";
        checks.push({
          name: "industry_concentration",
          status,
          expected: industryLimit,
          actual: maxIndustryPct,
          discrepancy: Math.round((maxIndustryPct - industryLimit) * 100) / 100,
          message: status === "pass"
            ? `Largest industry bucket (${maxIndustryPct.toFixed(1)}%) within limit (${industryLimit}%)`
            : `Largest industry bucket (${maxIndustryPct.toFixed(1)}%) exceeds limit (${industryLimit}%)`,
        });
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }

    // Check 9: Single obligor concentration
    const obligorBuckets = concentrations.filter((c) => c.concentrationType === "SINGLE_OBLIGOR");
    const maxObligorPct = obligorBuckets.reduce((max, c) => Math.max(max, c.actualPct ?? 0), 0);
    const obligorTests = tests.filter((t) =>
      t.testType === "CONCENTRATION" && (t.testName?.toLowerCase().includes("obligor") || t.testName?.toLowerCase().includes("single"))
    );
    if (maxObligorPct > 0 && obligorTests.length > 0) {
      const obligorLimit = obligorTests[0].triggerLevel ?? obligorTests[0].thresholdLevel;
      if (obligorLimit != null) {
        const status = maxObligorPct <= obligorLimit ? "pass" : "fail";
        checks.push({
          name: "single_obligor_concentration",
          status,
          expected: obligorLimit,
          actual: maxObligorPct,
          discrepancy: Math.round((maxObligorPct - obligorLimit) * 100) / 100,
          message: status === "pass"
            ? `Largest obligor exposure (${maxObligorPct.toFixed(1)}%) within limit (${obligorLimit}%)`
            : `Largest obligor exposure (${maxObligorPct.toFixed(1)}%) exceeds limit (${obligorLimit}%)`,
        });
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  } else {
    skipped += 2;
  }

  // ─── Internal Consistency (within Pass 1) ───

  if (tests && tests.length > 0) {
    // Check 10 & 11: OC test math + Cushion math
    // Run across all tests that have the necessary fields
    let ocCheckRan = false;
    let cushionCheckRan = false;
    let ocFailures = 0;
    let ocTotal = 0;
    let cushionFailures = 0;
    let cushionTotal = 0;

    for (const t of tests) {
      // OC test: numerator / denominator * 100 ≈ actualValue
      if (t.numerator != null && t.denominator != null && t.denominator !== 0 && t.actualValue != null) {
        ocCheckRan = true;
        ocTotal++;
        const calculated = (t.numerator / t.denominator) * 100;
        if (absDiff(calculated, t.actualValue) > 0.1) {
          ocFailures++;
        }
      }

      // Cushion: actualValue - triggerLevel ≈ cushionPct
      if (t.actualValue != null && t.triggerLevel != null && t.cushionPct != null) {
        cushionCheckRan = true;
        cushionTotal++;
        const calculated = t.actualValue - t.triggerLevel;
        if (absDiff(calculated, t.cushionPct) > 0.1) {
          cushionFailures++;
        }
      }
    }

    if (ocCheckRan) {
      const status = ocFailures === 0 ? "pass" : ocFailures <= 1 ? "warn" : "fail";
      checks.push({
        name: "oc_test_math",
        status,
        expected: 0,
        actual: ocFailures,
        discrepancy: ocFailures,
        message: ocFailures === 0
          ? `OC test math consistent across ${ocTotal} tests`
          : `${ocFailures}/${ocTotal} OC tests have numerator/denominator ≠ actualValue`,
      });
    } else {
      skipped++;
    }

    if (cushionCheckRan) {
      const status = cushionFailures === 0 ? "pass" : cushionFailures <= 1 ? "warn" : "fail";
      checks.push({
        name: "cushion_math",
        status,
        expected: 0,
        actual: cushionFailures,
        discrepancy: cushionFailures,
        message: cushionFailures === 0
          ? `Cushion math consistent across ${cushionTotal} tests`
          : `${cushionFailures}/${cushionTotal} tests have actualValue - triggerLevel ≠ cushionPct`,
      });
    } else {
      skipped++;
    }
  } else {
    skipped += 2;
  }

  // ─── Compute Score ───

  const passed = checks.filter((c) => c.status === "pass").length;

  return {
    checks,
    score: passed,
    totalChecks: 11,
    checksRun: checks.length,
    checksSkipped: skipped,
  };
}
```

**Key design notes:**
- `Pass1Output`, `Pass2Output`, `Pass3Output` are already exported from `schemas.ts`
- CCC rating set covers Moody's (Caa1-C), S&P (CCC+ through D/SD), and Fitch (CCC through RD)
- `check()` helper returns null when either side has no data → counted as skipped
- Checks 10/11 aggregate across all compliance tests (not per-test pass/fail)
- Pure function: no DB queries, no side effects

**Step 2: Verify types compile**

```bash
cd web && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/validator.ts
git commit -m "feat(clo): add cross-validation engine for extraction data"
```

---

### Task 3: Integrate validator into extraction runner

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts` (lines 298-320)

**Step 1: Add validator import and call**

At the top of `runner.ts`, add:

```typescript
import { validateExtraction } from "./validator";
```

After the final status determination block (line 303 in current code) and before the UPDATE query (line 306), add the validation call:

```typescript
  // Run cross-validation
  const pass2Data = p2?.data as unknown as import("./schemas").Pass2Output | null;
  const pass3Data = p3?.data as unknown as import("./schemas").Pass3Output | null;
  const validationResult = validateExtraction(pass1Data, pass2Data ?? null, pass3Data ?? null);
```

Then modify the UPDATE query to include `data_quality`:

Change the existing UPDATE (lines 306-320) to:

```typescript
  await query(
    `UPDATE clo_report_periods
     SET extraction_status = $1,
         extracted_at = now(),
         raw_extraction = $2::jsonb,
         supplementary_data = $3::jsonb,
         data_quality = $4::jsonb,
         updated_at = now()
     WHERE id = $5`,
    [
      status,
      JSON.stringify(rawOutputs),
      supplementaryData ? JSON.stringify(supplementaryData) : null,
      JSON.stringify(validationResult),
      reportPeriodId,
    ],
  );
```

**Step 2: Verify types compile**

```bash
cd web && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/runner.ts
git commit -m "feat(clo): run cross-validation after extraction and store results"
```

---

### Task 4: Update types and access layer

**Files:**
- Modify: `web/lib/clo/types.ts` (line ~338, CloReportPeriod interface)
- Modify: `web/lib/clo/access.ts` (line ~219, rowToReportPeriod)

**Step 1: Add dataQuality to CloReportPeriod type**

In `web/lib/clo/types.ts`, add to the `CloReportPeriod` interface before `createdAt`:

```typescript
  dataQuality: DataQuality | null;
```

And add the `DataQuality` type before the interface (or near the other CLO types):

```typescript
export interface DataQualityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  expected: number | null;
  actual: number | null;
  discrepancy: number | null;
  message: string;
}

export interface DataQuality {
  checks: DataQualityCheck[];
  score: number;
  totalChecks: number;
  checksRun: number;
  checksSkipped: number;
}
```

**Step 2: Update rowToReportPeriod in access.ts**

In `web/lib/clo/access.ts`, add to `rowToReportPeriod` (after `supplementaryData` line 219):

```typescript
    dataQuality: (row.data_quality as DataQuality) ?? null,
```

And add the import at the top of `access.ts` (update the existing import from `./types`):

```typescript
import type { DataQuality } from "./types";
```

(Or add `DataQuality` to the existing import if there's already one from `./types`.)

**Step 3: Verify types compile**

```bash
cd web && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add web/lib/clo/types.ts web/lib/clo/access.ts
git commit -m "feat(clo): expose data_quality in CloReportPeriod type and access layer"
```

---

### Task 5: Create DataQualityBadge dashboard component

**Files:**
- Create: `web/app/clo/DataQualityBadge.tsx`
- Modify: `web/app/clo/page.tsx` (line ~798, Portfolio State section)

**Step 1: Create DataQualityBadge.tsx**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { DataQuality } from "@/lib/clo/types";

export default function DataQualityBadge({ dataQuality }: { dataQuality: DataQuality | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!dataQuality || dataQuality.checksRun === 0) return null;

  const { score, checksRun, checks } = dataQuality;
  const ratio = checksRun > 0 ? score / checksRun : 0;

  const hasFailures = checks.some((c) => c.status === "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");

  const color = hasFailures
    ? "var(--color-error, #ef4444)"
    : hasWarnings
      ? "var(--color-warning, #eab308)"
      : "var(--color-success, #22c55e)";

  const label = hasFailures
    ? "Data Issues"
    : hasWarnings
      ? "Data Issues"
      : "Data Verified";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.2rem 0.5rem",
          fontSize: "0.75rem",
          fontWeight: 600,
          color,
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
        }}
      >
        <span style={{
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }} />
        {label} ({score}/{checksRun})
      </button>

      {expanded && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          zIndex: 10,
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "0.75rem",
          minWidth: "320px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
            Cross-validation: {score} of {checksRun} checks passed
            {dataQuality.checksSkipped > 0 && ` (${dataQuality.checksSkipped} skipped — insufficient data)`}
          </div>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {checks.map((c) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0",
                }}
              >
                <span style={{
                  width: "0.45rem",
                  height: "0.45rem",
                  borderRadius: "50%",
                  background: c.status === "pass"
                    ? "var(--color-success, #22c55e)"
                    : c.status === "warn"
                      ? "var(--color-warning, #eab308)"
                      : "var(--color-error, #ef4444)",
                  flexShrink: 0,
                }} />
                <span style={{ color: "var(--color-text)" }}>{c.message}</span>
              </div>
            ))}
          </div>
          {hasFailures && (
            <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--color-border)", fontSize: "0.75rem" }}>
              <Link href="/clo/context" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                Edit extracted data →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Integrate into page.tsx**

In `web/app/clo/page.tsx`:

1. Add import near the top (after other component imports):
```typescript
import DataQualityBadge from "./DataQualityBadge";
```

2. In the Portfolio State section header (around line 789-799), add the badge. The current code has:
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <h2 ...>Portfolio State ...</h2>
  <UpdateComplianceReport hasPortfolio={hasPortfolioData} />
</div>
```

Change to wrap the right side with a flex container:
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <h2 style={{ margin: 0 }}>
    Portfolio State
    {reportDate && (
      <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
        as of {reportDate}
      </span>
    )}
  </h2>
  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
    <DataQualityBadge dataQuality={reportPeriod?.dataQuality ?? null} />
    <UpdateComplianceReport hasPortfolio={hasPortfolioData} />
  </div>
</div>
```

**Step 3: Verify types compile**

```bash
cd web && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add web/app/clo/DataQualityBadge.tsx web/app/clo/page.tsx
git commit -m "feat(clo): add data quality badge to dashboard"
```

---

### Task 6: Migrate to structured output (tool_use API)

**Files:**
- Modify: `web/lib/clo/api.ts` (lines 27-60, callAnthropic function)
- Modify: `web/lib/clo/extraction/runner.ts` (lines 8-50, callClaude function)
- Add dependency: `zod-to-json-schema`

This is the most significant change. We switch from "generate JSON text" → "parse JSON from text" to "call a tool with structured input" → "extract tool input directly."

**Step 1: Install zod-to-json-schema**

```bash
cd web && npm install zod-to-json-schema
```

**Step 2: Add callAnthropicWithTool to api.ts**

Add a new function alongside the existing `callAnthropic` (keep the old one for backwards compatibility with PPM extraction which uses the worker). Add after line 60:

```typescript
export async function callAnthropicWithTool(
  apiKey: string,
  system: string,
  content: Array<Record<string, unknown>>,
  maxTokens: number,
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
): Promise<{ data: Record<string, unknown> | null; truncated: boolean; error?: string; status?: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      tools: [{
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!response.ok) {
    return { data: null, truncated: false, error: await response.text(), status: response.status };
  }

  const result = await response.json();
  const toolUseBlock = result.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    // Fallback: try text extraction (shouldn't happen with tool_choice forced)
    const text = result.content
      ?.filter((block: AnthropicBlock) => block.type === "text")
      ?.map((block: AnthropicBlock) => block.text)
      ?.join("\n") || "";
    return { data: text ? parseJsonResponse(text) : null, truncated: result.stop_reason !== "end_turn" };
  }

  return {
    data: toolUseBlock.input as Record<string, unknown>,
    truncated: result.stop_reason !== "end_turn",
  };
}
```

**Step 3: Add callAnthropicChunkedWithTool to api.ts**

Add a chunked version that mirrors `callAnthropicChunked` but uses `callAnthropicWithTool`:

```typescript
export async function callAnthropicChunkedWithTool(
  apiKey: string,
  system: string,
  documents: CloDocument[],
  userText: string,
  maxTokens: number,
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
): Promise<{ results: { data: Record<string, unknown> | null; truncated: boolean; chunkLabel: string }[]; error?: string; status?: number }> {
  const chunkSets = await chunkDocuments(documents);

  if (chunkSets.length === 1) {
    const content = buildDocumentContent(chunkSets[0].documents, userText);
    const result = await callAnthropicWithTool(apiKey, system, content, maxTokens, tool);
    if (result.error && result.error.includes("prompt is too long")) {
      return callAnthropicChunkedWithToolLimit(apiKey, system, documents, userText, maxTokens, tool, Math.floor(MAX_PDF_PAGES / 2));
    }
    if (result.error) return { results: [], error: result.error, status: result.status };
    return { results: [{ data: result.data, truncated: result.truncated, chunkLabel: chunkSets[0].chunkLabel }] };
  }

  const chunkResults = await Promise.all(
    chunkSets.map(async (chunkSet) => {
      const chunkUserText = `[NOTE: This document has been split due to size. You are viewing ${chunkSet.chunkLabel}. Extract all information from these pages.]\n\n${userText}`;
      const content = buildDocumentContent(chunkSet.documents, chunkUserText);
      const result = await callAnthropicWithTool(apiKey, system, content, maxTokens, tool);
      return { ...result, chunkLabel: chunkSet.chunkLabel };
    }),
  );

  const promptTooLong = chunkResults.some((r) => r.error?.includes("prompt is too long"));
  if (promptTooLong) {
    return callAnthropicChunkedWithToolLimit(apiKey, system, documents, userText, maxTokens, tool, Math.floor(MAX_PDF_PAGES / 2));
  }

  const firstError = chunkResults.find((r) => r.error);
  if (firstError && chunkResults.every((r) => r.error)) {
    return { results: [], error: firstError.error, status: firstError.status };
  }

  return {
    results: chunkResults
      .filter((r) => !r.error)
      .map((r) => ({ data: r.data, truncated: r.truncated, chunkLabel: r.chunkLabel })),
  };
}

async function callAnthropicChunkedWithToolLimit(
  apiKey: string,
  system: string,
  documents: CloDocument[],
  userText: string,
  maxTokens: number,
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
  pageLimit: number,
): Promise<{ results: { data: Record<string, unknown> | null; truncated: boolean; chunkLabel: string }[]; error?: string; status?: number }> {
  console.log(`[callAnthropicChunkedWithTool] Retrying with reduced page limit: ${pageLimit}`);
  const chunkSets = await chunkDocuments(documents, pageLimit);

  const chunkResults = await Promise.all(
    chunkSets.map(async (chunkSet) => {
      const chunkUserText = chunkSets.length > 1
        ? `[NOTE: This document has been split due to size. You are viewing ${chunkSet.chunkLabel}. Extract all information from these pages.]\n\n${userText}`
        : userText;
      const content = buildDocumentContent(chunkSet.documents, chunkUserText);
      const result = await callAnthropicWithTool(apiKey, system, content, maxTokens, tool);
      return { ...result, chunkLabel: chunkSet.chunkLabel };
    }),
  );

  const firstError = chunkResults.find((r) => r.error);
  if (firstError && chunkResults.every((r) => r.error)) {
    return { results: [], error: firstError.error, status: firstError.status };
  }

  return {
    results: chunkResults
      .filter((r) => !r.error)
      .map((r) => ({ data: r.data, truncated: r.truncated, chunkLabel: r.chunkLabel })),
  };
}
```

**Step 4: Update callClaude in runner.ts to use tool_use**

In `runner.ts`, rewrite `callClaude` to use structured tool output:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { callAnthropicChunkedWithTool } from "../api";

async function callClaudeStructured(
  apiKey: string,
  system: string,
  documents: CloDocument[],
  userText: string,
  maxTokens: number,
  schema: ZodTypeAny,
  toolName: string,
): Promise<{ data: Record<string, unknown> | null; truncated: boolean; error?: string; status?: number }> {
  const inputSchema = zodToJsonSchema(schema, { target: "openApi3" }) as Record<string, unknown>;

  const tool = {
    name: toolName,
    description: `Extract structured data from the document. Return all fields matching the schema.`,
    inputSchema,
  };

  const chunked = await callAnthropicChunkedWithTool(apiKey, system, documents, userText, maxTokens, tool);

  if (chunked.error) {
    return { data: null, truncated: false, error: chunked.error, status: chunked.status };
  }

  if (chunked.results.length === 1) {
    return { data: chunked.results[0].data, truncated: chunked.results[0].truncated };
  }

  // Multi-chunk: merge structured results
  let merged: Record<string, unknown> = {};
  for (const result of chunked.results) {
    if (!result.data) continue;
    if (Object.keys(merged).length === 0) {
      merged = result.data;
    } else {
      for (const [key, val] of Object.entries(result.data)) {
        if (val == null) continue;
        const baseVal = merged[key];
        if (Array.isArray(val) && Array.isArray(baseVal)) {
          merged[key] = [...baseVal, ...val];
        } else if (merged[key] == null) {
          merged[key] = val;
        }
      }
    }
  }

  const anyTruncated = chunked.results.some((r) => r.truncated);
  return { data: merged, truncated: anyTruncated };
}
```

Then update each pass call in `runExtraction` to use `callClaudeStructured`:

**Pass 1** (replace lines 116-128):
```typescript
  const p1Result = await callClaudeStructured(apiKey, p1Prompt.system, documents, p1Prompt.user, 8192, pass1Schema, "extract_pass1");

  if (p1Result.error) {
    throw new Error(`Pass 1 API error: ${p1Result.error}`);
  }

  let pass1Data;
  try {
    pass1Data = pass1Schema.parse(p1Result.data);
  } catch (e) {
    throw new Error(`Pass 1 validate error: ${(e as Error).message}`);
  }
```

Update `rawOutputs` to store the structured data (not text):
```typescript
  const rawOutputs: Record<string, unknown> = { pass1: p1Result.data };
```

**Passes 2-5** (replace lines 182-187):
```typescript
  const [p2Result, p3Result, p4Result, p5Result] = await Promise.all([
    callClaudeStructured(apiKey, pass2Prompt(reportDate).system, documents, pass2Prompt(reportDate).user, 32768, pass2Schema, "extract_pass2"),
    callClaudeStructured(apiKey, pass3Prompt(reportDate).system, documents, pass3Prompt(reportDate).user, 8192, pass3Schema, "extract_pass3"),
    callClaudeStructured(apiKey, pass4Prompt(reportDate).system, documents, pass4Prompt(reportDate).user, 8192, pass4Schema, "extract_pass4"),
    callClaudeStructured(apiKey, pass5Prompt(reportDate).system, documents, pass5Prompt(reportDate).user, 8192, pass5Schema, "extract_pass5"),
  ]);
```

Update the pass processing loop (replace lines 189-223) to work with `.data` instead of `.text`:
```typescript
  const passInputs = [
    { num: 2, result: p2Result, schema: pass2Schema },
    { num: 3, result: p3Result, schema: pass3Schema },
    { num: 4, result: p4Result, schema: pass4Schema },
    { num: 5, result: p5Result, schema: pass5Schema },
  ];

  for (const { num, result, schema } of passInputs) {
    rawOutputs[`pass${num}`] = result.data;
    if (result.error) {
      passResults.push({ pass: num, data: null, truncated: false, error: result.error, raw: JSON.stringify(result.data) });
      continue;
    }
    try {
      const validated = schema.parse(result.data);
      passResults.push({ pass: num, data: validated as Record<string, unknown>, truncated: result.truncated, raw: JSON.stringify(result.data) });

      // Collect overflow
      const overflow = (validated as Record<string, unknown[]>)._overflow;
      if (Array.isArray(overflow) && overflow.length > 0) {
        for (const item of overflow as Array<{ label: string; content: unknown }>) {
          overflowRows.push({
            report_period_id: reportPeriodId,
            extraction_pass: num,
            source_section: `pass${num}`,
            label: item.label,
            content: JSON.stringify(item.content),
          });
        }
      }
    } catch (e) {
      passResults.push({ pass: num, data: null, truncated: result.truncated, error: (e as Error).message, raw: JSON.stringify(result.data) });
    }
  }
```

**Step 5: Remove old callClaude and parseJsonResponse import**

In `runner.ts`:
- Remove the old `callClaude` function (lines 8-50)
- Remove `parseJsonResponse` from the imports on line 3 (keep `buildDocumentContent`, `normalizeClassName`)
- Update import to include `callAnthropicChunkedWithTool`:

```typescript
import { callAnthropicChunkedWithTool, normalizeClassName } from "../api";
```

**Step 6: Verify types compile**

```bash
cd web && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add web/lib/clo/api.ts web/lib/clo/extraction/runner.ts package.json package-lock.json
git commit -m "feat(clo): migrate extraction to structured output (tool_use API)"
```

---

### Task 7: Final verification

**Step 1: Full type check**

```bash
cd web && npx tsc --noEmit
```

**Step 2: Run dev server and verify dashboard loads**

```bash
cd web && npm run dev
```

Navigate to `/clo` — the dashboard should load with:
- "Update Report" button in Portfolio State header
- DataQualityBadge next to it (will be empty until next extraction)
- All existing data still displays correctly

**Step 3: Run migration on dev database**

```bash
cd web && npx tsx lib/migrate.ts
```

**Step 4: Test extraction (manual)**

Upload a compliance PDF via "Update Report" and verify:
- Extraction completes without errors
- `data_quality` column populated on `clo_report_periods`
- DataQualityBadge shows check results on dashboard

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(clo): final adjustments for extraction cross-validation"
```
