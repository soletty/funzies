# Extraction Architecture Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current 5-pass compliance report and 3-pass PPM extraction pipelines with a 4-phase section-first + text-first architecture that produces consistent, complete data on every run.

**Architecture:** PDF → Phase 1 (map sections & page ranges) → Phase 2 (transcribe each section to markdown) → Phase 3 (extract structured data per section with focused schemas) → Phase 4 (cross-validate & targeted repair). Phases 2 & 3 run all sections in parallel.

**Tech Stack:** TypeScript, Anthropic Messages API (claude-sonnet-4-20250514), Zod v4 schemas, PostgreSQL, pdf-lib for page splitting.

**Design doc:** `docs/plans/2026-03-03-extraction-architecture-redesign.md`

---

### Task 1: Add page-range PDF extraction to API layer

**Files:**
- Modify: `web/lib/clo/api.ts`
- Modify: `web/lib/clo/pdf-chunking.ts`

We need the ability to send specific page ranges of a PDF to Claude, not just the whole document or auto-chunked splits. This is foundational — Phase 2 sends only the pages for each section.

**Step 1: Add `extractPdfPages` function to `pdf-chunking.ts`**

Add after the existing `splitPdf` function (after line ~46). Uses pdf-lib to extract a page range from a base64 PDF and return a new base64 PDF:

```typescript
export async function extractPdfPages(
  base64: string,
  pageStart: number,
  pageEnd: number,
): Promise<string> {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(Buffer.from(base64, "base64"));
  const destDoc = await PDFDocument.create();
  const totalPages = srcDoc.getPageCount();
  const start = Math.max(0, pageStart - 1); // 1-indexed to 0-indexed
  const end = Math.min(totalPages, pageEnd);
  const indices = Array.from({ length: end - start }, (_, i) => start + i);
  const pages = await destDoc.copyPages(srcDoc, indices);
  pages.forEach((p) => destDoc.addPage(p));
  const bytes = await destDoc.save();
  return Buffer.from(bytes).toString("base64");
}
```

**Step 2: Add `callAnthropicText` function to `api.ts`**

Phase 2 needs a simple text response (no tool use) for transcription. Add after the existing `callAnthropic` function (after line ~60). This is similar to `callAnthropic` but takes `CloDocument[]` directly and returns just the text:

```typescript
export async function callAnthropicForText(
  apiKey: string,
  system: string,
  documents: CloDocument[],
  userText: string,
  maxTokens: number,
): Promise<{ text: string; truncated: boolean; error?: string; status?: number }> {
  const content = buildDocumentContent(documents, userText);
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
    }),
  });

  if (!response.ok) {
    return { text: "", truncated: false, error: await response.text(), status: response.status };
  }

  const result = await response.json();
  const text = result.content
    ?.filter((block: { type: string }) => block.type === "text")
    ?.map((block: { type: string; text?: string }) => block.text)
    ?.join("\n") || "";
  return { text, truncated: result.stop_reason !== "end_turn" };
}
```

**Step 3: Add `callAnthropicWithToolForPages` to `api.ts`**

Convenience function that extracts page range from PDF, then calls tool API:

```typescript
export async function callAnthropicWithToolForPages(
  apiKey: string,
  system: string,
  document: CloDocument,
  pageStart: number,
  pageEnd: number,
  userText: string,
  maxTokens: number,
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
): Promise<{ data: Record<string, unknown> | null; truncated: boolean; error?: string; status?: number }> {
  const { extractPdfPages } = await import("./pdf-chunking");
  const pageBase64 = await extractPdfPages(document.base64, pageStart, pageEnd);
  const pageDoc: CloDocument = { ...document, base64: pageBase64 };
  const content = buildDocumentContent([pageDoc], userText);
  return callAnthropicWithTool(apiKey, system, content, maxTokens, tool);
}
```

**Step 4: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new functions.

**Step 5: Commit**

```bash
git add web/lib/clo/api.ts web/lib/clo/pdf-chunking.ts
git commit -m "feat(clo): add page-range PDF extraction and text API helpers"
```

---

### Task 2: Create document mapper (Phase 1)

**Files:**
- Create: `web/lib/clo/extraction/document-mapper.ts`

Phase 1 reads the full PDF and returns a structured section index with page ranges.

