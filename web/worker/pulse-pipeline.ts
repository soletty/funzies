import Anthropic from "@anthropic-ai/sdk";
import { Pool } from "pg";
import { fetchAllSignals } from "../lib/pulse/sources/index.js";
import {
  signalClassificationPrompt,
  groupMergePrompt,
  movementProfilingPrompt,
  deduplicationPrompt,
} from "./pulse-prompts.js";
import type {
  RawSignal,
  MovementProfile,
  DeduplicationMatch,
} from "../lib/pulse/types.js";

interface ClassifiedGroup {
  movementName: string;
  confidence: number;
  signalIndices: number[];
}

interface ClassificationOutput {
  groups: ClassifiedGroup[];
  rejected: { signalIndex: number; reason: string }[];
}

interface ProfileWithGroupIndex extends MovementProfile {
  groupIndex: number;
}

export interface PipelineCallbacks {
  updatePhase: (phase: string) => Promise<void>;
  updateRawFiles: (files: Record<string, string>) => Promise<void>;
}

const SIGNAL_BATCH_SIZE = 80;

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const apiErr = err as { status: number; message?: string };
      if (apiErr.status === 401) {
        throw new Error("Invalid API key. Please update your key in Settings.");
      }
      if (apiErr.status === 429) {
        throw new Error("Rate limited by Anthropic. Please wait and try again, or check your API plan limits.");
      }
      if (apiErr.status === 529) {
        throw new Error("Anthropic API is temporarily overloaded. Your scan will be retried.");
      }
    }
    throw err;
  }
}

function cleanJsonResponse(text: string): string {
  return text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
}

