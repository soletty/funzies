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
