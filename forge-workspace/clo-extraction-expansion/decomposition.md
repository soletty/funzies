# CLO Extraction Expansion — Decomposition

## Task Type
Feature in existing codebase — adding ~15 new database tables, ~20 TypeScript interfaces, a 5-pass extraction pipeline, data access layer, time-series helpers, UI updates, and prompt updates.

## Codebase Context
- Next.js App Router with server components + PostgreSQL (raw SQL via `query()`)
- Anthropic Claude API for extraction (model: claude-sonnet-4-20250514)
- Base64 document storage in JSONB, inline styles with CSS variables
- Zod NOT currently in dependencies — must be installed first
- Path alias: `@/` for all imports from `web/`

## Subtasks

### Subtask 1: Foundation (Schema + Types + Zod Install)
- **Description**: Install zod, add ~15 new SQL tables to schema.sql, add ~20 new TypeScript interfaces to types.ts, create Zod validation schemas
- **Dependencies**: none
- **Inputs**: Existing schema.sql and types.ts
- **Outputs**: Updated schema.sql, updated types.ts, new web/lib/clo/extraction/schemas.ts
- **Files owned**: web/lib/schema.sql, web/lib/clo/types.ts, web/lib/clo/extraction/schemas.ts
- **Estimated complexity**: high (large volume of precise field definitions)

### Subtask 2: Extraction Prompts
- **Description**: Create 5 extraction prompt functions following existing prompt patterns
- **Dependencies**: Subtask 1 (needs type/schema definitions)
- **Inputs**: Zod schemas from Subtask 1, existing prompt patterns in clo-prompts.ts
- **Outputs**: web/lib/clo/extraction/prompts.ts
- **Files owned**: web/lib/clo/extraction/prompts.ts
- **Estimated complexity**: high (5 detailed prompts with specific field schemas)

### Subtask 3: Normalizer + Runner + API Route
- **Description**: Create JSON→table-row transforms, 5-pass orchestrator, new API endpoint
- **Dependencies**: Subtask 1 (types/schemas), Subtask 2 (prompts)
- **Inputs**: Types, Zod schemas, prompt functions
- **Outputs**: normalizer.ts, runner.ts, /api/clo/report/extract/route.ts
- **Files owned**: web/lib/clo/extraction/normalizer.ts, web/lib/clo/extraction/runner.ts, web/app/api/clo/report/extract/route.ts
- **Estimated complexity**: high

### Subtask 4: Data Access Layer + Time Series
- **Description**: Add query functions for all new tables, create time-series helpers
- **Dependencies**: Subtask 1 (types/schemas)
- **Inputs**: Types, table definitions
- **Outputs**: Updated access.ts, new time-series.ts
- **Files owned**: web/lib/clo/access.ts (additions only), web/lib/clo/time-series.ts
- **Estimated complexity**: medium

### Subtask 5: UI Updates + Cleanup
- **Description**: Update dashboard, holdings, questionnaire, chat; update prompts; remove old extraction
- **Dependencies**: Subtask 1, Subtask 4 (needs access functions)
- **Inputs**: New types, access functions, time-series helpers
- **Outputs**: Updated page.tsx, HoldingsTable.tsx, QuestionnaireForm.tsx, chat route, clo-prompts.ts
- **Files owned**: web/app/clo/page.tsx, web/app/clo/holdings/*, web/components/clo/QuestionnaireForm.tsx, web/app/api/clo/chat/route.ts, web/worker/clo-prompts.ts, web/app/clo/ExtractPortfolioButton.tsx
- **Estimated complexity**: high (many files, careful integration)

## Dependency DAG

```
[Subtask 1: Foundation] ──────────────────────────────────────┐
    │                                                          │
    ├──→ [Subtask 2: Prompts] ──→ [Subtask 3: Runner+API]    │
    │                                                          │
    ├──→ [Subtask 4: Access Layer] ──→ [Subtask 5: UI+Cleanup]│
    │                                                          │
    └──────────────────────────────────────────────────────────┘

Parallelizable: 1 → (2 ∥ 4) → (3 ∥ 5 partially) → final integration
```

## Team Size: 4
- 1 foundation agent (schema + types + zod)
- 1 extraction pipeline agent (prompts + runner + normalizer + API)
- 1 data access + time-series agent
- 1 UI + cleanup agent