**Step 1: Create the document mapper module**

Create `web/lib/clo/extraction/document-mapper.ts`:

```typescript
import type { CloDocument } from "../types";
import { callAnthropicWithTool, buildDocumentContent } from "../api";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

// Re-use the zodToToolSchema from runner.ts — we'll extract it to a shared util in Task 6
// For now, inline it here (will be deduplicated later)

const COMPLIANCE_SECTION_TYPES = [
  "compliance_summary",
  "par_value_tests",
  "interest_coverage_tests",
  "asset_schedule",
  "concentration_tables",
  "waterfall",
  "trading_activity",
  "interest_accrual",
  "account_balances",
  "supplementary",
] as const;

const PPM_SECTION_TYPES = [
  "transaction_overview",
  "capital_structure",
  "coverage_tests",
  "eligibility_criteria",
  "portfolio_constraints",
  "waterfall_rules",
  "fees_and_expenses",
  "key_dates",
  "key_parties",
  "redemption",
  "hedging",
] as const;

const sectionSchema = z.object({
  sectionType: z.string(),
  pageStart: z.number(),
  pageEnd: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().optional(),
});

const documentMapSchema = z.object({
  documentType: z.enum(["compliance_report", "ppm"]),
  sections: z.array(sectionSchema),
});

export type DocumentMap = z.infer<typeof documentMapSchema>;
export type SectionEntry = z.infer<typeof sectionSchema>;

function mapperPrompt(): { system: string; user: string } {
  return {
    system: `You are a CLO document analyst. Your job is to identify the structure of a CLO document and map its sections to page ranges.

You will be given either a CLO compliance/trustee report or a Private Placement Memorandum (PPM/Offering Circular).

For COMPLIANCE REPORTS, identify these sections and their page ranges:
${COMPLIANCE_SECTION_TYPES.map((t) => `- ${t}`).join("\n")}

For PPM documents, identify these sections and their page ranges:
${PPM_SECTION_TYPES.map((t) => `- ${t}`).join("\n")}

Rules:
- Return the exact page numbers (1-indexed) where each section starts and ends
- A section may span multiple pages
- Some sections may overlap (e.g., a summary page might contain both compliance_summary and account_balances)
- If a section appears on a single page, pageStart and pageEnd should be the same
- Set confidence to "high" if the section is clearly identifiable, "medium" if the boundaries are uncertain, "low" if you're guessing
- Add notes for anything unusual (e.g., "asset schedule split across two separate tables on non-contiguous pages")
- Only include sections you can actually find in the document — do not fabricate sections
- First determine the documentType, then map sections accordingly`,
    user: "Analyze this document and return its section map with page ranges.",
  };
}

export async function mapDocument(
  apiKey: string,
  documents: CloDocument[],
): Promise<DocumentMap> {
  const prompt = mapperPrompt();
  const content = buildDocumentContent(documents, prompt.user);

  const tool = {
    name: "map_document",
    description: "Return the document structure map with section types and page ranges",
    inputSchema: zodToToolSchema(documentMapSchema),
  };

  const result = await callAnthropicWithTool(apiKey, prompt.system, content, 4096, tool);

  if (result.error || !result.data) {
    throw new Error(`Document mapping failed: ${result.error || "no data returned"}`);
  }

  return result.data as unknown as DocumentMap;
}

// Inline zodToToolSchema — will be extracted to shared util in Task 6
function zodToToolSchema(schema: z.ZodType): Record<string, unknown> {
  const result = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], {
    target: "jsonSchema7",
  }) as Record<string, unknown>;
  if (result.type === "object" && result.properties) {
    delete result.$schema;
    return result;
  }
  return { type: "object" };
}
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/document-mapper.ts
git commit -m "feat(clo): add document mapper for section-first extraction (Phase 1)"
```

---

### Task 3: Create text extractor (Phase 2)

**Files:**
- Create: `web/lib/clo/extraction/text-extractor.ts`

Phase 2 takes the document map from Phase 1 and transcribes each section's pages to clean markdown.

**Step 1: Create the text extractor module**

Create `web/lib/clo/extraction/text-extractor.ts`:

