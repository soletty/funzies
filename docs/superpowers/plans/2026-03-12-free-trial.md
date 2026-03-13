# Free Trial System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let new users try 1 free assembly + 5 interactions without providing an API key, powered by a shared platform key.

**Architecture:** Add `free_trial_used` to users table, `is_free_trial` + `trial_interactions_used` to assemblies table. Create a `lib/trial.ts` module that resolves the API key (BYOK or platform fallback). Update assembly creation, worker, interaction routes, and frontend to support the trial path.

**Tech Stack:** Next.js 16, PostgreSQL, TypeScript, AES-256-GCM encryption (existing)

**Spec:** `docs/superpowers/specs/2026-03-12-free-trial-design.md`

---

## Chunk 1: Database + API Key Resolution

### Task 1: Database Migration

**Files:**
- Modify: `web/lib/schema.sql` (append at end)

- [ ] **Step 1: Add trial columns to schema.sql**

Append to the end of `web/lib/schema.sql`:

```sql
-- ============================================================
-- Free Trial System
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS free_trial_used BOOLEAN DEFAULT FALSE;

ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS trial_interactions_used INTEGER DEFAULT 0;
```

- [ ] **Step 2: Run migration against the database**

```bash
# From web/ directory — run just the new ALTER statements
cd web && npx tsx -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_trial_used BOOLEAN DEFAULT FALSE\`);
  await pool.query(\`ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN DEFAULT FALSE\`);
  await pool.query(\`ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS trial_interactions_used INTEGER DEFAULT 0\`);
  await pool.end();
  console.log('Migration complete');
"
```

Or run the full `schema.sql` if preferred — the `IF NOT EXISTS` guards make it idempotent.

- [ ] **Step 3: Commit**

```bash
git add web/lib/schema.sql
git commit -m "schema: add free trial columns to users and assemblies"
```

---

### Task 2: Create `lib/trial.ts` — API Key Resolution

**Files:**
- Create: `web/lib/trial.ts`
- Reference: `web/lib/crypto.ts` (for `decryptApiKey`)
- Reference: `web/lib/db.ts` (for `query`)

This module is the single source of truth for resolving an API key for a user. It works in both Vercel (Next.js API routes) and Railway (worker) contexts because it uses the shared `query` function from `lib/db.ts`.

- [ ] **Step 1: Create `web/lib/trial.ts`**

```typescript
import { decryptApiKey } from "./crypto";
import { query } from "./db";

const FREE_TRIAL_INTERACTION_LIMIT = 5;

interface ApiKeyResult {
  apiKey: string;
  isTrial: boolean;
}

export async function getApiKeyForUser(userId: string): Promise<ApiKeyResult> {
  const rows = await query<{
    encrypted_api_key: Buffer | null;
    api_key_iv: Buffer | null;
    free_trial_used: boolean;
  }>(
    "SELECT encrypted_api_key, api_key_iv, free_trial_used FROM users WHERE id = $1",
    [userId]
  );

  if (!rows.length) {
    throw new Error("User not found");
  }

  const user = rows[0];

  // BYOK path — user has their own key
  if (user.encrypted_api_key && user.api_key_iv) {
    return {
      apiKey: decryptApiKey(user.encrypted_api_key, user.api_key_iv),
      isTrial: false,
    };
  }

  // Trial path — check if user has an active trial assembly (queued/running)
  // This is needed because free_trial_used is set to true at creation time,
  // but the worker and interaction routes still need the platform key.
  const activeTrial = await query<{ id: string }>(
    `SELECT id FROM assemblies
     WHERE user_id = $1 AND is_free_trial = true AND status IN ('queued', 'running', 'complete')
     LIMIT 1`,
    [userId]
  );

  if (activeTrial.length > 0) {
    const platformKey = process.env.PLATFORM_API_KEY;
    if (!platformKey) {
      throw new Error("Free trial unavailable — please add your API key");
    }
    return { apiKey: platformKey, isTrial: true };
  }

  // No BYOK key and no active trial — check if trial is available
  if (!user.free_trial_used) {
    const platformKey = process.env.PLATFORM_API_KEY;
    if (!platformKey) {
      throw new Error("Free trial unavailable — please add your API key");
    }
    return { apiKey: platformKey, isTrial: true };
  }

  throw new Error("Free trial exhausted — add your API key to continue");
}

export async function claimFreeTrial(userId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    "UPDATE users SET free_trial_used = true WHERE id = $1 AND free_trial_used = false RETURNING id",
    [userId]
  );
  return result.length > 0;
}

export async function resetFreeTrial(userId: string): Promise<void> {
  await query(
    "UPDATE users SET free_trial_used = false WHERE id = $1",
    [userId]
  );
}

export async function claimTrialInteraction(assemblyId: string): Promise<{ remaining: number } | null> {
  const result = await query<{ trial_interactions_used: number }>(
    `UPDATE assemblies SET trial_interactions_used = trial_interactions_used + 1
     WHERE id = $1 AND is_free_trial = true AND trial_interactions_used < $2
     RETURNING trial_interactions_used`,
    [assemblyId, FREE_TRIAL_INTERACTION_LIMIT]
  );

  if (!result.length) return null;

  return { remaining: FREE_TRIAL_INTERACTION_LIMIT - result[0].trial_interactions_used };
}

export async function getTrialStatus(userId: string): Promise<{
  hasApiKey: boolean;
  freeTrialUsed: boolean;
  freeTrialAvailable: boolean;
}> {
  const rows = await query<{
    api_key_prefix: string | null;
    free_trial_used: boolean;
  }>(
    "SELECT api_key_prefix, free_trial_used FROM users WHERE id = $1",
    [userId]
  );

  if (!rows.length) {
    return { hasApiKey: false, freeTrialUsed: true, freeTrialAvailable: false };
  }

  const hasApiKey = !!rows[0].api_key_prefix;
  const freeTrialUsed = rows[0].free_trial_used;

  return {
    hasApiKey,
    freeTrialUsed,
    freeTrialAvailable: !hasApiKey && !freeTrialUsed,
  };
}

export { FREE_TRIAL_INTERACTION_LIMIT };
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/trial.ts
git commit -m "feat: add trial.ts — API key resolution with free trial fallback"
```

