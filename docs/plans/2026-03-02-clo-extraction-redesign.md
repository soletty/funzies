# CLO Data Extraction & Display Redesign

## Problem

The post-extraction review screen after processing PPM and compliance report documents displays too much irrelevant information for CLO managers. Client feedback identified that the vast majority of extracted data shown was not useful for their workflow.

## Client Feedback (6 Points)

1. **Tests must be compliant** - PPM explains the tests, compliance report provides the levels. These need to be cross-referenced.
2. **PM trading ability** - If CCC basket is at max, PM cannot buy new CCC. PPM provides context on what the PM is allowed to do; compliance report shows current state.
3. **Full capital structure** - Extract the complete cap structure (all tranches), not just the tranche the PPM explains in detail.
4. **Eligibility criteria** - Important context for AI, but does not need to be displayed.
5. **Management of Portfolio & Terms and Conditions of Sales** - Important context that should be extracted.
6. **Portfolio Profile Tests** - PPM defines tests; compliance report provides actuals. These should be shown together.

## Design

### 1. Restructured Post-Extraction Review Screen

Replace the current 6-section catch-all layout with 5 focused sections:

**Header Bar:**
- Deal Name | Collateral Manager | Issuer
- Key Dates row: RP End | NC End | Maturity | Payment Frequency

**Section 1: Capital Structure** (always expanded, editable)
- Full table: Class | Designation | Principal Amount | Rate Type | Spread (bps) | Fitch | S&P | Deferrable
- All tranches (AAA through equity)
- Deal sizing: Target Par | Total Rated Notes | Equity %

**Section 2: Compliance & Coverage Tests** (always expanded, editable)
- When both PPM + compliance report uploaded (unified table):
  - Test Name | Class | PPM Trigger | Actual Value | Pass/Fail
- When PPM only:
  - Test Name | Class | Trigger Level
- Includes: OC Par, OC MV, IC tests by class

**Section 3: Portfolio Profile & Quality Tests** (always expanded, editable)
- Unified table: Test Name | Min Limit | Max Limit | Actual Value | Pass/Fail
- All dimensions: WARF, WAS, WAL, Diversity Score, CCC %, Single-B %, Fixed Rate %, Second Lien %, etc.
- Collateral quality tests merged here

**Section 4: Trading Constraints** (always expanded, editable)
- CCC bucket limits vs current level
- Discretionary sales limits
- Required sale conditions
- Post-RP trading rules
- Concentration limits affecting trading (single name, industry, country)

**Section 5: Additional Document Context** (collapsed by default, editable)
- Eligibility criteria
- Management of Portfolio terms
- Terms and Conditions of Sales
- Waterfall summary
- Fees, accounts, hedging provisions
- Events of default, voting & control
- All remaining extracted data

### 2. PPM Extraction Prompt Refinements

**Pass 1 (Full extraction):**
- Capital Structure: Emphasize finding the complete cap structure table at the beginning of the PPM. Extract ALL tranches, not just the one described in detail.
- Portfolio Profile Tests: Extract every test dimension with exact min/max thresholds and applicable period (reinvestment/post-reinvestment).
- Trading Constraints: Extract CM trading constraints with concentration-based limits and test-breach implications.

**Pass 2 (Deep-dive):**
- Add extraction of "Management of Portfolio" section
- Add extraction of "Terms and Conditions of Sales" section

**Pass 3 (Structural provisions):**
- Capture the link between test breaches and trading restrictions (e.g., coverage test failure → proceeds diversion)

**New fields on ExtractedConstraints type:**
- `managementOfPortfolio`: string - PM authority and restrictions
- `termsAndConditionsOfSales`: string - structured sale conditions
- `tradingRestrictionsByTestBreach`: array - mapping of test failures to trading restrictions

### 3. Cross-Reference Matching Logic

**New function: `crossReferenceTestResults()`**

When both PPM and compliance report are extracted:

1. Match PPM-defined tests to compliance report actuals by test name/type:
   - Coverage tests (OC/IC by class) → `clo_compliance_tests` rows
   - Quality tests (WARF, WAS, WAL, Diversity) → `clo_compliance_tests` + `clo_pool_summary`
   - Profile tests (CCC %, Fixed Rate %, etc.) → pool summary fields

2. Compute pass/fail status based on actual vs trigger comparison

3. Return unified data structure for the review screen

## Approach

Approach A: Extraction-First Refactor
- Refine existing PPM extraction prompts (no new passes)
- Add cross-reference matching as post-processing
- Restructure review screen UI

## What Changes

| Component | Change |
|---|---|
| `clo-prompts.ts` (Pass 1) | Strengthen capital structure, profile tests, trading constraint extraction |
| `clo-prompts.ts` (Pass 2) | Add Management of Portfolio + Terms of Sales |
| `clo-prompts.ts` (Pass 3) | Add test-breach → trading restriction mapping |
| `types.ts` | Add new fields to ExtractedConstraints |
| `QuestionnaireForm.tsx` | Restructure review screen (5 sections, unified tables) |
| New: cross-reference util | Match PPM tests to compliance actuals |
