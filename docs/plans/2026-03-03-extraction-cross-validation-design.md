# Extraction Cross-Validation Design

## Problem

CLO data extraction runs 5 passes over compliance PDFs, producing pool summaries, holdings, compliance tests, concentrations, etc. Currently there's no way to know if the extracted data is correct. False data in financial contexts is dangerous — a wrong OC ratio or misreported par total could lead to bad decisions.

## Solution

Two changes:
1. **Cross-validation engine** — deterministic mathematical checks comparing data across extraction passes
2. **Structured output migration** — switch from raw JSON extraction to Claude's tool_use API for guaranteed schema compliance

## Cross-Validation Checks

11 checks run after all 5 extraction passes complete:

### Pool-Level (Pass 1 pool summary vs Pass 2 holdings)

| # | Check | Expected | Actual | Tolerance |
|---|-------|----------|--------|-----------|
| 1 | Total Par | `poolSummary.totalPar` | `sum(holdings.parBalance)` | ±2% |
| 2 | Obligor Count | `poolSummary.numberOfObligors` | `count(distinct holdings.obligorName)` | ±2 |
| 3 | Asset Count | `poolSummary.numberOfAssets` | `count(holdings)` | ±1 |
| 4 | WA Spread | `poolSummary.wacSpread` | weighted avg `holdings.spreadBps` by par | ±10bps |
| 5 | Fixed Rate % | `poolSummary.pctFixedRate` | `sum(par where isFixedRate) / totalPar * 100` | ±1% |
| 6 | CCC % | `poolSummary.pctCccAndBelow` | `sum(par where rating <= CCC) / totalPar * 100` | ±1% |
| 7 | Defaulted % | `poolSummary.pctDefaulted` | `sum(par where isDefaulted) / totalPar * 100` | ±0.5% |

### Compliance Test Consistency (Pass 1 vs Pass 3)

| # | Check | Description | Tolerance |
|---|-------|-------------|-----------|
| 8 | Industry concentration | Largest industry bucket from concentrations ≤ any industry concentration test limit | Exact |
| 9 | Single obligor | Largest single obligor from concentrations vs single obligor test limit | Exact |

### Internal Consistency (within Pass 1)

| # | Check | Description | Tolerance |
|---|-------|-------------|-----------|
| 10 | OC test math | `numerator / denominator * 100` ≈ `actualValue` | ±0.1% |
| 11 | Cushion math | `actualValue - triggerLevel` ≈ `cushionPct` | ±0.1% |

Each check produces: `{ name, status: "pass" | "warn" | "fail", expected, actual, discrepancy, message }`.

Checks only run when both sides of the comparison have data. Missing data = check skipped (not failed).

## Structured Output Migration

Switch `callClaude()` from raw message responses to tool_use:
- Each pass's schema becomes a tool definition
- Claude returns structured tool call arguments instead of raw JSON
- Eliminates: JSON parse failures, type mismatches, fields outside schema
- Existing Zod schemas in `schemas.ts` reused as tool definitions

## Storage

Add `data_quality JSONB` column to `clo_report_periods`:

```json
{
  "checks": [
    { "name": "total_par_match", "status": "pass", "expected": 500000000, "actual": 499850000, "discrepancy": 0.03, "message": "Total par matches within 0.03%" },
    { "name": "obligor_count", "status": "warn", "expected": 150, "actual": 147, "discrepancy": 2, "message": "Obligor count off by 3" }
  ],
  "score": 9,
  "totalChecks": 11,
  "checksRun": 11,
  "checksSkipped": 0
}
```

Runs automatically at end of every extraction — including re-extractions triggered by UpdateComplianceReport.

## Dashboard UX

In the Portfolio State section header, next to "Update Report" button:

- **Green** (90%+ pass): "Data Verified" small text
- **Yellow** (some warnings): "Data Issues" badge, expandable to show warnings
- **Red** (critical failures): "Data Issues" badge prominently, each failed check shows description + link to `/clo/context` to edit or "Update Report" to re-extract

Data is always displayed regardless of quality score — just flagged when issues exist.

## User Actions on Failure

1. **Re-extract**: Upload new/better PDF via "Update Report"
2. **Edit manually**: Go to `/clo/context` to fix specific values
3. **Ignore**: Data shown with visual warning

## Relationship to Waterfall DataQualityCheck

| | This System | Waterfall DataQualityCheck |
|---|---|---|
| When | Extraction time | Waterfall page load |
| Where | Main dashboard | Waterfall page |
| Type | Deterministic math checks | AI-powered semantic checks |
| Purpose | Verify extraction accuracy | Verify waterfall model readiness |
| Storage | `data_quality` column | Session-cached |

No overlap — complementary systems.

## Files

| File | Action |
|------|--------|
| `web/lib/clo/extraction/validator.ts` | Create — cross-validation logic |
| `web/lib/clo/extraction/runner.ts` | Edit — call validator, switch to tool_use |
| `web/lib/clo/extraction/prompts.ts` | Edit — convert schemas to tool definitions |
| `web/lib/clo/extraction/schemas.ts` | Edit — ensure schemas work as tool defs |
| `web/lib/schema.sql` | Edit — add data_quality column to clo_report_periods |
| `web/lib/clo/access.ts` | Edit — expose data_quality in queries |
| `web/app/clo/page.tsx` | Edit — add DataQualityBadge component |
| `web/app/clo/DataQualityBadge.tsx` | Create — quality indicator component |