function parseJsonSafe<T>(text: string, label: string): T {
  try {
    return JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(`Failed to parse ${label} response from Claude. Raw output: ${text.slice(0, 200)}`);
  }
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

function validateClassification(data: unknown): ClassificationOutput {
  const obj = data as ClassificationOutput;
  if (!Array.isArray(obj?.groups)) {
    throw new Error("Classification output missing 'groups' array");
  }
  for (const group of obj.groups) {
    if (!group.movementName || !Array.isArray(group.signalIndices)) {
      throw new Error(`Invalid group: missing movementName or signalIndices`);
    }
  }
  return { groups: obj.groups, rejected: Array.isArray(obj.rejected) ? obj.rejected : [] };
}

function validateProfiles(data: unknown): ProfileWithGroupIndex[] {
  if (!Array.isArray(data)) {
    throw new Error("Profiles output is not an array");
  }
  return (data as ProfileWithGroupIndex[]).map((p, i) => ({
    ...p,
    groupIndex: typeof p.groupIndex === "number" ? p.groupIndex : i,
    keySlogans: Array.isArray(p.keySlogans) ? p.keySlogans : [],
    keyPhrases: Array.isArray(p.keyPhrases) ? p.keyPhrases : [],
    categories: Array.isArray(p.categories) ? p.categories : [],
    momentumScore: typeof p.momentumScore === "number" ? p.momentumScore : 50,
    merchPotentialScore: typeof p.merchPotentialScore === "number" ? p.merchPotentialScore : 50,
  }));
}

async function classifyBatch(
  client: Anthropic,
  signals: RawSignal[],
  offset: number
): Promise<ClassificationOutput> {
  const numberedSignals = signals
    .map((s, i) => `[${offset + i}] [${s.source}] ${s.title}\n${s.content}`)
    .join("\n\n");
  const prompt = signalClassificationPrompt(numberedSignals);
  const result = await callClaude(client, prompt.system, prompt.user, 8192);
  return validateClassification(parseJsonSafe(result, "classification"));
}

function mergeClassifications(batches: ClassificationOutput[]): ClassificationOutput {
  const groups: ClassifiedGroup[] = [];
  const rejected: { signalIndex: number; reason: string }[] = [];
  for (const batch of batches) {
    groups.push(...batch.groups);
    rejected.push(...batch.rejected);
  }
  return { groups, rejected };
}

async function mergeGroupsAcrossBatches(
  client: Anthropic,
  classification: ClassificationOutput
): Promise<ClassificationOutput> {
  if (classification.groups.length <= 1) return classification;

  const groupsText = classification.groups
    .map((g, i) => `[${i}] "${g.movementName}" (confidence: ${g.confidence}) — signals: [${g.signalIndices.join(", ")}]`)
    .join("\n");

  const prompt = groupMergePrompt(groupsText);
  const result = await callClaude(client, prompt.system, prompt.user, 4096);
  const merged = parseJsonSafe<{ groups: ClassifiedGroup[] }>(result, "group-merge");

  if (!Array.isArray(merged?.groups) || merged.groups.length === 0) {
    return classification;
  }

  return { groups: merged.groups, rejected: classification.rejected };
}

export async function runScanPipeline(
  pool: Pool,
  scanId: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set. Add it to your Railway service variables.");
  }
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Phase 1: Fetch Sources
  if (!rawFiles["signals.json"]) {
    await callbacks.updatePhase("fetching-sources");
    const signals = await fetchAllSignals();
    rawFiles["signals.json"] = JSON.stringify(signals);
    await callbacks.updateRawFiles(rawFiles);
    await pool.query(
      "UPDATE pulse_scans SET signals_found = $1 WHERE id = $2",
      [signals.length, scanId]
    );
  }

  const signals: RawSignal[] = JSON.parse(rawFiles["signals.json"]);

  // Phase 2: Classify Signals (batched to avoid token limits)
  if (!rawFiles["classification.json"]) {
    await callbacks.updatePhase("classifying-signals");

    let classification: ClassificationOutput;
    if (signals.length <= SIGNAL_BATCH_SIZE) {
      classification = await classifyBatch(client, signals, 0);
    } else {
      const batches: ClassificationOutput[] = [];
      for (let offset = 0; offset < signals.length; offset += SIGNAL_BATCH_SIZE) {
        const batch = signals.slice(offset, offset + SIGNAL_BATCH_SIZE);
        batches.push(await classifyBatch(client, batch, offset));
      }
      const merged = mergeClassifications(batches);
      classification = await mergeGroupsAcrossBatches(client, merged);
    }

    rawFiles["classification.json"] = JSON.stringify(classification);
    await callbacks.updateRawFiles(rawFiles);
  }

  const classification: ClassificationOutput = JSON.parse(rawFiles["classification.json"]);

  // Phase 3: Profile Movements
  if (!rawFiles["profiles.json"]) {
    await callbacks.updatePhase("profiling-movements");
    const groupsText = classification.groups
      .map((g, i) => {
        const groupSignals = (g.signalIndices || [])
          .map((idx) => signals[idx])
          .filter(Boolean)
          .map((s) => `  - [${s.source}] ${s.title}: ${s.content}`)
          .join("\n");
        return `[GroupIndex: ${i}] "${g.movementName}" (confidence: ${g.confidence})\n${groupSignals}`;
      })
      .join("\n\n");
    const prompt = movementProfilingPrompt(groupsText);
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    const profiles = validateProfiles(parseJsonSafe(result, "profiles"));
    rawFiles["profiles.json"] = JSON.stringify(profiles);
    await callbacks.updateRawFiles(rawFiles);
  }

  const profiles: ProfileWithGroupIndex[] = JSON.parse(rawFiles["profiles.json"]);

  // Phase 4: Deduplication
  if (!rawFiles["deduplication.json"]) {
    await callbacks.updatePhase("deduplication");

    const existingRows = await pool.query(
      "SELECT id, name, slug, description, geography, categories, key_phrases FROM pulse_movements WHERE stage != 'dormant'"
    );

    let movementsCreated = 0;
    let movementsUpdated = 0;

    if (existingRows.rows.length === 0) {
      for (const profile of profiles) {
        const movementId = await insertMovement(pool, profile);
        movementsCreated++;
        const groupSignals = getSignalsForGroup(classification, profile.groupIndex, signals);
        await insertSignalsBatch(pool, groupSignals, movementId, scanId);
      }

      rawFiles["deduplication.json"] = JSON.stringify({
        matches: [],
        newMovements: profiles.map((_, i) => i),
      });
    } else {
      const existingText = existingRows.rows
        .map((r) => `ID: ${r.id}\nName: ${r.name}\nDescription: ${r.description}\nGeography: ${r.geography}\nCategories: ${(r.categories || []).join(", ")}\nKey Phrases: ${(r.key_phrases || []).join(", ")}`)
        .join("\n\n");
      const newText = profiles
        .map((p, i) => `[${i}] ${p.name}\nDescription: ${p.description}\nGeography: ${p.geography}\nCategories: ${(p.categories || []).join(", ")}\nKey Phrases: ${(p.keyPhrases || []).join(", ")}`)
        .join("\n\n");

      const prompt = deduplicationPrompt(newText, existingText);
      const result = await callClaude(client, prompt.system, prompt.user, 4096);
      const dedupResult = parseJsonSafe<{
        matches: DeduplicationMatch[];
        newMovements: number[];
      }>(result, "deduplication");

      rawFiles["deduplication.json"] = JSON.stringify(dedupResult);

      for (const match of dedupResult.matches ?? []) {
        const profile = profiles[match.newProfileIndex];
        if (!profile) continue;
        await pool.query(
          `UPDATE pulse_movements
           SET momentum_score = $1, last_signal_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [profile.momentumScore, match.existingMovementId]
        );
        movementsUpdated++;

        const groupSignals = getSignalsForGroup(classification, profile.groupIndex, signals);
        await insertSignalsBatch(pool, groupSignals, match.existingMovementId, scanId);
      }

      for (const idx of dedupResult.newMovements ?? []) {
        const profile = profiles[idx];
        if (!profile) continue;
        const movementId = await insertMovement(pool, profile);
        movementsCreated++;
        const groupSignals = getSignalsForGroup(classification, profile.groupIndex, signals);
        await insertSignalsBatch(pool, groupSignals, movementId, scanId);
      }
    }

    await callbacks.updateRawFiles(rawFiles);
    await pool.query(
      "UPDATE pulse_scans SET movements_created = $1, movements_updated = $2 WHERE id = $3",
      [movementsCreated, movementsUpdated, scanId]
    );
  }

  // Phase 5: Lifecycle Update
  if (!rawFiles["lifecycle.json"]) {
    await callbacks.updatePhase("lifecycle-update");

    const allMovements = await pool.query(
      "SELECT id, name, stage, momentum_score, peak_momentum_score, peak_at, last_signal_at FROM pulse_movements"
    );

    const now = new Date();
    const changes: Array<{ id: string; name: string; from: string; to: string; reason: string }> = [];

    const scanSignalRows = await pool.query(
      "SELECT DISTINCT movement_id FROM pulse_signals WHERE scan_id = $1",
      [scanId]
    );
    const activeMovementIds = new Set(scanSignalRows.rows.map((r) => r.movement_id));

    const sourceCountRows = await pool.query(
      "SELECT movement_id, COUNT(DISTINCT source) as cnt FROM pulse_signals GROUP BY movement_id"
    );
    const sourceCountMap = new Map(sourceCountRows.rows.map((r) => [r.movement_id, parseInt(r.cnt)]));

    for (const row of allMovements.rows) {
      const lastSignal = new Date(row.last_signal_at);
      const hoursSinceSignal = (now.getTime() - lastSignal.getTime()) / (1000 * 60 * 60);
      const hasNewSignals = activeMovementIds.has(row.id);
      const oldStage = row.stage;
      let newStage = oldStage;
      let peakAt = row.peak_at;
      let peakMomentum = row.peak_momentum_score;
      let momentumScore = row.momentum_score;

      if (hasNewSignals) {
        const multiSource = (sourceCountMap.get(row.id) ?? 0) > 1;

        if (oldStage === "detected" && multiSource) {
          newStage = "verified";
        } else if (oldStage === "verified" && momentumScore > 30) {
          newStage = "growing";
        } else if (oldStage === "growing" && momentumScore > 60) {
          newStage = "trending";
        }
      } else {
        if ((oldStage === "trending" || oldStage === "growing") && hoursSinceSignal > 24) {
          newStage = "peaked";
          peakAt = new Date().toISOString();
          peakMomentum = momentumScore;
        } else if (oldStage === "peaked" && hoursSinceSignal > 72) {
          newStage = "declining";
        } else if (
          (oldStage === "declining" && hoursSinceSignal > 168) ||
          (oldStage === "detected" && hoursSinceSignal > 168) ||
          (oldStage === "verified" && hoursSinceSignal > 168)
        ) {
          newStage = "dormant";
        }

        // Time-based decay: ~5% per hour, compounded
        const decayFactor = Math.pow(0.997, hoursSinceSignal);
        momentumScore = Math.round(momentumScore * decayFactor);
      }

      if (newStage !== oldStage || momentumScore !== row.momentum_score) {
        await pool.query(
          `UPDATE pulse_movements
           SET stage = $1, momentum_score = $2, peak_momentum_score = $3, peak_at = $4, updated_at = NOW()
           WHERE id = $5`,
          [newStage, momentumScore, peakMomentum, peakAt, row.id]
        );

        if (newStage !== oldStage) {
          changes.push({
            id: row.id,
            name: row.name,
            from: oldStage,
            to: newStage,
            reason: hasNewSignals ? "new signals received" : `no signals for ${Math.round(hoursSinceSignal)}h`,
          });
        }
      }
    }

    rawFiles["lifecycle.json"] = JSON.stringify(changes);
    await callbacks.updateRawFiles(rawFiles);
  }
}

async function insertMovement(pool: Pool, profile: MovementProfile): Promise<string> {
  const result = await pool.query(
    `INSERT INTO pulse_movements (name, slug, description, geography, stage, key_slogans, key_phrases, categories, estimated_size, momentum_score, sentiment, merch_potential_score, analysis_summary, first_detected_at, last_signal_at)
     VALUES ($1, $2, $3, $4, 'detected', $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, NOW(), NOW())
     RETURNING id`,
    [
      profile.name,
      slugify(profile.name),
      profile.description,
      profile.geography,
      JSON.stringify(profile.keySlogans || []),
      JSON.stringify(profile.keyPhrases || []),
      JSON.stringify(profile.categories || []),
      profile.estimatedSize,
      profile.momentumScore,
      profile.sentiment,
      profile.merchPotentialScore,
      profile.analysisSummary,
    ]
  );
  return result.rows[0].id;
}

function getSignalsForGroup(
  classification: ClassificationOutput,
  groupIndex: number,
  allSignals: RawSignal[]
): RawSignal[] {
  const group = classification.groups[groupIndex];
  if (!group?.signalIndices) return [];
  return group.signalIndices.map((idx) => allSignals[idx]).filter(Boolean);
}

async function insertSignalsBatch(
  pool: Pool,
  signals: RawSignal[],
  movementId: string,
  scanId: string
): Promise<void> {
  if (signals.length === 0) return;

  const seen = new Set<string>();
  const deduped = signals.filter((s) => {
    const key = `${s.source}:${s.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const signal of deduped) {
    placeholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    values.push(
      movementId,
      scanId,
      signal.source,
      signal.sourceId,
      signal.title,
      signal.content,
      signal.url,
      JSON.stringify(signal.metadata || {})
    );
  }

  await pool.query(
    `INSERT INTO pulse_signals (movement_id, scan_id, source, source_id, title, content, url, metadata)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (source, source_id, movement_id) DO NOTHING`,
    values
  );
}