```typescript
import type { CloDocument } from "../types";
import type { DocumentMap, SectionEntry } from "./document-mapper";
import { callAnthropicForText } from "../api";
import { extractPdfPages } from "../pdf-chunking";

export interface SectionText {
  sectionType: string;
  pageStart: number;
  pageEnd: number;
  markdown: string;
  truncated: boolean;
}

function transcriptionPrompt(section: SectionEntry): { system: string; user: string } {
  const baseSystem = `You are a precise document transcription tool. Your job is to convert PDF content into clean, accurate markdown.

Rules:
- Preserve ALL numbers exactly as they appear (do not round, reformat, or recompute)
- Render tables as markdown tables with proper column alignment
- Keep all headers, labels, and section titles
- For multi-column tables, ensure each column is captured
- Do not add commentary, analysis, or interpretation — just transcribe
- Do not skip or summarize any content — include everything on these pages`;

  const sectionSpecific: Record<string, string> = {
    asset_schedule: `
Special instructions for asset schedule:
- This section may contain multiple related tables (e.g., Asset Information I, II, III)
- If multiple tables exist, produce a SINGLE unified table with one row per asset
- Merge columns from all sub-tables by matching rows (by position order or asset name)
- Ensure every single row is included — do not truncate or skip any assets
- If a table continues across pages, combine it into one continuous table`,
    waterfall: `
Special instructions for waterfall:
- Preserve the exact payment priority order (step numbers)
- Include all amounts, even if zero
- Keep shortfall/diversion indicators`,
    concentration_tables: `
Special instructions for concentration tables:
- Each concentration type (industry, country, rating, etc.) should be a separate table
- Include both actual values/percentages AND limit values
- Preserve pass/fail indicators`,
  };

  return {
    system: baseSystem + (sectionSpecific[section.sectionType] || ""),
    user: `Transcribe the following ${section.sectionType.replace(/_/g, " ")} section (pages ${section.pageStart}-${section.pageEnd}) into clean markdown.`,
  };
}

async function extractSectionText(
  apiKey: string,
  pdfDocument: CloDocument,
  section: SectionEntry,
): Promise<SectionText> {
  const pageBase64 = await extractPdfPages(pdfDocument.base64, section.pageStart, section.pageEnd);
  const pageDoc: CloDocument = { ...pdfDocument, base64: pageBase64 };
  const prompt = transcriptionPrompt(section);
  const pageCount = section.pageEnd - section.pageStart + 1;
  // Budget ~2000 tokens per page for transcription
  const maxTokens = Math.min(64000, pageCount * 2000);

  const result = await callAnthropicForText(apiKey, prompt.system, [pageDoc], prompt.user, maxTokens);

  if (result.error) {
    throw new Error(`Text extraction failed for ${section.sectionType}: ${result.error}`);
  }

  return {
    sectionType: section.sectionType,
    pageStart: section.pageStart,
    pageEnd: section.pageEnd,
    markdown: result.text,
    truncated: result.truncated,
  };
}

export async function extractAllSectionTexts(
  apiKey: string,
  pdfDocument: CloDocument,
  documentMap: DocumentMap,
): Promise<SectionText[]> {
  const results = await Promise.all(
    documentMap.sections.map((section) => extractSectionText(apiKey, pdfDocument, section)),
  );
  return results;
}
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/text-extractor.ts
git commit -m "feat(clo): add text extractor for section transcription (Phase 2)"
```

---

### Task 4: Create per-section schemas for compliance reports

**Files:**
- Create: `web/lib/clo/extraction/section-schemas.ts`

Each section gets its own focused Zod schema. These are much smaller than the current monolithic pass schemas.

**Step 1: Create section schemas**

Create `web/lib/clo/extraction/section-schemas.ts`. This file defines one schema per section type. Each schema is deliberately small (5-20 top-level fields) to keep Claude focused.

Reference the existing field definitions from `schemas.ts` (lines 10-388) but split them by section. Key schemas to define:

