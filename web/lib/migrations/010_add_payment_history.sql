CREATE TABLE IF NOT EXISTS clo_payment_history (
  id                       BIGSERIAL PRIMARY KEY,
  profile_id               UUID NOT NULL REFERENCES clo_profiles(id) ON DELETE CASCADE,
  class_name               TEXT NOT NULL,
  payment_date             DATE NOT NULL,
  period                   INTEGER,
  par_commitment           NUMERIC,
  factor                   NUMERIC,
  interest_paid            NUMERIC,
  principal_paid           NUMERIC,
  cashflow                 NUMERIC,
  ending_balance           NUMERIC,
  interest_shortfall       NUMERIC,
  accum_interest_shortfall NUMERIC,
  transaction_type         TEXT GENERATED ALWAYS AS (
    CASE
      WHEN period IS NULL OR period = 0 THEN 'SALE'
      WHEN COALESCE(interest_paid, 0) = 0 AND COALESCE(principal_paid, 0) = 0 THEN 'NO_PAYMENT'
      WHEN ending_balance = 0 AND COALESCE(principal_paid, 0) > 0 THEN 'REDEMPTION'
      WHEN COALESCE(interest_paid, 0) > 0 AND COALESCE(principal_paid, 0) > 0 THEN 'INTEREST_AND_PRINCIPAL_PAYMENT'
      WHEN COALESCE(principal_paid, 0) > 0 THEN 'PRINCIPAL_PAYMENT'
      WHEN COALESCE(interest_paid, 0) > 0 THEN 'INTEREST_PAYMENT'
      ELSE 'NO_PAYMENT'
    END
  ) STORED,
  extracted_value          JSONB NOT NULL,
  override_value           JSONB,
  override_reason          TEXT,
  overridden_by            TEXT,
  overridden_at            TIMESTAMPTZ,
  source_period_id         UUID REFERENCES clo_report_periods(id),
  last_seen_period_id      UUID REFERENCES clo_report_periods(id),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id, class_name, payment_date)
);

CREATE INDEX IF NOT EXISTS idx_payment_history_profile_date
  ON clo_payment_history (profile_id, payment_date);