---

## Chunk 2: Backend Route Changes

### Task 3: Update Assembly Creation Route

**Files:**
- Modify: `web/app/api/assemblies/route.ts`

The current POST handler queues assemblies without checking for an API key. Add a gate that allows creation if the user has BYOK OR an available free trial.

- [ ] **Step 1: Update the POST handler**

Add imports at top of file:

```typescript
import { getApiKeyForUser, claimFreeTrial } from "@/lib/trial";
```

Replace the POST handler body (after auth check and topicInput validation) to add the trial gate. Between the `topicInput` validation and the slug generation, add:

```typescript
  // Check if user can create an assembly (has API key or free trial available)
  try {
    const { isTrial } = await getApiKeyForUser(user.id);
    if (isTrial) {
      const claimed = await claimFreeTrial(user.id);
      if (!claimed) {
        return NextResponse.json(
          { error: "Free trial already used. Please add your API key to continue." },
          { status: 403 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Please add your API key to create assemblies." },
      { status: 403 }
    );
  }
```

In the INSERT query, add `is_free_trial` — pass `isTrial` as a parameter. To do this, extract `isTrial` to a variable before the try block:

The full updated POST handler should be:

```typescript
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const topicInput = body.topicInput?.trim();

  if (!topicInput) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  let isTrialAssembly = false;
  try {
    const { isTrial } = await getApiKeyForUser(user.id);
    isTrialAssembly = isTrial;
    if (isTrial) {
      const claimed = await claimFreeTrial(user.id);
      if (!claimed) {
        return NextResponse.json(
          { error: "Free trial already used. Please add your API key to continue." },
          { status: 403 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Please add your API key to create assemblies." },
      { status: 403 }
    );
  }

  const slug = generateSlug(topicInput);
  const githubRepoOwner = body.githubRepoOwner || null;
  const githubRepoName = body.githubRepoName || null;
  const githubRepoBranch = body.githubRepoBranch || "main";
  const initialStatus = body.hasFiles ? "uploading" : "queued";

  const rows = await query<{ id: string; slug: string }>(
    `INSERT INTO assemblies (id, user_id, slug, topic_input, status, github_repo_owner, github_repo_name, github_repo_branch, is_free_trial)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, slug`,
    [user.id, slug, topicInput, initialStatus, githubRepoOwner, githubRepoName, githubRepoBranch, isTrialAssembly]
  );

  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/api/assemblies/route.ts
git commit -m "feat: gate assembly creation on API key or free trial availability"
```

---

### Task 4: Update Worker to Use `getApiKeyForUser`

**Files:**
- Modify: `web/worker/index.ts`

Only change the assembly `processJob` function. IC and CLO pipelines stay on `getUserApiKey` (BYOK-only).

- [ ] **Step 1: Add import**

Add at the top of `worker/index.ts`:

