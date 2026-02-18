import { Pool } from "pg";
import { decryptApiKey } from "../lib/crypto.js";
import { runPipeline } from "./pipeline.js";

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
} | null> {
  const result = await pool.query(
    `UPDATE assemblies SET status = 'running', current_phase = 'domain-analysis'
     WHERE id = (
       SELECT id FROM assemblies WHERE status = 'queued'
       ORDER BY created_at LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, topic_input, user_id, raw_files, slug`
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

  await runPipeline({
    assemblyId: job.id,
    topic: job.topic_input,
    slug,
    apiKey,
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

async function pollLoop() {
  console.log("[worker] Starting poll loop");

  while (true) {
    try {
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
        }
      }
    } catch (err) {
      console.error("[worker] Poll error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

pollLoop();
