import { config } from "dotenv";
import { Pool } from "pg";
import { decryptApiKey } from "../lib/crypto.js";
import { runPipeline } from "./pipeline.js";
import { getUserGithubToken, buildCodeContext } from "../lib/github.js";
import {
  runCommitteePipeline,
  runEvaluationPipeline,
  runIdeaPipeline,
} from "./ic-pipeline.js";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const POLL_INTERVAL_MS = 5000;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function claimJob(): Promise<{
  id: string;
  topic_input: string;
  user_id: string;
  raw_files: Record<string, string>;
  slug: string;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  github_repo_branch: string | null;
} | null> {
  const result = await pool.query(
    `UPDATE assemblies SET status = 'running', current_phase = 'domain-analysis'
     WHERE id = (
       SELECT id FROM assemblies WHERE status = 'queued'
       ORDER BY created_at LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, topic_input, user_id, raw_files, slug, github_repo_owner, github_repo_name, github_repo_branch`
  );
  return result.rows[0] ?? null;
}

async function getUserApiKey(
  userId: string
): Promise<{ encrypted: Buffer; iv: Buffer }> {
  const result = await pool.query(
    `SELECT encrypted_api_key, api_key_iv FROM users WHERE id = $1`,
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

async function processJob(job: {
  id: string;
  topic_input: string;
  user_id: string;
  raw_files: Record<string, string>;
  slug: string;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  github_repo_branch: string | null;
}) {
  const { encrypted, iv } = await getUserApiKey(job.user_id);
  const apiKey = decryptApiKey(encrypted, iv);
  const slug = job.slug || slugify(job.topic_input);

  if (!job.slug) {
    await pool.query(`UPDATE assemblies SET slug = $1 WHERE id = $2`, [
      slug,
      job.id,
    ]);
  }

  let codeContext: string | undefined;
  if (job.github_repo_owner && job.github_repo_name) {
    try {
      await pool.query(
        `UPDATE assemblies SET current_phase = 'code-analysis' WHERE id = $1`,
        [job.id]
      );
      const githubToken = await getUserGithubToken(job.user_id);
      if (githubToken) {
        codeContext = await buildCodeContext(
          githubToken,
          job.github_repo_owner,
          job.github_repo_name,
          job.github_repo_branch || "main",
          job.topic_input,
          apiKey
        );
        console.log(`[worker] Code context fetched: ${codeContext.length} chars`);
      }
    } catch (err) {
      console.warn("[worker] Failed to fetch code context:", err);
    }
  }

  await runPipeline({
    assemblyId: job.id,
    topic: job.topic_input,
    slug,
    apiKey,
    codeContext,
    initialRawFiles: job.raw_files || {},
    updatePhase: async (phase: string) => {
      await pool.query(
        `UPDATE assemblies SET current_phase = $1 WHERE id = $2`,
        [phase, job.id]
      );
    },
    updateRawFiles: async (files: Record<string, string>) => {
      await pool.query(
        `UPDATE assemblies SET raw_files = $1::jsonb WHERE id = $2`,
        [JSON.stringify(files), job.id]
      );
    },
    updateParsedData: async (data: unknown) => {
      await pool.query(
        `UPDATE assemblies SET parsed_data = $1::jsonb WHERE id = $2`,
        [JSON.stringify(data), job.id]
      );
    },
  });

  await pool.query(
    `UPDATE assemblies SET status = 'complete', completed_at = NOW() WHERE id = $1`,
    [job.id]
  );
  console.log(`[worker] Assembly ${job.id} completed`);
}

// ─── IC Jobs ────────────────────────────────────────────────────────

const IC_ALLOWED_TABLES = new Set(["ic_committees", "ic_evaluations", "ic_ideas"]);

async function handleIcJobError(table: string, jobId: string, userId: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[worker] IC ${table} ${jobId} failed: ${message}`);
  if (!IC_ALLOWED_TABLES.has(table)) throw new Error(`Invalid table name: ${table}`);
  await pool.query(`UPDATE ${table} SET status = 'error', error_message = $1 WHERE id = $2`, [message, jobId]);
  if (message.includes("Invalid API key")) {
    await pool.query("UPDATE users SET api_key_valid = false WHERE id = $1", [userId]);
  }
}

async function claimCommitteeJob() {
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

async function claimEvaluationJob() {
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

async function claimIdeaJob() {
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

async function pollIcJobs() {
  // Committee jobs
  const committeeJob = await claimCommitteeJob();
  if (committeeJob) {
    console.log(`[worker] Claimed IC committee job ${committeeJob.id}`);
    try {
      const { encrypted, iv } = await getUserApiKey(committeeJob.user_id);
      const apiKey = decryptApiKey(encrypted, iv);
      const { members } = await runCommitteePipeline(pool, committeeJob.profile_id, apiKey, committeeJob.raw_files || {}, {
        updatePhase: async (phase) => { console.log(`[worker] IC committee ${committeeJob.id}: ${phase}`); },
        updateRawFiles: async (files) => {
          await pool.query("UPDATE ic_committees SET raw_files = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(files), committeeJob.id]);
        },
        updateParsedData: async (data) => {
          const parsed = data as { members: unknown[] };
          await pool.query("UPDATE ic_committees SET members = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(parsed.members || []), committeeJob.id]);
        },
      });
      await pool.query("UPDATE ic_committees SET status = 'active', members = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(members), committeeJob.id]);
      console.log(`[worker] IC committee ${committeeJob.id} completed with ${members.length} members`);
    } catch (err) {
      await handleIcJobError("ic_committees", committeeJob.id, committeeJob.user_id, err);
    }
  }

  // Evaluation jobs
  const evalJob = await claimEvaluationJob();
  if (evalJob) {
    console.log(`[worker] Claimed IC evaluation job ${evalJob.id}`);
    try {
      const { encrypted, iv } = await getUserApiKey(evalJob.user_id);
      const apiKey = decryptApiKey(encrypted, iv);
      await runEvaluationPipeline(pool, evalJob.id, apiKey, evalJob.raw_files || {}, {
        updatePhase: async (phase) => {
          console.log(`[worker] IC evaluation ${evalJob.id}: ${phase}`);
          await pool.query("UPDATE ic_evaluations SET current_phase = $1 WHERE id = $2", [phase, evalJob.id]);
        },
        updateRawFiles: async (files) => {
          await pool.query("UPDATE ic_evaluations SET raw_files = $1::jsonb WHERE id = $2", [JSON.stringify(files), evalJob.id]);
        },
        updateParsedData: async (data) => {
          await pool.query("UPDATE ic_evaluations SET parsed_data = $1::jsonb WHERE id = $2", [JSON.stringify(data), evalJob.id]);
        },
      });
      await pool.query("UPDATE ic_evaluations SET status = 'complete', completed_at = NOW() WHERE id = $1", [evalJob.id]);
      console.log(`[worker] IC evaluation ${evalJob.id} completed`);
    } catch (err) {
      await handleIcJobError("ic_evaluations", evalJob.id, evalJob.user_id, err);
    }
  }

  // Idea jobs
  const ideaJob = await claimIdeaJob();
  if (ideaJob) {
    console.log(`[worker] Claimed IC idea job ${ideaJob.id}`);
    try {
      const { encrypted, iv } = await getUserApiKey(ideaJob.user_id);
      const apiKey = decryptApiKey(encrypted, iv);
      await runIdeaPipeline(pool, ideaJob.id, apiKey, ideaJob.raw_files || {}, {
        updatePhase: async (phase) => {
          console.log(`[worker] IC idea ${ideaJob.id}: ${phase}`);
          await pool.query("UPDATE ic_ideas SET current_phase = $1 WHERE id = $2", [phase, ideaJob.id]);
        },
        updateRawFiles: async (files) => {
          await pool.query("UPDATE ic_ideas SET raw_files = $1::jsonb WHERE id = $2", [JSON.stringify(files), ideaJob.id]);
        },
        updateParsedData: async (data) => {
          await pool.query("UPDATE ic_ideas SET parsed_data = $1::jsonb WHERE id = $2", [JSON.stringify(data), ideaJob.id]);
        },
      });
      await pool.query("UPDATE ic_ideas SET status = 'complete', completed_at = NOW() WHERE id = $1", [ideaJob.id]);
      console.log(`[worker] IC idea ${ideaJob.id} completed`);
    } catch (err) {
      await handleIcJobError("ic_ideas", ideaJob.id, ideaJob.user_id, err);
    }
  }
}

// ─── Poll Loop ──────────────────────────────────────────────────────

async function pollLoop() {
  console.log("[worker] Starting poll loop");

  while (true) {
    try {
      // Assembly jobs
      const job = await claimJob();
      if (job) {
        console.log(
          `[worker] Claimed job ${job.id}: "${job.topic_input.slice(0, 80)}"`
        );
        try {
          await processJob(job);
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
        }
      }

      // IC jobs
      await pollIcJobs();
    } catch (err) {
      console.error("[worker] Poll error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

pollLoop();