```typescript
import { getApiKeyForUser, resetFreeTrial } from "../lib/trial.js";
```

- [ ] **Step 2: Update `processJob` to use `getApiKeyForUser`**

In `processJob` (around line 125), replace:

```typescript
  const { encrypted, iv } = await getUserApiKey(job.user_id);
  const apiKey = decryptApiKey(encrypted, iv);
```

With:

```typescript
  const { apiKey } = await getApiKeyForUser(job.user_id);
```

- [ ] **Step 3: Add free trial error recovery**

In the `processJob` error handler in the poll loop (around line 984-996), add trial recovery after the error status is set. Replace the catch block:

```typescript
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          console.error(`[worker] Job ${job.id} failed: ${message}`);
          await pool.query(
            `UPDATE assemblies SET status = 'error', error_message = $1 WHERE id = $2`,
            [message, job.id]
          );
          if (message.includes("Invalid API key")) {
            await pool.query(
              "UPDATE users SET api_key_valid = false WHERE id = $1",
              [job.user_id]
            );
          }
          // Reset free trial if this was a trial assembly that failed
          const trialCheck = await pool.query(
            "SELECT is_free_trial FROM assemblies WHERE id = $1",
            [job.id]
          );
          if (trialCheck.rows[0]?.is_free_trial) {
            await resetFreeTrial(job.user_id);
            await pool.query("DELETE FROM assemblies WHERE id = $1", [job.id]);
            console.log(`[worker] Reset free trial for user ${job.user_id} after assembly failure`);
          }
        }
```

- [ ] **Step 4: Commit**

```bash
git add web/worker/index.ts
git commit -m "feat: worker uses getApiKeyForUser for assemblies, resets trial on failure"
```

---

### Task 5: Update Assembly Follow-up Route

**Files:**
- Modify: `web/app/api/assemblies/[id]/follow-ups/route.ts`

Replace the direct API key lookup with trial-aware resolution + interaction counting.

- [ ] **Step 1: Update imports**

Add at top:

```typescript
import { getApiKeyForUser, claimTrialInteraction } from "@/lib/trial";
```

- [ ] **Step 2: Replace the API key resolution block**

In the POST handler, replace lines 91-100 (the `userRows` query and check):

```typescript
  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);
```

With:

```typescript
  // Check trial interaction limits
  const assemblyMeta = await query<{ is_free_trial: boolean }>(
    "SELECT is_free_trial FROM assemblies WHERE id = $1",
    [assemblyId]
  );
  if (assemblyMeta.length && assemblyMeta[0].is_free_trial) {
    const result = await claimTrialInteraction(assemblyId);
    if (!result) {
      return NextResponse.json(
        { error: "Free trial interaction limit reached. Add your API key to continue." },
        { status: 403 }
      );
    }
  }

  let apiKey: string;
  try {
    const resolved = await getApiKeyForUser(user.id);
    apiKey = resolved.apiKey;
  } catch {
    return NextResponse.json(
      { error: "Please add your API key to continue." },
      { status: 403 }
    );
  }
```

Also remove the now-unused `decryptApiKey` import if it's no longer used elsewhere in the file. Check: `decryptApiKey` is not used anywhere else in this file, so remove it from imports.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/assemblies/[id]/follow-ups/route.ts
git commit -m "feat: follow-up route uses trial-aware API key resolution"
```

---

### Task 6: Update Deliverables Route

**Files:**
- Modify: `web/app/api/assemblies/[id]/deliverables/route.ts`

Same pattern as the follow-up route — this counts as a trial interaction too.

- [ ] **Step 1: Update imports**

Add:

```typescript
import { getApiKeyForUser, claimTrialInteraction } from "@/lib/trial";
```

- [ ] **Step 2: Replace API key resolution block**

Replace lines 73-82:

```typescript
  const userRows = await query<{ encrypted_api_key: Buffer; api_key_iv: Buffer }>(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [user.id]
  );

  if (!userRows.length || !userRows[0].encrypted_api_key) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const apiKey = decryptApiKey(userRows[0].encrypted_api_key, userRows[0].api_key_iv);
```

With:

```typescript
  // Check trial interaction limits
  const assemblyMeta = await query<{ is_free_trial: boolean }>(
    "SELECT is_free_trial FROM assemblies WHERE id = $1",
    [assemblyId]
  );
  if (assemblyMeta.length && assemblyMeta[0].is_free_trial) {
    const result = await claimTrialInteraction(assemblyId);
    if (!result) {
      return NextResponse.json(
        { error: "Free trial interaction limit reached. Add your API key to continue." },
        { status: 403 }
      );
    }
  }

  let apiKey: string;
  try {
    const resolved = await getApiKeyForUser(user.id);
    apiKey = resolved.apiKey;
  } catch {
    return NextResponse.json(
      { error: "Please add your API key to continue." },
      { status: 403 }
    );
  }