- `complianceSummarySchema` — reportDate, dealName, tranches array (className, principalAmount, spread, allInRate, currentBalance, rating), aggregatePrincipalBalance, adjustedCollateralPrincipalAmount, numberOfAssets, wacSpread, diversityScore, warfScore
- `parValueTestsSchema` — tests array (testName, testClass, numerator, denominator, actualValue, triggerLevel, cushionPct, isPassing, isOcTest: true)
- `interestCoverageTestsSchema` — tests array (testName, testClass, numerator, denominator, actualValue, triggerLevel, cushionPct, isPassing, isIcTest: true), interestAmountsPerTranche array
- `assetScheduleSchema` — holdings array with all ~35 fields from current pass2Schema
- `concentrationSchema` — concentrations array from current pass3Schema
- `waterfallSchema` — waterfallSteps, proceeds from current pass4Schema
- `tradingActivitySchema` — trades, tradingSummary from current pass4Schema
- `interestAccrualSchema` — assetRateDetails array (obligorName, baseRate, indexFloor, spread, creditSpreadAdj, effectiveSpread, allInRate)
- `accountBalancesSchema` — accounts array (accountName, accountType, requiredBalance, actualBalance)
- `supplementarySchema` — fees, hedgePositions, fxRates, events, ratingActions from current pass5Schema

For PPM sections, similarly split the existing `extractedConstraintsSchema` into per-section schemas:
- `transactionOverviewSchema` — dealIdentity fields
- `capitalStructureSchema` — capitalStructure array + dealSizing
- `coverageTestsSchema` — coverageTestEntries + reinvestmentOcTest
- `eligibilityCriteriaSchema` — eligibilityCriteria array
- `portfolioConstraintsSchema` — portfolioProfileTests + collateralQualityTests
- `waterfallRulesSchema` — waterfall (interest + principal)
- `feesAndExpensesSchema` — fees
- `keyDatesSchema` — keyDates
- `keyPartiesSchema` — keyParties
- `redemptionSchema` — redemptionProvisions
- `hedgingSchema` — hedging

**Important:** Copy the actual field definitions from `schemas.ts` and `app/api/clo/profile/extract/schema.ts`. Do not invent new fields — reuse the existing Zod field definitions but reorganize them into smaller groups.

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/section-schemas.ts
git commit -m "feat(clo): add per-section Zod schemas for focused extraction"
```

---

### Task 5: Create per-section prompts

**Files:**
- Create: `web/lib/clo/extraction/section-prompts.ts`

Each section gets a focused prompt that only asks for that section's data. Reference the existing prompt logic from `prompts.ts` (lines 1-626) but split per section.

**Step 1: Create section prompts**

Create `web/lib/clo/extraction/section-prompts.ts`. Each function returns `{ system: string; user: string }`.

Key design principles from the current prompts to preserve:
- "Extract ONLY explicitly stated values. Use null for missing fields. Never fabricate data."
- Percentage formatting rules (5.2 not "5.2%")
- Monetary amounts without currency symbols
- Spreads in basis points
- Deduplication rules for compliance tests (from current pass1Prompt lines 60-80)
- Multi-table cross-referencing for holdings (from current pass2Prompt lines 160-200)
- "Extract ALL holdings — do not truncate" warnings

Each prompt receives the markdown text (from Phase 2) as input, NOT the PDF. This is the key difference — the prompt says "Extract from the following markdown text" not "Extract from this PDF document."

Prompts to create:
- `complianceSummaryPrompt()` — extract tranche table, pool metrics
- `parValueTestsPrompt()` — extract all par value / OC tests
- `interestCoverageTestsPrompt()` — extract all IC tests
- `assetSchedulePrompt()` — extract all holdings (most detailed prompt, include completeness warnings)
- `concentrationPrompt()` — extract all concentration buckets by type
- `waterfallPrompt()` — extract waterfall steps and proceeds
- `tradingActivityPrompt()` — extract trades and trading summary
- `interestAccrualPrompt()` — extract per-asset rate details
- `accountBalancesPrompt()` — extract account balances
- `supplementaryPrompt()` — extract fees, hedges, FX, events

PPM section prompts:
- `ppmTransactionOverviewPrompt()`
- `ppmCapitalStructurePrompt()`
- `ppmCoverageTestsPrompt()`
- `ppmEligibilityCriteriaPrompt()`
- `ppmPortfolioConstraintsPrompt()`
- `ppmWaterfallRulesPrompt()`
- `ppmFeesPrompt()`
- `ppmKeyDatesPrompt()`
- `ppmKeyPartiesPrompt()`
- `ppmRedemptionPrompt()`
- `ppmHedgingPrompt()`

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/section-prompts.ts
git commit -m "feat(clo): add per-section extraction prompts"
```

