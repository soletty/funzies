-- Per-position rating supplement table for the Intex DealCF positions CSV.
-- Sidecar to clo_holdings: SDF columns stay untouched; resolver merges the
-- two sources via lxid → isin → facility_id lookup at resolution time.
--
-- Carries the rating channels SDF doesn't (credit estimates / private letter
-- ratings tagged via *_designation) plus derived recovery rates as a
-- competing source for KI-32 (filed as separate candidate KI).
--
-- Identifier columns are split (anti-pattern #5): three nullable columns
-- with a CHECK constraint requiring at least one. Lookup tries each in
-- order in the resolver; per-column format invariants validated at the
-- parser boundary.

CREATE TABLE IF NOT EXISTS clo_intex_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_period_id UUID NOT NULL REFERENCES clo_report_periods(id) ON DELETE CASCADE,
  -- Heterogeneous identifiers — at least one populated (CHECK below).
  lxid TEXT,
  isin TEXT,
  facility_id TEXT,
  -- Cross-check field: par from Intex ≈ Σ matching SDF holdings.par_balance
  -- on resolver-side; divergence emits warn-level data-quality warning.
  par NUMERIC(20,2),
  -- Moody's channels
  moody_issue_rating TEXT,
  moody_issuer_rating TEXT,
  moody_senior_secured_rating TEXT,
  moody_derived_default_prob_rating TEXT,
  moody_derived_warf_rating TEXT,
  moody_issue_rating_designation TEXT,
  -- S&P channels
  sp_issue_rating TEXT,
  sp_issuer_rating TEXT,
  sp_derived_rating TEXT,
  sp_issue_rating_designation TEXT,
  -- Fitch channels
  fitch_issue_rating TEXT,
  fitch_issuer_rating TEXT,
  fitch_derived_rating TEXT,
  fitch_issue_rating_designation TEXT,
  -- Recovery rates (KI-32 competing source — filed as candidate KI)
  moody_derived_recovery_rate NUMERIC(6,3),
  fitch_derived_recovery_rate NUMERIC(6,3),
  sp_derived_recovery_rate NUMERIC(6,3),
  is_defaulted BOOLEAN,
  source_file TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clo_intex_positions_at_least_one_id
    CHECK (lxid IS NOT NULL OR isin IS NOT NULL OR facility_id IS NOT NULL)
);

-- Partial unique indexes on (period, identifier) per identifier column.
-- Ingest path already DELETE-then-INSERTs per period (sdf/ingest.ts), so the
-- table is idempotent at the period level. These indexes catch the second-
-- order failure: an Intex CSV that emits the same identifier on two rows
-- within a single period — silent collision in the resolver's Map (last
-- writer wins) without this constraint. Failing loud at the parser boundary
-- is the boundary-asserts-invariant shape (anti-pattern #5).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clo_intex_positions_period_lxid_unique
  ON clo_intex_positions(report_period_id, lxid) WHERE lxid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clo_intex_positions_period_isin_unique
  ON clo_intex_positions(report_period_id, isin) WHERE isin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clo_intex_positions_period_facility_unique
  ON clo_intex_positions(report_period_id, facility_id) WHERE facility_id IS NOT NULL;
