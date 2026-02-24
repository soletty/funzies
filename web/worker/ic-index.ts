import { config } from "dotenv";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
}
import { Pool } from "pg";
import { decryptApiKey } from "../lib/crypto.js";
import {
  runCommitteePipeline,
  runEvaluationPipeline,
  runIdeaPipeline,
} from "./ic-pipeline.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const POLL_INTERVAL_MS = 5000;

async function getUserApiKey(
  userId: string
): Promise<{ encrypted: Buffer; iv: Buffer }> {
  const result = await pool.query(
    "SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row?.encrypted_api_key || !row?.api_key_iv) {
    throw new Error(`No API key found for user ${userId}`);
  }
  return {
    encrypted: Buffer.from(row.encrypted_api_key),
    iv: Buffer.from(row.api_key_iv),
  };
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.includes("Invalid API key")) return true;
  }
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status: number }).status === 401;
  }
  return false;
}

// ─── Committee Jobs ──────────────────────────────────────────────────

async function claimCommitteeJob(): Promise<{
  id: string;
  profile_id: string;
  user_id: string;
  raw_files: Record<string, string>;
} | null> {
  const result = await pool.query(
    `UPDATE ic_committees SET status = 'generating', updated_at = NOW()
     WHERE id = (
       SELECT c.id FROM ic_committees c
       JOIN investor_profiles p ON c.profile_id = p.id
       WHERE c.status = 'queued'
       ORDER BY c.created_at LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, profile_id,
       (SELECT p.user_id FROM investor_profiles p WHERE p.id = ic_committees.profile_id) as user_id,
       raw_files`
  );
  return result.rows[0] ?? null;
}

async function processCommitteeJob(job: {
  id: string;
  profile_id: string;
  user_id: string;
  raw_files: Record<string, string>;
}) {
  const { encrypted, iv } = await getUserApiKey(job.user_id);
  const apiKey = decryptApiKey(encrypted, iv);

  const { members } = await runCommitteePipeline(
    pool,
    job.profile_id,
    apiKey,
    job.raw_files || {},
    {
      updatePhase: async (phase) => {
        console.log(`[ic-worker] Committee ${job.id}: ${phase}`);
      },
      updateRawFiles: async (files) => {
        await pool.query(
          "UPDATE ic_committees SET raw_files = $1::jsonb, updated_at = NOW() WHERE id = $2",
          [JSON.stringify(files), job.id]
        );
      },
      updateParsedData: async (data) => {
        const parsed = data as { members: unknown[] };
        await pool.query(
          "UPDATE ic_committees SET members = $1::jsonb, updated_at = NOW() WHERE id = $2",
          [JSON.stringify(parsed.members || []), job.id]
        );
      },
    }
  );

  await pool.query(
    "UPDATE ic_committees SET status = 'active', members = $1::jsonb, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(members), job.id]
  );
  console.log(`[ic-worker] Committee ${job.id} completed with ${members.length} members`);
}

// ─── Evaluation Jobs ─────────────────────────────────────────────────

async function claimEvaluationJob(): Promise<{
  id: string;
  committee_id: string;
  user_id: string;
  raw_files: Record<string, string>;
} | null> {
  const result = await pool.query(
    `UPDATE ic_evaluations SET status = 'running', current_phase = 'opportunity-analysis', updated_at = NOW()
     WHERE id = (
       SELECT e.id FROM ic_evaluations e
       JOIN ic_committees c ON e.committee_id = c.id
       JOIN investor_profiles p ON c.profile_id = p.id
       WHERE e.status = 'queued'
       ORDER BY e.created_at LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, committee_id,
       (SELECT p.user_id FROM investor_profiles p
        JOIN ic_committees c ON c.profile_id = p.id
        WHERE c.id = ic_evaluations.committee_id) as user_id,
       raw_files`
  );
  return result.rows[0] ?? null;
}

async function processEvaluationJob(job: {
  id: string;
  committee_id: string;
  user_id: string;
  raw_files: Record<string, string>;
}) {
  const { encrypted, iv } = await getUserApiKey(job.user_id);
  const apiKey = decryptApiKey(encrypted, iv);

  await runEvaluationPipeline(pool, job.id, apiKey, job.raw_files || {}, {
    updatePhase: async (phase) => {
      console.log(`[ic-worker] Evaluation ${job.id}: ${phase}`);
      await pool.query(
        "UPDATE ic_evaluations SET current_phase = $1 WHERE id = $2",
        [phase, job.id]
      );
    },
    updateRawFiles: async (files) => {
      await pool.query(
        "UPDATE ic_evaluations SET raw_files = $1::jsonb WHERE id = $2",
        [JSON.stringify(files), job.id]
      );
    },
    updateParsedData: async (data) => {
      await pool.query(
        "UPDATE ic_evaluations SET parsed_data = $1::jsonb WHERE id = $2",
        [JSON.stringify(data), job.id]
      );
    },
  });

  await pool.query(
    "UPDATE ic_evaluations SET status = 'complete', completed_at = NOW() WHERE id = $1",
    [job.id]
  );
  console.log(`[ic-worker] Evaluation ${job.id} completed`);
}

