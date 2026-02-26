# CLO Extraction Expansion — Interface Contracts

## Extraction Pipeline Interface

The extraction pipeline follows this call flow:

```
API Route (route.ts) → Runner (runner.ts) → Prompts (prompts.ts) + Normalizer (normalizer.ts)
                                          ↓
                                     Database tables
```

### Runner ↔ Prompts Contract
- Each prompt function returns `{ system: string, user: string }`
- pass1Prompt() takes no args
- pass2Prompt(reportDate), pass3Prompt(reportDate), pass4Prompt(reportDate), pass5Prompt(reportDate) take the report date from Pass 1

### Runner ↔ Normalizer Contract
- Each normalize function takes the Zod-validated output + IDs, returns DB-ready row objects
- All numeric values stored as NUMERIC in DB (use number in TypeScript)
- All row objects use snake_case keys (matching DB columns)

### Access Layer Interface
- All access functions return camelCase TypeScript objects
- Row converter functions handle snake_case → camelCase mapping
- getOrCreateDeal() is called by runner to ensure deal exists before creating report period

### UI ↔ Access Layer Contract
- Dashboard reads: getDealForProfile → getLatestReportPeriod → getReportPeriodData + getAccountBalances + getEvents
- Holdings reads: getHoldings(reportPeriodId)
- Chat includes: getReportPeriodData + getEvents + getOverflow in system prompt context

### Anthropic API Call Pattern
```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: tokenBudget,
    system: prompt.system,
    messages: [{ role: "user", content: [...documentBlocks, { type: "text", text: prompt.user }] }],
  }),
});
```
