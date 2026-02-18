# Intellectual Assembly: Web Product Plan

## Context

The Intellectual Assembly is currently a local CLI tool that spawns `claude` CLI processes to generate structured adversarial debates between 6 AI characters with incompatible frameworks. It produces character profiles, multi-round debate transcripts, cross-character synthesis, reference libraries, deliverables, and 4 verification reports — all viewable in a polished local web UI with interactive follow-ups.

**Goal:** Turn this into a web product where anyone can sign up, connect their Anthropic API key, and run assemblies from the browser. Full feature parity with the local tool.

---

## Architecture Overview

```
Browser <──SSE──> Next.js App (Vercel)
                       |
              ┌────────┴────────┐
              |                 |
        PostgreSQL           Redis
        (Neon/Supabase)    (Upstash)
              |                 |
              └────────┬────────┘
                       |
                Worker Service
                (Railway/Fly.io)
                       |
                Anthropic API
```

**Why two services:** Assembly generation takes ~10 minutes (7 sequential Claude API calls). Vercel functions timeout at 300s. Follow-ups (single API calls, 15-60s) run fine in Next.js API routes. Only assembly generation needs a dedicated worker.

**How they communicate:** Worker writes phase results to Postgres and publishes progress events to Redis pub/sub. Next.js SSE endpoint subscribes to the Redis channel and forwards events to the browser.

---

## Auth & API Key Management

Anthropic doesn't support third-party OAuth. BYOK flow with polished UX:

1. User signs up with email/password or Google OAuth (NextAuth.js)
2. Guided "Connect your API key" page with step-by-step instructions + link to Anthropic console
3. Key is validated immediately against `GET https://api.anthropic.com/v1/models`
4. Stored encrypted with AES-256-GCM (server-side `ENCRYPTION_KEY` env var)
5. Only display prefix stored (e.g., `sk-ant-...abc`)
6. Decrypted on-demand when making API calls, never sent to the browser

---

## Database Schema (PostgreSQL)

**Tables:** `users`, `api_keys`, `assemblies`, `characters`, `iterations`, `syntheses`, `deliverables`, `verification_reports`, `reference_libraries`, `follow_ups`, `generation_jobs`, `uploads`

Key design decisions:
- Store **both** raw markdown and parsed JSONB for each content type (raw for export, parsed for fast rendering)
- JSONB for nested arrays (positions, convergence points, debate rounds) — avoids over-normalization since queries are always "load everything for this assembly"
- `generation_jobs` table for job queue (worker polls every 2s with `SELECT ... FOR UPDATE SKIP LOCKED`)

### Core Tables

```sql
-- Users and authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_key BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  key_prefix TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assemblies (the core entity)
CREATE TABLE assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT,
  topic_input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'partial', 'error', 'cancelled')),
  current_phase TEXT,
  completed_phases TEXT[] DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, slug)
);

-- Characters (6 per assembly)
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  tag TEXT,
  biography TEXT,
  framework TEXT,
  framework_name TEXT,
  specific_positions JSONB DEFAULT '[]',
  blind_spot TEXT,
  heroes JSONB DEFAULT '[]',
  rhetorical_tendencies TEXT,
  relationships JSONB DEFAULT '[]',
  full_profile_md TEXT NOT NULL,
  UNIQUE(assembly_id, number)
);

-- Debate iterations
CREATE TABLE iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  structure TEXT NOT NULL,
  transcript_md TEXT,
  synthesis_md TEXT,
  synthesis_parsed JSONB,
  rounds JSONB DEFAULT '[]',
  UNIQUE(assembly_id, number)
);

-- Main synthesis (one per assembly)
CREATE TABLE syntheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID UNIQUE NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  raw_md TEXT NOT NULL,
  title TEXT,
  convergence JSONB DEFAULT '[]',
  divergence JSONB DEFAULT '[]',
  emergent_ideas JSONB DEFAULT '[]',
  knowledge_gaps JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  unexpected_alliances JSONB DEFAULT '[]',
  sections JSONB DEFAULT '[]'
);

-- Deliverables
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  UNIQUE(assembly_id, slug)
);

-- Verification reports
CREATE TABLE verification_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  UNIQUE(assembly_id, report_type)
);

-- Reference library
CREATE TABLE reference_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID UNIQUE NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  raw_md TEXT NOT NULL,
  sections JSONB DEFAULT '[]',
  cross_readings JSONB DEFAULT '[]'
);

-- Follow-ups
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  question TEXT NOT NULL,
  context_page TEXT,
  context_section TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('ask-assembly', 'ask-character', 'ask-library', 'debate')),
  is_challenge BOOLEAN DEFAULT FALSE,
  highlighted_text TEXT,
  responses JSONB DEFAULT '[]',
  raw_response_md TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job queue
CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error', 'cancelled')),
  current_phase TEXT,
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File uploads
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  assembly_id UUID REFERENCES assemblies(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Assembly Generation Pipeline (Worker)

Decomposes the monolithic skill prompt into 7 phase-specific Anthropic API calls:

```
Phase 0: Domain Analysis → Phase 1: Characters → Phase 2: References
    → Phase 3: Debate → Phase 4: Synthesis → Phase 5: Deliverable → Phase 6: Verification
