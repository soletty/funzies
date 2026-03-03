# CLO Extraction Architecture Redesign

**Date:** 2026-03-03
**Status:** Approved

## Problem

The current extraction pipeline produces non-deterministic results from the same PDF. Running extraction multiple times yields different subsets of data — missing holdings, missing concentrations, missing tranche spreads, null account balances. The data IS in the documents (Claude can find it when asked specifically), but bulk extraction with massive schemas causes attention degradation and random field omissions.

## Root Cause

Each extraction pass tries to extract too many fields at once from the entire document. A single pass attempts 50-100+ fields across 40+ pages. LLM attention degrades with output complexity, causing non-deterministic omissions.

## Solution: Section-First + Text-First Hybrid (A+C)

Replace the current 3-pass (PPM) and 5-pass (compliance report) pipelines with a 4-phase architecture that maps document sections, transcribes each to clean text, then extracts focused data per section.

## Architecture

```
PDF Upload
    |
    v
Phase 1: DOCUMENT MAPPING (1 API call)
  Claude reads full PDF -> returns section index with page ranges
    |
    v
Phase 2: TEXT EXTRACTION (N parallel API calls)
  For each section, send those pages -> get clean markdown transcription
    |
    v
Phase 3: DATA EXTRACTION (N parallel API calls)
  For each text section, extract structured data with focused schema (tool use)
    |
    v
Phase 4: VALIDATION & TARGETED REPAIR (1-3 API calls)
  Cross-validate across sections, run targeted gap-filling queries
```

**Properties:**
- Phase 2 & 3 calls are independent and parallel
- Each Phase 3 call has a small, focused schema (5-20 fields) instead of 100+
- Phase 4 only fires if validation detects gaps
- Total: ~25 API calls per document, each simple and reliable

## Phase 1: Document Mapping

Read full PDF and produce structured table of contents identifying sections and page ranges.

### Compliance Report Sections (all required)

| Section Type | Description |
|---|---|
| `compliance_summary` | Deal info, tranche table, summary metrics |
| `par_value_tests` | OC par value test calculations |
| `interest_coverage_tests` | IC test calculations |
| `asset_schedule` | Full holdings table(s), may span many pages |
| `concentration_tables` | Industry, country, rating, obligor distributions |
| `waterfall` | Interest and principal payment waterfall |
| `trading_activity` | Purchases, sales, trading summary |
| `interest_accrual` | Asset-level interest rate details |
| `account_balances` | Reserve/collection account balances |
| `supplementary` | Fees, hedges, FX, regulatory, events |

### PPM Sections (required)

| Section Type | Description |
|---|---|
| `transaction_overview` | Deal summary, tranche terms table |
| `capital_structure` | Note classes, ratings, amounts, spreads |
| `coverage_tests` | OC/IC test definitions and triggers |
| `eligibility_criteria` | Collateral eligibility rules |
| `portfolio_constraints` | Concentration limits, quality tests |
| `waterfall_rules` | Interest/principal payment priority |
| `fees_and_expenses` | Manager/trustee/servicer fees |
| `key_dates` | Closing, maturity, non-call, reinvestment period |
| `key_parties` | Manager, trustee, administrator |
| `redemption` | Call/prepayment mechanics |
| `hedging` | Currency/rate hedge requirements |

### PPM Sections Dropped (moderate trim)

- Transfer restrictions (who can buy)
- Tax treatment (FATCA/CRS/withholding)
- Risk factors (generic disclosures)
- Voting and control mechanics
- Legal protections
- Risk retention (Dodd-Frank/EU RR)
- Refinancing history
- Additional issuance conditions

### Phase 1 Output Schema

```typescript
{
  documentType: "compliance_report" | "ppm",
  sections: Array<{
    sectionType: string,
    pageStart: number,
    pageEnd: number,
    confidence: "high" | "medium" | "low",
    notes?: string
  }>
}
```

## Phase 2: Text Extraction (PDF -> Markdown)

For each section from Phase 1, send only that section's pages to Claude and get a clean markdown transcription.

