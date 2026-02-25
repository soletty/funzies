CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  encrypted_api_key BYTEA,
  api_key_iv BYTEA,
  api_key_prefix TEXT,
  api_key_valid BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  topic_input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error', 'cancelled')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  parsed_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  encrypted_token BYTEA NOT NULL,
  token_iv BYTEA NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS github_repo_owner TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_name TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_branch TEXT DEFAULT 'main';

ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

ALTER TABLE assemblies
  DROP CONSTRAINT IF EXISTS assemblies_status_check;

ALTER TABLE assemblies
  ADD CONSTRAINT assemblies_status_check
  CHECK (status IN ('queued', 'running', 'complete', 'error', 'cancelled', 'uploading'));

ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS share_role TEXT CHECK (share_role IN ('read', 'write'));

CREATE TABLE IF NOT EXISTS assembly_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('read', 'write')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assembly_id, user_id)
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ask-assembly', 'ask-character', 'ask-library', 'debate')),
  is_challenge BOOLEAN DEFAULT FALSE,
  context_page TEXT,
  context_section TEXT,
  highlighted_text TEXT,
  attachments JSONB DEFAULT '[]',
  response_md TEXT,
  responses JSONB DEFAULT '[]',
  insight JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Investment Committee (IC) tables
-- ============================================================

CREATE TABLE IF NOT EXISTS investor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  investment_philosophy TEXT,
  risk_tolerance TEXT CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  asset_classes JSONB DEFAULT '[]',
  current_portfolio TEXT,
  geographic_preferences TEXT,
  esg_preferences TEXT,
  decision_style TEXT,
  aum_range TEXT,
  time_horizons JSONB DEFAULT '{}',
  beliefs_and_biases TEXT,
  raw_questionnaire JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ic_committees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES investor_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'active', 'error')),
  members JSONB DEFAULT '[]',
  avatar_mappings JSONB DEFAULT '{}',
  raw_files JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ic_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES ic_committees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  opportunity_type TEXT,
  company_name TEXT,
  thesis TEXT,
  terms TEXT,
  details JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error', 'uploading')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  parsed_data JSONB DEFAULT '{}',
  dynamic_specialists JSONB DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ic_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES ic_evaluations(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask-committee'
    CHECK (mode IN ('ask-committee', 'ask-member', 'debate')),
  target_member TEXT,
  response_md TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ic_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES ic_committees(id) ON DELETE CASCADE,
  focus_area TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  parsed_data JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- CLO Credit Analysis tables
-- ============================================================

CREATE TABLE IF NOT EXISTS clo_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  fund_strategy TEXT,
  target_sectors TEXT,
  risk_appetite TEXT CHECK (risk_appetite IN ('conservative', 'moderate', 'aggressive')),
  portfolio_size TEXT,
  reinvestment_period TEXT,
  concentration_limits TEXT,
  covenant_preferences TEXT,
  rating_thresholds TEXT,
  spread_targets TEXT,
  regulatory_constraints TEXT,
  portfolio_description TEXT,
  beliefs_and_biases TEXT,
  raw_questionnaire JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clo_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES clo_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'active', 'error')),
  members JSONB DEFAULT '[]',
  avatar_mappings JSONB DEFAULT '{}',
  raw_files JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clo_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES clo_panels(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL DEFAULT 'buy' CHECK (analysis_type IN ('buy', 'switch')),
  title TEXT NOT NULL,
  borrower_name TEXT,
  sector TEXT,
  loan_type TEXT,
  spread_coupon TEXT,
  rating TEXT,
  maturity TEXT,
  facility_size TEXT,
  leverage TEXT,
  interest_coverage TEXT,
  covenants_summary TEXT,
  ebitda TEXT,
  revenue TEXT,
  company_description TEXT,
  notes TEXT,
  switch_borrower_name TEXT,
  switch_sector TEXT,
  switch_loan_type TEXT,
  switch_spread_coupon TEXT,
  switch_rating TEXT,
  switch_maturity TEXT,
  switch_facility_size TEXT,
  switch_leverage TEXT,
  switch_interest_coverage TEXT,
  switch_covenants_summary TEXT,
  switch_ebitda TEXT,
  switch_revenue TEXT,
  switch_company_description TEXT,
  switch_notes TEXT,
  documents JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error', 'uploading')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  parsed_data JSONB DEFAULT '{}',
  dynamic_specialists JSONB DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clo_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES clo_analyses(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask-panel'
    CHECK (mode IN ('ask-panel', 'ask-member', 'debate')),
  target_member TEXT,
  response_md TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_hash ON user_api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user ON user_api_tokens (user_id);

-- ============================================================
-- Monitoring / Analytics
-- ============================================================

CREATE TABLE IF NOT EXISTS ic_monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'evaluation_started', 'evaluation_phase_complete', 'evaluation_complete',
    'evaluation_error', 'parser_error', 'api_error',
    'committee_started', 'committee_complete', 'committee_error',
    'idea_started', 'idea_complete', 'idea_error'
  )),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('committee', 'evaluation', 'idea')),
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  phase TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_type ON ic_monitoring_events (event_type);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_created ON ic_monitoring_events (created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_entity ON ic_monitoring_events (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS clo_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES clo_panels(id) ON DELETE CASCADE,
  focus_area TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  parsed_data JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- Pulse Movement Detection tables
-- ============================================================

CREATE TABLE IF NOT EXISTS pulse_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  geography TEXT,
  stage TEXT NOT NULL DEFAULT 'detected'
    CHECK (stage IN ('detected', 'verified', 'growing', 'trending', 'peaked', 'declining', 'dormant')),
  key_slogans JSONB DEFAULT '[]',
  key_phrases JSONB DEFAULT '[]',
  categories JSONB DEFAULT '[]',
  estimated_size TEXT,
  momentum_score FLOAT NOT NULL DEFAULT 0
    CHECK (momentum_score >= 0 AND momentum_score <= 100),
  sentiment TEXT,
  merch_potential_score FLOAT NOT NULL DEFAULT 0
    CHECK (merch_potential_score >= 0 AND merch_potential_score <= 100),
  analysis_summary TEXT,
  raw_analysis JSONB DEFAULT '{}',
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_signal_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  peak_momentum_score FLOAT DEFAULT 0,
  peak_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_movements_stage ON pulse_movements (stage);
CREATE INDEX IF NOT EXISTS idx_pulse_movements_momentum ON pulse_movements (momentum_score DESC);

CREATE TABLE IF NOT EXISTS pulse_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error')),
  current_phase TEXT,
  raw_files JSONB DEFAULT '{}',
  signals_found INTEGER DEFAULT 0,
  movements_created INTEGER DEFAULT 0,
  movements_updated INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pulse_scans_status ON pulse_scans (status);

CREATE TABLE IF NOT EXISTS pulse_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID REFERENCES pulse_movements(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES pulse_scans(id) ON DELETE SET NULL,
  source TEXT NOT NULL
    CHECK (source IN ('reddit', 'gdelt', 'bluesky', 'wikipedia', 'news', 'mastodon')),
  source_id TEXT,
  title TEXT,
  content TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}',
  relevance_score FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_signals_dedup ON pulse_signals (source, source_id, movement_id);
CREATE INDEX IF NOT EXISTS idx_pulse_signals_source ON pulse_signals (source);
CREATE INDEX IF NOT EXISTS idx_pulse_signals_movement ON pulse_signals (movement_id);
CREATE INDEX IF NOT EXISTS idx_pulse_signals_scan ON pulse_signals (scan_id);
