-- Intex DealCF-MV+ scenario inputs (rows 32-72 of the export). Stored at deal
-- level since they describe the projection scenario, not a single period.
-- Schema lives in web/lib/clo/intex/parse-past-cashflows.ts (IntexAssumptions).
ALTER TABLE clo_deals ADD COLUMN IF NOT EXISTS intex_assumptions JSONB;