---

### Task 6: Create section data extractor (Phase 3)

**Files:**
- Create: `web/lib/clo/extraction/section-extractor.ts`

Phase 3 takes each section's markdown text and extracts structured data using the section-specific schema and prompt.

**Step 1: Extract `zodToToolSchema` to shared utility**

Move the `zodToToolSchema` and `zodV4ToJsonSchema` functions from `runner.ts` (lines 13-66) into a new shared location OR just re-export from `runner.ts`. Simplest approach: export them from `runner.ts`.

In `runner.ts`, change lines 13 and 22 to add `export`:
```typescript
export function zodToToolSchema(schema: any): Record<string, unknown> { ... }
export function zodV4ToJsonSchema(schema: any): Record<string, unknown> { ... }
```

**Step 2: Create the section extractor module**

Create `web/lib/clo/extraction/section-extractor.ts`:

```typescript
import type { SectionText } from "./text-extractor";
import { callAnthropicWithTool } from "../api";
import { zodToToolSchema } from "./runner";
import * as sectionSchemas from "./section-schemas";
import * as sectionPrompts from "./section-prompts";
import { z } from "zod";

export interface SectionExtractionResult {
  sectionType: string;
  data: Record<string, unknown> | null;
  truncated: boolean;
  error?: string;
}

// Map section type → { schema, prompt }
function getSectionConfig(sectionType: string, documentType: "compliance_report" | "ppm") {
  if (documentType === "compliance_report") {
    const configs: Record<string, { schema: z.ZodType; prompt: () => { system: string; user: string } }> = {
      compliance_summary: { schema: sectionSchemas.complianceSummarySchema, prompt: sectionPrompts.complianceSummaryPrompt },
      par_value_tests: { schema: sectionSchemas.parValueTestsSchema, prompt: sectionPrompts.parValueTestsPrompt },
      interest_coverage_tests: { schema: sectionSchemas.interestCoverageTestsSchema, prompt: sectionPrompts.interestCoverageTestsPrompt },
      asset_schedule: { schema: sectionSchemas.assetScheduleSchema, prompt: sectionPrompts.assetSchedulePrompt },
      concentration_tables: { schema: sectionSchemas.concentrationSchema, prompt: sectionPrompts.concentrationPrompt },
      waterfall: { schema: sectionSchemas.waterfallSchema, prompt: sectionPrompts.waterfallPrompt },
      trading_activity: { schema: sectionSchemas.tradingActivitySchema, prompt: sectionPrompts.tradingActivityPrompt },
      interest_accrual: { schema: sectionSchemas.interestAccrualSchema, prompt: sectionPrompts.interestAccrualPrompt },
      account_balances: { schema: sectionSchemas.accountBalancesSchema, prompt: sectionPrompts.accountBalancesPrompt },
      supplementary: { schema: sectionSchemas.supplementarySchema, prompt: sectionPrompts.supplementaryPrompt },
    };
    return configs[sectionType];
  }

  // PPM configs
  const ppmConfigs: Record<string, { schema: z.ZodType; prompt: () => { system: string; user: string } }> = {
    transaction_overview: { schema: sectionSchemas.transactionOverviewSchema, prompt: sectionPrompts.ppmTransactionOverviewPrompt },
    capital_structure: { schema: sectionSchemas.capitalStructureSchema, prompt: sectionPrompts.ppmCapitalStructurePrompt },
    coverage_tests: { schema: sectionSchemas.coverageTestsSchema, prompt: sectionPrompts.ppmCoverageTestsPrompt },
    eligibility_criteria: { schema: sectionSchemas.eligibilityCriteriaSchema, prompt: sectionPrompts.ppmEligibilityCriteriaPrompt },
    portfolio_constraints: { schema: sectionSchemas.portfolioConstraintsSchema, prompt: sectionPrompts.ppmPortfolioConstraintsPrompt },
    waterfall_rules: { schema: sectionSchemas.waterfallRulesSchema, prompt: sectionPrompts.ppmWaterfallRulesPrompt },
    fees_and_expenses: { schema: sectionSchemas.feesAndExpensesSchema, prompt: sectionPrompts.ppmFeesPrompt },
    key_dates: { schema: sectionSchemas.keyDatesSchema, prompt: sectionPrompts.ppmKeyDatesPrompt },
    key_parties: { schema: sectionSchemas.keyPartiesSchema, prompt: sectionPrompts.ppmKeyPartiesPrompt },
    redemption: { schema: sectionSchemas.redemptionSchema, prompt: sectionPrompts.ppmRedemptionPrompt },
    hedging: { schema: sectionSchemas.hedgingSchema, prompt: sectionPrompts.ppmHedgingPrompt },
  };
  return ppmConfigs[sectionType];
}

async function extractSection(
  apiKey: string,
  sectionText: SectionText,
  documentType: "compliance_report" | "ppm",
): Promise<SectionExtractionResult> {
  const config = getSectionConfig(sectionText.sectionType, documentType);
  if (!config) {
    return { sectionType: sectionText.sectionType, data: null, error: `Unknown section type: ${sectionText.sectionType}` };
  }

  const prompt = config.prompt();
  const tool = {
    name: `extract_${sectionText.sectionType}`,
    description: `Extract structured data from the ${sectionText.sectionType.replace(/_/g, " ")} section`,
    inputSchema: zodToToolSchema(config.schema),
  };

  // Send markdown text as a text content block (no PDF needed in Phase 3)
  const content = [{ type: "text", text: `${prompt.user}\n\n---\n\n${sectionText.markdown}` }];
  // Budget tokens based on section complexity
  const maxTokens = sectionText.sectionType === "asset_schedule" ? 64000 : 16000;

  const result = await callAnthropicWithTool(apiKey, prompt.system, content, maxTokens, tool);

  if (result.error) {
    return { sectionType: sectionText.sectionType, data: null, truncated: false, error: result.error };
  }

  return {
    sectionType: sectionText.sectionType,
    data: result.data,
    truncated: result.truncated,
  };
}

export async function extractAllSections(
  apiKey: string,
  sectionTexts: SectionText[],
  documentType: "compliance_report" | "ppm",
): Promise<SectionExtractionResult[]> {
  const results = await Promise.all(
    sectionTexts.map((st) => extractSection(apiKey, st, documentType)),
  );
  return results;
}
```

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add web/lib/clo/extraction/section-extractor.ts web/lib/clo/extraction/runner.ts
git commit -m "feat(clo): add section data extractor (Phase 3)"
```

---

### Task 7: Update validator for section-based output (Phase 4)

**Files:**
- Modify: `web/lib/clo/extraction/validator.ts`

The current validator takes `Pass1Output, Pass2Output, Pass3Output`. Update it to work with section-based extraction results.

**Step 1: Add a new validation entry point**

Add a new function `validateSectionExtraction` that accepts a `Record<string, Record<string, unknown>>` (section type → extracted data) instead of pass-specific types. Internally, it maps sections to the same validation checks.

Keep the existing `validateExtraction` and `validateCapStructure` functions for backward compatibility during migration. Add the new function after them.

The new function should:
1. Extract `compliance_summary` data → use as the "pool summary" for cross-checks
2. Extract `asset_schedule` data → use as "holdings" for count/par/spread checks
3. Extract `concentration_tables` data → use for concentration checks
4. Extract `par_value_tests` and `interest_coverage_tests` → validate test math
5. Run the same 11 checks but source data from section results instead of pass results

**Step 2: Add targeted repair query builder**

Add a function `buildRepairQueries` that takes validation failures and returns repair instructions:

```typescript
export interface RepairQuery {
  sectionType: string;
  reason: string;
  instruction: string; // Specific prompt for the repair call
  context?: string;    // Additional context (e.g., list of extracted holdings names)
}