```

Remove unused `decryptApiKey` import.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/assemblies/[id]/deliverables/route.ts
git commit -m "feat: deliverables route uses trial-aware API key resolution"
```

---

## Chunk 3: Frontend Changes

### Task 7: Update Keys API to Return Trial Status

**Files:**
- Modify: `web/app/api/keys/route.ts`

The GET endpoint currently returns 404 if no key is stored. Update it to also return trial status so the frontend knows whether to show the trial path or the "add key" gate.

- [ ] **Step 1: Update the GET handler**

Add import:

```typescript
import { getTrialStatus } from "@/lib/trial";
```

Replace the GET handler. Note: `getTrialStatus` already queries the user row, so we consolidate into a single function that returns everything we need:

```typescript
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    api_key_prefix: string | null;
    api_key_valid: boolean | null;
    free_trial_used: boolean;
  }>(
    "SELECT api_key_prefix, api_key_valid, free_trial_used FROM users WHERE id = $1",
    [user.id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const row = rows[0];
  const hasApiKey = !!row.api_key_prefix;

  return NextResponse.json({
    prefix: row.api_key_prefix,
    valid: row.api_key_valid,
    hasApiKey,
    freeTrialAvailable: !hasApiKey && !row.free_trial_used,
    freeTrialUsed: row.free_trial_used,
  });
}
```

This replaces both the old 404 behavior and the `getTrialStatus` import. The endpoint now always returns 200 with the full status, which simplifies frontend consumers. Remove the `getTrialStatus` import since it's no longer used here.

- [ ] **Step 2: Commit**

```bash
git add web/app/api/keys/route.ts
git commit -m "feat: keys GET endpoint returns trial status"
```

---

### Task 8: Update Dashboard — Remove API Key Gate for Trial Users

**Files:**
- Modify: `web/app/page.tsx`

Currently, users without `api_key_prefix` are redirected to `/onboarding`. Change this to also allow users with an available free trial.

- [ ] **Step 1: Update the dashboard query and redirect logic**

Replace lines 31-38:

```typescript
  const userRows = await query<{ api_key_valid: boolean | null; api_key_prefix: string | null }>(
    "SELECT api_key_valid, api_key_prefix FROM users WHERE id = $1",
    [userId]
  );

  if (!userRows[0]?.api_key_prefix) {
    redirect("/onboarding");
  }
```

With:

```typescript
  const userRows = await query<{
    api_key_valid: boolean | null;
    api_key_prefix: string | null;
    free_trial_used: boolean;
  }>(
    "SELECT api_key_valid, api_key_prefix, free_trial_used FROM users WHERE id = $1",
    [userId]
  );

  const hasApiKey = !!userRows[0]?.api_key_prefix;
  const freeTrialAvailable = !hasApiKey && !userRows[0]?.free_trial_used;

  if (!hasApiKey && !freeTrialAvailable) {
    redirect("/onboarding");
  }
```

- [ ] **Step 2: Update the warning banner**

Replace the warning banner block (lines 68-72):

```typescript
      {user.api_key_valid === false && (
        <div className="api-key-warning">
          Your API key is no longer valid. <a href="/onboarding">Update it</a> to continue using Million Minds.
        </div>
      )}
```

With:

```typescript
      {userRows[0]?.api_key_valid === false && hasApiKey && (
        <div className="api-key-warning">
          Your API key is no longer valid. <a href="/onboarding">Update it</a> to continue using Million Minds.
        </div>
      )}
      {freeTrialAvailable && (
        <div className="api-key-warning" style={{ borderColor: "var(--color-high)" }}>
          Free trial — 1 panel + 5 interactions. <a href="/onboarding">Add your API key</a> for unlimited access.
        </div>
      )}
```

Also remove line 40 (`const user = userRows[0];`) since the banner code now references `userRows[0]` directly and the `user` variable is no longer used.