// ─── Idea Jobs ───────────────────────────────────────────────────────

async function claimIdeaJob(): Promise<{
  id: string;
  committee_id: string;
  user_id: string;
  raw_files: Record<string, string>;
} | null> {
  const result = await pool.query(
    `UPDATE ic_ideas SET status = 'running', current_phase = 'gap-analysis', updated_at = NOW()
     WHERE id = (
       SELECT i.id FROM ic_ideas i
       JOIN ic_committees c ON i.committee_id = c.id
       JOIN investor_profiles p ON c.profile_id = p.id
       WHERE i.status = 'queued'
       ORDER BY i.created_at LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, committee_id,
       (SELECT p.user_id FROM investor_profiles p
        JOIN ic_committees c ON c.profile_id = p.id
        WHERE c.id = ic_ideas.committee_id) as user_id,
       raw_files`
  );
  return result.rows[0] ?? null;
}

async function processIdeaJob(job: {
  id: string;
  committee_id: string;
  user_id: string;
  raw_files: Record<string, string>;
}) {
  const { encrypted, iv } = await getUserApiKey(job.user_id);
  const apiKey = decryptApiKey(encrypted, iv);

  await runIdeaPipeline(pool, job.id, apiKey, job.raw_files || {}, {
    updatePhase: async (phase) => {
      console.log(`[ic-worker] Idea ${job.id}: ${phase}`);
      await pool.query(
        "UPDATE ic_ideas SET current_phase = $1 WHERE id = $2",
        [phase, job.id]
      );
    },
    updateRawFiles: async (files) => {
      await pool.query(
        "UPDATE ic_ideas SET raw_files = $1::jsonb WHERE id = $2",
        [JSON.stringify(files), job.id]
      );
    },
    updateParsedData: async (data) => {
      await pool.query(
        "UPDATE ic_ideas SET parsed_data = $1::jsonb WHERE id = $2",
        [JSON.stringify(data), job.id]
      );
    },
  });

  await pool.query(
    "UPDATE ic_ideas SET status = 'complete', completed_at = NOW() WHERE id = $1",
    [job.id]
  );
  console.log(`[ic-worker] Idea ${job.id} completed`);
}

// ─── Error Handling ──────────────────────────────────────────────────

const ALLOWED_TABLES = new Set(["ic_committees", "ic_evaluations", "ic_ideas"]);

async function handleJobError(
  table: string,
  jobId: string,
  userId: string,
  err: unknown
) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[ic-worker] ${table} ${jobId} failed: ${message}`);

  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  await pool.query(
    `UPDATE ${table} SET status = 'error', error_message = $1 WHERE id = $2`,
    [message, jobId]
  );

  if (isAuthError(err)) {
    await pool.query(
      "UPDATE users SET api_key_valid = false WHERE id = $1",
      [userId]
    );
  }
}

// ─── Poll Loop ───────────────────────────────────────────────────────

async function pollLoop() {
  console.log("[ic-worker] Starting poll loop");

  while (true) {
    try {
      // 1. Committee generation jobs
      const committeeJob = await claimCommitteeJob();
      if (committeeJob) {
        console.log(`[ic-worker] Claimed committee job ${committeeJob.id}`);
        try {
          await processCommitteeJob(committeeJob);
        } catch (err) {
          await handleJobError("ic_committees", committeeJob.id, committeeJob.user_id, err);
        }
      }

      // 2. Evaluation jobs
      const evalJob = await claimEvaluationJob();
      if (evalJob) {
        console.log(`[ic-worker] Claimed evaluation job ${evalJob.id}`);
        try {
          await processEvaluationJob(evalJob);
        } catch (err) {
          await handleJobError("ic_evaluations", evalJob.id, evalJob.user_id, err);
        }
      }

      // 3. Idea jobs
      const ideaJob = await claimIdeaJob();
      if (ideaJob) {
        console.log(`[ic-worker] Claimed idea job ${ideaJob.id}`);
        try {
          await processIdeaJob(ideaJob);
        } catch (err) {
          await handleJobError("ic_ideas", ideaJob.id, ideaJob.user_id, err);
        }
      }
    } catch (err) {
      console.error("[ic-worker] Poll error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

pollLoop();