export function buildRepairQueries(
  validationResult: ValidationResult,
  sectionResults: Record<string, Record<string, unknown>>,
): RepairQuery[]
```

For each failing check, produce a targeted repair:
- `asset_count` fail → repair `asset_schedule` with "extracted N but expected M, find missing"
- `total_par_match` fail → repair `asset_schedule` with "par total mismatch, verify amounts"
- Missing section → repair that section with "section not found, try full document"

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add web/lib/clo/extraction/validator.ts
git commit -m "feat(clo): add section-based validation and repair query builder (Phase 4)"
```

---

### Task 8: Update normalizer for section-based output

**Files:**
- Modify: `web/lib/clo/extraction/normalizer.ts`

The current normalizer has `normalizePass1..5` functions. Add new functions that normalize section-based output to the same DB format.

**Step 1: Add section-based normalizer functions**

Add new functions that map section extraction results to the existing DB table format. The key insight is that the DB schema doesn't change — we're just reorganizing how data flows INTO the normalizer.

```typescript
export function normalizeSectionResults(
  sections: Record<string, Record<string, unknown>>,
  reportPeriodId: string,
  dealId: string,
): {
  poolSummary: Record<string, unknown> | null;
  complianceTests: Record<string, unknown>[];
  holdings: Record<string, unknown>[];
  concentrations: Record<string, unknown>[];
  waterfallSteps: Record<string, unknown>[];
  proceeds: Record<string, unknown>[];
  trades: Record<string, unknown>[];
  tradingSummary: Record<string, unknown> | null;
  trancheSnapshots: Record<string, unknown>[];
  accountBalances: Record<string, unknown>[];
  parValueAdjustments: Record<string, unknown>[];
  events: Record<string, unknown>[];
  supplementaryData: Record<string, unknown> | null;
}
```