- [ ] **Step 3: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: dashboard allows trial users, shows trial banner"
```

---

### Task 9: Update Onboarding Page — Add "Skip" for Trial Users

**Files:**
- Modify: `web/app/onboarding/page.tsx`

Add a "Try free first" option for users who haven't used their trial yet.

- [ ] **Step 1: Add trial check and skip button**

Add a `useEffect` to check trial status and a skip option. Update the component:

Update the React import to include `useEffect`:

```typescript
import { useState, useEffect } from "react";
```

After the `router` declaration (line 12), add the trial state and effect:

```typescript
  const [trialAvailable, setTrialAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data) => {
        if (data.hasApiKey) {
          router.push("/");
          router.refresh();
        } else if (data.freeTrialAvailable) {
          setTrialAvailable(true);
        }
      })
      .catch(() => {});
  }, [router]);
```

Then, after the guide section (before the closing `</div>` of the flex column), add:

```typescript
          {trialAvailable && !success && (
            <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
              <button
                onClick={() => { router.push("/"); router.refresh(); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: "0.85rem",
                  padding: "0.25rem 0",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
              >
                Skip — try a free panel first
              </button>
            </div>
          )}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/onboarding/page.tsx
git commit -m "feat: onboarding shows skip option for trial-eligible users"
```

---

### Task 10: Update Landing Page Copy

**Files:**
- Modify: `web/app/page.tsx`

Update the landing page colophon to mention free trial instead of just "Bring your own API key."

- [ ] **Step 1: Update the colophon text**

Replace line 152:

```typescript
            Bring your own Anthropic API key &middot; Full panel in ~5 minutes
```

With:

```typescript
            Try your first panel free &middot; No API key required &middot; Full panel in ~5 minutes
```

- [ ] **Step 2: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: landing page mentions free trial"
```

---

## Chunk 4: Trial Exhaustion UX

### Task 11: Show Remaining Interactions on Free Trial Assembly

**Files:**
- Modify: `web/app/api/assemblies/[id]/route.ts` (the assembly detail endpoint already uses `SELECT *`, so `is_free_trial` and `trial_interactions_used` will already be in the response — verify this)
- Modify: `web/lib/assembly-context.tsx` (add `isFreeTrial` and `trialInteractionsUsed` to the context type)
- Modify: The component that renders the follow-up input (find by searching for the follow-up form/input in `web/app/assembly/[slug]/` pages)

- [ ] **Step 1: Verify assembly detail endpoint includes trial fields**

Check `web/app/api/assemblies/[id]/route.ts` — if it uses `SELECT *`, the new columns are already included. If it selects specific columns, add `is_free_trial` and `trial_interactions_used`.

- [ ] **Step 2: Add trial fields to assembly context**

In `web/lib/assembly-context.tsx`, add `isFreeTrial` and `trialInteractionsUsed` to the assembly type/state so downstream components can read them.

- [ ] **Step 3: Show trial counter in the follow-up input area**

Find the component that renders the follow-up input (search for "follow-up" or "question" input in `web/app/assembly/[slug]/`). When `isFreeTrial` is true:
- Show: `"{remaining} of 5 interactions remaining"` where remaining = `5 - trialInteractionsUsed`
- When `trialInteractionsUsed >= 5`: disable the input, show "Add your API key for unlimited interactions" with a link to `/onboarding`

- [ ] **Step 4: Commit**

```bash
git add web/app/api/assemblies/[id]/route.ts web/lib/assembly-context.tsx
# Also add whichever component was modified for the counter UI
git commit -m "feat: show trial interaction count and exhaustion state in assembly view"
```

---

### Task 12: Set `PLATFORM_API_KEY` Environment Variable

**Files:**
- No code changes — environment configuration only

- [ ] **Step 1: Add to local `.env.local`**

```bash
# In web/.env.local
PLATFORM_API_KEY=sk-ant-your-key-here
```

- [ ] **Step 2: Add to Vercel**

```bash
cd web && vercel env add PLATFORM_API_KEY
```

Set for Production, Preview, and Development environments.

- [ ] **Step 3: Add to Railway**

In the Railway dashboard, add `PLATFORM_API_KEY` to the worker service environment variables.

---

### Task 13: End-to-End Manual Test

- [ ] **Step 1: Create a new account (no API key)**
- [ ] **Step 2: Verify you land on onboarding with "Skip — try free" option**
- [ ] **Step 3: Skip onboarding, verify dashboard shows trial banner**
- [ ] **Step 4: Create an assembly, verify it queues and processes**
- [ ] **Step 5: Try 5 interactions (follow-ups, character chats, etc.)**
- [ ] **Step 6: Verify 6th interaction is blocked with upgrade message**
- [ ] **Step 7: Try creating a second assembly — verify it's blocked**
- [ ] **Step 8: Add a BYOK key, verify unlimited access resumes**