```

Each phase:
1. Gets a purpose-built system prompt + context from all prior phases
2. Streams response via Anthropic SDK
3. Parses output using existing parsers (reused from `src/parser/`)
4. Persists to Postgres
5. Broadcasts `phase_complete` event via Redis pub/sub

**Error recovery:** Results are saved after each phase. If worker crashes during Phase 5, retry resumes from Phase 5 using prior results from DB.

**Clarifying questions:** Phase 0 can output structured JSON requesting a clarification. Worker pauses, broadcasts question to browser, waits for user response via API endpoint, then resumes.

### Worker Orchestration Pattern

```typescript
async function runAssemblyPipeline(job: GenerationJob): Promise<void> {
  const apiKey = await decryptUserApiKey(job.userId);
  const anthropic = new Anthropic({ apiKey });
  const broadcast = (event: object) => redis.publish(`assembly:${job.assemblyId}`, JSON.stringify(event));

  // Phase 0: Domain Analysis
  broadcast({ type: "phase", phase: "analysis" });
  const analysis = await executePhase("analysis", ANALYSIS_PROMPT, job.topic, apiKey, ...);

  // Phase 1: Characters
  broadcast({ type: "phase", phase: "characters" });
  const characters = await executePhase("characters", CHARACTERS_PROMPT,
    `Topic: ${job.topic}\n\nDomain Analysis:\n${analysis.rawMarkdown}`, apiKey, ...);
  const parsed = parseCharactersFromMarkdown(characters.rawMarkdown);
  await db.characters.bulkInsert(job.assemblyId, parsed);
  broadcast({ type: "phase_complete", phase: "characters" });

  // ... Phase 2-6 follow same pattern, each receiving prior phases as context
}
```

---

## Follow-Up System

Runs in Next.js API routes (no worker needed — single API call, 15-60s):

1. Load assembly context from Postgres
2. Build prompt using extracted functions from `follow-up.ts`
3. Call Anthropic API with user's decrypted key
4. Stream response back via SSE
5. Persist completed follow-up to Postgres

All 4 modes preserved: `ask-assembly`, `ask-character`, `ask-library`, `debate` + challenge mode + highlight-to-chat.

---

## API Design

### Authentication
```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

### API Key Management
```
POST   /api/keys              — Store encrypted API key
GET    /api/keys              — List keys (prefix only)
DELETE /api/keys/:id          — Remove a key
POST   /api/keys/:id/validate — Test against Anthropic API
```

### Assembly CRUD
```
GET    /api/assemblies                — List user's assemblies
POST   /api/assemblies                — Create + start generation
GET    /api/assemblies/:id            — Get assembly with all content
DELETE /api/assemblies/:id            — Delete assembly (cascade)
GET    /api/assemblies/:id/export     — Export as single HTML file
GET    /api/assemblies/:id/stream     — SSE: generation progress
```

### Assembly Content
```
GET    /api/assemblies/:id/characters
GET    /api/assemblies/:id/synthesis
GET    /api/assemblies/:id/iterations
GET    /api/assemblies/:id/deliverables
GET    /api/assemblies/:id/verification
GET    /api/assemblies/:id/reference-library
```

### Follow-ups
```
POST   /api/assemblies/:id/follow-ups  — Submit (streams SSE response)
GET    /api/assemblies/:id/follow-ups  — List all
DELETE /api/assemblies/:id/follow-ups/:fuId
```

### File Uploads
```
POST   /api/uploads                    — Upload file (multipart)
```

---

## Frontend (Next.js App Router)