This function:
1. Takes `compliance_summary` → produces `poolSummary` + tranche data
2. Takes `par_value_tests` + `interest_coverage_tests` → produces `complianceTests` (with existing dedup logic)
3. Takes `asset_schedule` → produces `holdings` (with existing dedup logic)
4. Takes `concentration_tables` → produces `concentrations`
5. Takes `waterfall` → produces `waterfallSteps` + `proceeds`
6. Takes `trading_activity` → produces `trades` + `tradingSummary`
7. Takes `account_balances` → produces `accountBalances`
8. Takes `supplementary` → produces `events` + `supplementaryData`

Reuse the existing `toDbRow`, `toSnakeCase`, dedup helpers. The field-level mapping stays the same.

Similarly, add `normalizePpmSectionResults` for PPM sections → `extractedConstraints`.

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add web/lib/clo/extraction/normalizer.ts
git commit -m "feat(clo): add section-based normalizer functions"
```

---

### Task 9: Wire up new compliance report pipeline

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts`

This is the main integration task. Add a new top-level function `runSectionExtraction` that orchestrates all 4 phases, and update the API route to call it.

**Step 1: Add `runSectionExtraction` function**

Add after the existing `runExtraction` function. This function:

1. **Phase 1:** Call `mapDocument(apiKey, documents)` → get section map
2. **Phase 2:** Call `extractAllSectionTexts(apiKey, pdfDoc, documentMap)` → get markdown per section
3. **Phase 3:** Call `extractAllSections(apiKey, sectionTexts, "compliance_report")` → get structured data per section
4. **Phase 4:** Call `validateSectionExtraction(sectionResults)` → check quality
   - If repairs needed: call `buildRepairQueries(validation, sectionResults)`, execute targeted repairs
5. **Normalize:** Call `normalizeSectionResults(sectionResults, reportPeriodId, dealId)`
6. **Insert:** Use existing `batchInsert` for each table (same as current runner)
7. **Return:** `{ reportPeriodId, status }`

Keep the existing `runExtraction` function intact for now. The switch happens in the API route.

**Step 2: Identify the first PDF document from the documents array**

The documents array may contain multiple files. For page-range extraction, we need the main PDF. Add logic to find the primary PDF document (largest one, or first one).

**Step 3: Handle the report date extraction**

In the current pipeline, Pass 1 extracts reportDate which is needed to create the `clo_report_periods` record. In the new pipeline, `compliance_summary` extraction produces reportDate. Extract it from Phase 3 results before DB insertion.

**Step 4: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 5: Commit**

```bash
git add web/lib/clo/extraction/runner.ts
git commit -m "feat(clo): add section-based compliance report extraction pipeline"
```

---

### Task 10: Wire up new PPM pipeline

**Files:**
- Modify: `web/lib/clo/extraction/ppm-extraction.ts`

