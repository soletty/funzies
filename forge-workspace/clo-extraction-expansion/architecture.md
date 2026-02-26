# CLO Extraction Expansion — Architecture

## Overview
Expanding the CLO compliance report system from ~30 fields in a single JSONB column to ~595 fields across ~15 relational tables with time-series support. The extraction pipeline changes from 1 pass to 5 focused passes. All UI consumers update to read from new tables instead of the `extracted_portfolio` JSONB blob.

## Module Map

| Module | Files | Owner |
|--------|-------|-------|
| Schema | web/lib/schema.sql | Foundation |
| Types | web/lib/clo/types.ts | Foundation |
| Zod Schemas | web/lib/clo/extraction/schemas.ts | Foundation |
| Extraction Prompts | web/lib/clo/extraction/prompts.ts | Pipeline |
| Normalizer | web/lib/clo/extraction/normalizer.ts | Pipeline |
| Runner | web/lib/clo/extraction/runner.ts | Pipeline |
| Extract API | web/app/api/clo/report/extract/route.ts | Pipeline |
| Access Layer | web/lib/clo/access.ts (additions) | Access |
| Time Series | web/lib/clo/time-series.ts | Access |
| Dashboard | web/app/clo/page.tsx | UI |
| Holdings | web/app/clo/holdings/* | UI |
| Questionnaire | web/components/clo/QuestionnaireForm.tsx | UI |
| Chat API | web/app/api/clo/chat/route.ts | UI |
| Prompts | web/worker/clo-prompts.ts | UI |
| Extract Button | web/app/clo/ExtractPortfolioButton.tsx | UI |

## Key Conventions
- SQL: snake_case columns, UUID PKs, TIMESTAMPTZ for dates, JSONB for flexible data
- TypeScript: camelCase fields, PascalCase types, `type` imports where possible
- Queries: raw SQL via `query<T>(sql, params)` from `@/lib/db`
- API routes: `NextResponse.json()`, auth via `getCurrentUser()` from `@/lib/auth-helpers`
- Pages: auth via `auth()` from `@/lib/auth`, server components by default
- Prompts: functions returning `{ system: string, user: string }`
- Inline styles with CSS variables (no Tailwind)
- Status enums: `'pending' | 'extracting' | 'complete' | 'partial' | 'error'` for new extraction

## Data Flow
1. User uploads compliance report PDF → stored in `clo_profiles.documents` as base64
2. User triggers extraction → POST /api/clo/report/extract
3. Runner creates `clo_report_periods` row (status: extracting)
4. Pass 1 runs (metadata + tests + pool summary) → blocking
5. Passes 2-5 run in parallel (holdings, concentrations, waterfall+trading, supplementary)
6. Each pass result validated against Zod schema, normalized to table rows, inserted
7. Overflow data → `clo_extraction_overflow`
8. Supplementary data → `clo_report_periods.supplementary_data` JSONB
9. Raw outputs → `clo_report_periods.raw_extraction` JSONB
10. Status updated to complete/partial/error
11. Dashboard/Holdings/Chat read from new relational tables