### React Components (from html.ts decomposition)

| Current Function | React Component | Priority |
|---|---|---|
| `renderWorkspaceIndex` | `Dashboard.tsx` | P1 |
| `renderAssemblyLauncher` | `AssemblyLauncher.tsx` | P1 |
| `renderSynthesis` | `SynthesisPage.tsx` | P1 |
| `renderFollowUpSection` | `FollowUpSection.tsx` | P1 |
| `renderCharacterGrid` | `CharacterGrid.tsx` | P2 |
| `renderCharacterProfile` | `CharacterProfile.tsx` | P2 |
| `renderIteration` | `IterationPage.tsx` | P2 |
| `renderDeliverables` | `DeliverablesPage.tsx` | P2 |
| `renderVerification` | `VerificationPage.tsx` | P2 |
| `renderStructuredReferenceLibrary` | `ReferenceLibrary.tsx` | P2 |
| `renderTrajectory` | `TrajectoryPage.tsx` | P2 |
| `renderHighlightChatPanel` | `HighlightChatPanel.tsx` | P2 |

### CSS Strategy
Import existing `styles.css` (~1400 lines, "Warm Editorial Light" theme) as global CSS. Uses CSS custom properties — works in React with zero changes.

---

## Migration: Reuse vs Rewrite

### Reuse directly (copy into shared package)
- `src/types.ts` — Full type system (165 lines)
- `src/parser/characters.ts` — Markdown → Character[] parser
- `src/parser/transcript.ts` — Markdown → DebateRound[] parser
- `src/parser/synthesis.ts` — Markdown → Synthesis parser
- `src/parser/reference-library.ts` — Markdown → ReferenceLibrary parser
- `src/server/follow-up.ts` — Prompt builder functions only
- `src/export/index.ts` — Export logic (adapt data source)

### Rewrite as React components
- `src/renderer/html.ts` — 2200 lines → ~15 React components

### Delete (replaced by new architecture)
- `src/cli.ts`, `src/scanner/`, `src/graph/`, `src/renderer/index.ts`
- `src/server/index.ts`, `src/server/assembly-session.ts`, `src/server/rebuild.ts`

---

## Monorepo Structure

```
apps/
  web/             — Next.js frontend + API routes (Vercel)
  worker/          — Assembly generation pipeline (Railway)
packages/
  shared/          — Types, parsers, prompt builders, DB schema
```

Managed with Turborepo.

---

## Deployment

| Component | Platform | Cost |
|---|---|---|
| Next.js app | Vercel | Free tier → Pro ($20/mo) |
| Worker | Railway | ~$5/mo |
| PostgreSQL | Neon or Supabase | Free tier |
| Redis | Upstash | Free tier |
| File storage | Cloudflare R2 | Free tier |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Initialize Next.js + Turborepo monorepo
- PostgreSQL schema migrations
- Auth (NextAuth.js: email/password + Google)
- API key management (encrypt/store/validate)
- Dashboard page (empty state)
- Import global CSS theme
- Deploy to Vercel + Neon

### Phase 2: Follow-ups First (Week 2-3)
- Copy parsers and types into shared package
- Seed script: import demo assembly from markdown → Postgres
- Build SynthesisPage + FollowUpSection components
- `POST /api/assemblies/:id/follow-ups` using extracted prompts
- Test all 4 modes + challenge mode end-to-end

### Phase 3: Assembly Generation (Week 3-5)
- Set up Upstash Redis
- Build worker service with 7 phase-specific prompts
- AssemblyLauncher component with progress bar + SSE
- `GET /api/assemblies/:id/stream` SSE endpoint
- Deploy worker to Railway
- End-to-end: topic → generation → completed assembly

### Phase 4: Remaining Pages (Week 5-6)
- CharacterGrid, CharacterProfile, IterationPage
- DeliverablesPage, VerificationPage, ReferenceLibrary
- TrajectoryPage, navigation sidebar, export
- Assembly overview (topic landing)

### Phase 5: Polish (Week 6-7)
- Rate limiting, error handling, retry logic
- Mobile responsive testing
- Loading states, skeleton screens, error boundaries
- Delete assembly/follow-up flows

### Phase 6: Growth Features (Week 7+)
- Public sharing links (read-only assembly URLs)
- Model selection (Sonnet vs Opus)
- Email notification when assembly completes
- Landing page with demo assembly showcase
- Assembly templates / suggested topics