Replace the 3-pass PPM extraction with the 4-phase section-based approach.

**Step 1: Add `runSectionPpmExtraction` function**

Same 4-phase pattern as compliance reports:
1. Phase 1: Map document → identify PPM sections
2. Phase 2: Transcribe each section to markdown
3. Phase 3: Extract structured data per section using PPM schemas
4. Phase 4: Validate completeness (e.g., capital structure has tranches, key dates has maturity)
5. Merge all section results into a single `extractedConstraints` object using `normalizePpmSectionResults`

Keep the existing `runPpmExtraction` function for backward compatibility during transition.

**Step 2: Merge section results into extractedConstraints format**

The downstream code expects `extractedConstraints` as a flat object with 30 top-level keys. Map section results:
- `transaction_overview` → `dealIdentity`
- `capital_structure` → `capitalStructure` + `dealSizing`
- `coverage_tests` → `coverageTestEntries` + `reinvestmentOcTest`
- `eligibility_criteria` → `eligibilityCriteria`
- `portfolio_constraints` → `portfolioProfileTests` + `collateralQualityTests`
- `waterfall_rules` → `waterfall`
- `fees_and_expenses` → `fees`
- `key_dates` → `keyDates`
- `key_parties` → `keyParties`
- `redemption` → `redemptionProvisions`
- `hedging` → `hedging`

Sections we dropped (tax, risk factors, etc.) simply don't appear → their keys remain absent.

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add web/lib/clo/extraction/ppm-extraction.ts
git commit -m "feat(clo): add section-based PPM extraction pipeline"
```

---

### Task 11: Switch API routes to new pipelines

**Files:**
- Modify: `web/app/api/clo/report/extract/route.ts`
- Modify: `web/worker/index.ts` (if worker calls PPM extraction directly)

**Step 1: Update compliance report route**

In `web/app/api/clo/report/extract/route.ts`, change the import from `runExtraction` to `runSectionExtraction` and update the function call. The return type is the same (`{ reportPeriodId, status }`), so no other changes needed.

**Step 2: Update PPM extraction trigger**

Find where PPM extraction is triggered (worker or API route) and switch from `runPpmExtraction` to `runSectionPpmExtraction`. The return type is the same (`{ extractedConstraints, rawOutputs }`).

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add web/app/api/clo/report/extract/route.ts web/worker/index.ts
git commit -m "feat(clo): switch API routes to section-based extraction pipelines"
```

---

### Task 12: Clean up old pipeline code

**Files:**
- Modify: `web/lib/clo/extraction/runner.ts` — remove old `runExtraction` if no longer referenced
- Modify: `web/lib/clo/extraction/ppm-extraction.ts` — remove old `runPpmExtraction` if no longer referenced
- Modify: `web/lib/clo/extraction/prompts.ts` — can be removed if all prompts moved to `section-prompts.ts`
- Modify: `web/lib/clo/extraction/schemas.ts` — can be removed if all schemas moved to `section-schemas.ts`

**Step 1: Search for remaining references to old functions**

Run: `grep -rn "runExtraction\|runPpmExtraction\|pass1Prompt\|pass2Prompt\|pass1Schema\|pass2Schema" web/` to find any remaining callers.

**Step 2: Remove dead code**

Delete the old functions and their imports. Keep any shared utilities (dedup helpers, zodToToolSchema, etc.) that the new code still uses.

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add -A web/lib/clo/extraction/
git commit -m "refactor(clo): remove old multi-pass extraction pipeline"
```

---

### Task 13: End-to-end verification

**Step 1: Review the full pipeline flow**

Read through the new pipeline end-to-end:
1. API route receives PDF
2. `runSectionExtraction` is called
3. Phase 1 maps sections
4. Phase 2 transcribes sections in parallel
5. Phase 3 extracts structured data in parallel
6. Phase 4 validates and repairs
7. Normalizer maps to DB tables
8. Data inserted into PostgreSQL
9. Return status

**Step 2: Check for compilation errors**

Run: `cd web && npx tsc --noEmit --pretty`
Fix any remaining type errors.

**Step 3: Check for runtime issues**

Run: `cd web && npm run build` (or equivalent Next.js build command)
Fix any build errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(clo): complete section-first extraction architecture redesign"
```
