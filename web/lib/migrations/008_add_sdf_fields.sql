-- Migration 008: Add SDF (Structured Data File) ingestion fields
-- Adds ~96 new columns across existing tables + creates clo_accruals table

-- ============================================================
-- 1.1 New columns on clo_holdings
-- ============================================================

-- Purchase/price detail
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS premium_discount_amount NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS premium_amount NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS gross_purchase_price NUMERIC;

-- Balances: funded vs unfunded vs native currency
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS unfunded_commitment NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS native_currency_balance NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS native_currency TEXT;

-- Dates
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS issue_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS next_payment_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS default_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS default_reason TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS accrual_begin_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS accrual_end_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS call_date TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS put_date TEXT;

-- Issuer-level ratings (distinct from security-level in moodys_rating/sp_rating/fitch_rating)
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_issuer_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_issuer_sr_unsec_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_issuer_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS fitch_issuer_rating TEXT;

-- Security-level ratings (from Asset Level file)
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_security_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_security_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS fitch_security_rating TEXT;

-- Derived/adjusted ratings (what's actually used for WARF/compliance)
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_rating_final TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_rating_final TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS fitch_rating_final TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_dp_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_rating_unadjusted TEXT;

-- Credit watch/outlook
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_issuer_watch TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_security_watch TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_issuer_watch TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_security_watch TEXT;

-- Seniority by agency
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS security_level_moodys TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS security_level_sp TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS security_level TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS lien_type TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_priority_category TEXT;

-- Industry codes (numeric codes, not just names)
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS sp_industry_code TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS moodys_industry_code TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS fitch_industry_code TEXT;

-- KBRA (fourth rating agency)
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS kbra_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS kbra_recovery_rate NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS kbra_industry TEXT;

-- Structural
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS pik_amount NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS credit_spread_adj NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS affiliate_id TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS guarantor TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS is_sovereign BOOLEAN;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS is_enhanced_bond BOOLEAN;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS is_current_pay BOOLEAN;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS is_interest_only BOOLEAN;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS is_principal_only BOOLEAN;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS accretion_factor NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS capitalization_pct NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS aggregate_amortized_cost NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS average_life NUMERIC;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS day_count_convention TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS payment_period TEXT;

-- Identifiers
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS cusip TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS facility_code TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS facility_id TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS figi TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Servicer
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS servicer TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS servicer_moodys_rating TEXT;
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS servicer_sp_rating TEXT;

-- Deal-specific default tracking
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS deal_defaulted_begin TEXT;

-- Provenance
ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS data_source TEXT;

-- ============================================================
-- 1.2 New columns on clo_tranche_snapshots
-- ============================================================
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS rating_moodys_issuance TEXT;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS rating_sp_issuance TEXT;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS rating_fitch_issuance TEXT;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS ic_interest NUMERIC;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS accrual_start_date TEXT;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS accrual_end_date TEXT;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS base_rate NUMERIC;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS unscheduled_principal_paydown NUMERIC;
ALTER TABLE clo_tranche_snapshots ADD COLUMN IF NOT EXISTS data_source TEXT;

-- ============================================================
-- 1.2a New columns on clo_tranches
-- ============================================================
ALTER TABLE clo_tranches ADD COLUMN IF NOT EXISTS tranche_type TEXT;
ALTER TABLE clo_tranches ADD COLUMN IF NOT EXISTS liab_prin TEXT;
ALTER TABLE clo_tranches ADD COLUMN IF NOT EXISTS legal_maturity_date TEXT;
ALTER TABLE clo_tranches ADD COLUMN IF NOT EXISTS amount_native NUMERIC;
ALTER TABLE clo_tranches ADD COLUMN IF NOT EXISTS vendor_custom_fields JSONB;

-- ============================================================
-- 1.3 New columns on clo_compliance_tests
-- ============================================================
ALTER TABLE clo_compliance_tests ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE clo_compliance_tests ADD COLUMN IF NOT EXISTS test_date TEXT;
ALTER TABLE clo_compliance_tests ADD COLUMN IF NOT EXISTS vendor_id TEXT;

-- ============================================================
-- 1.4 New columns on clo_account_balances
-- ============================================================
ALTER TABLE clo_account_balances ADD COLUMN IF NOT EXISTS account_interest NUMERIC;
ALTER TABLE clo_account_balances ADD COLUMN IF NOT EXISTS data_source TEXT;

-- ============================================================
-- 1.5 New columns on clo_trades
-- ============================================================
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS cash_flow_type TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS book_date TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS transaction_code TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS sale_reason TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS trust_account TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS figi TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS native_amount NUMERIC;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS native_currency TEXT;
ALTER TABLE clo_trades ADD COLUMN IF NOT EXISTS data_source TEXT;

-- ============================================================
-- 1.6 New table: clo_accruals
-- ============================================================
CREATE TABLE IF NOT EXISTS clo_accruals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_period_id   UUID NOT NULL REFERENCES clo_report_periods(id) ON DELETE CASCADE,
  issuer_name        TEXT,
  security_name      TEXT,
  figi               TEXT,
  loanx_id           TEXT,
  security_id        TEXT,
  accrual_rollup_id  TEXT,
  accrual_begin_date TEXT,
  accrual_end_date   TEXT,
  day_count          TEXT,
  coupon_type        TEXT,
  payment_frequency  TEXT,
  par_amount         NUMERIC,
  rate_index         TEXT,
  has_floor          BOOLEAN,
  floor_rate         NUMERIC,
  tax_rate           NUMERIC,
  all_in_rate        NUMERIC,
  spread             NUMERIC,
  adjusted_spread    NUMERIC,
  annual_interest    NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_clo_accruals_report_period
  ON clo_accruals(report_period_id);