**Prompt:** "Transcribe this section into clean markdown. Preserve all numbers exactly. Render tables as markdown tables. Keep all headers and labels."

**Special handling for asset schedules:** Multi-table asset sections (Asset Info I, II, III) should be merged into a single unified table with one row per asset.

**Model:** Sonnet (transcription task, not analytical)
**Token budget:** No max_tokens constraint — want complete transcription
**Parallelism:** All sections transcribed concurrently

## Phase 3: Structured Data Extraction

For each section's markdown text, extract structured data using Anthropic tool use with a small, focused schema.

### Key Principle

Each extraction call has 5-20 fields (not 100+). This keeps Claude's attention focused and dramatically improves reliability.

### Section Schema Sizes

| Section | Approx Fields |
|---|---|
| `compliance_summary` | ~15 (tranche table, pool metrics, deal identity) |
| `par_value_tests` | ~10 (OC test calculations, numerator breakdown) |
| `interest_coverage_tests` | ~10 (IC test calculations, interest per tranche) |
| `asset_schedule` | ~35 per holding (obligor, par, spread, ratings, maturity, flags) |
| `concentration_tables` | ~8 per bucket (type, actual, limit, passing) |
| `waterfall` | ~10 per step (priority, payee, amount, shortfall) |
| `trading_activity` | ~12 per trade + summary metrics |
| `interest_accrual` | ~8 per asset (rate decomposition) |
| `account_balances` | ~4 per account (name, required, actual) |
| `supplementary` | ~20 total (fees, hedges, FX, events) |

### Holdings Extraction Instructions

Since asset_schedule is the largest section (100-250+ rows):
- "Extract EVERY row. Do not summarize or skip any holdings."
- "If there are N rows visible in the table, your output must have exactly N entries."
- Phase 2 already merged multi-table assets, so Phase 3 reads a single clean table

**Model:** Sonnet with tool use (forced schema compliance)
**Parallelism:** All sections extracted concurrently

## Phase 4: Validation & Targeted Repair

### Step 4a: Automated Cross-Validation

| Check | Comparison | Threshold |
|---|---|---|
| Holdings count | `holdings.length` vs `compliance_summary.numberOfAssets` | +/- 2 |
| Total par | `sum(holdings.parBalance)` vs `compliance_summary.aggregatePrincipalBalance` | +/- 1% |
| Tranche count | `compliance_summary.tranches.length` vs waterfall tranche steps | Match |
| WAC spread | Weighted avg of holdings spreads vs `compliance_summary.wacSpread` | +/- 5% |
| Concentration totals | Sum of concentration bucket percentages | ~100% +/- 2% |
| Required fields | Every required section produced non-empty output | All present |
| Null density | Flag if >30% of fields in any section are null | Warning |

### Step 4b: Targeted Gap-Filling

For each validation failure, construct a specific repair query targeting only the gap:
- **Missing holdings:** Send asset schedule PDF pages + list of extracted holdings + "find the missing ones"
- **Par mismatch:** "Total par from holdings is $380M but summary says $396M. Which holdings have incorrect par?"
- **Missing section:** Re-run Phase 2+3 for that section with full PDF (maybe on unexpected pages)

Key: never re-extract everything — only target the specific gap.

### Step 4c: Completeness Scoring

```typescript
{
  overallScore: number,       // 0-100
  sectionScores: Record<string, number>,
  validationChecks: Array<{
    check: string,
    passed: boolean,
    details: string
  }>,
  repairsAttempted: number,
  repairsSuccessful: number
}
```

## Migration Strategy

- New pipeline replaces existing extraction logic in `lib/clo/extraction/`
- Database schema unchanged — normalizer maps new section outputs to existing tables
- Worker pattern unchanged — just calls new pipeline instead of old
- Can be rolled out per-pipeline (compliance report first, then PPM)

## Cost & Performance

- ~25 API calls per document (vs current 5), but each call is smaller and cheaper
- Estimated 2-3x current cost per extraction
- Estimated 5-10 minutes per document (parallelism helps)
- Dramatically improved reliability — each call has a focused, achievable task
