import { query } from "@/lib/db";

export interface MovementFilters {
  stage?: string;
  minMomentum?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "momentum_score" | "last_signal_at" | "created_at";
  sortDir?: "ASC" | "DESC";
}

export async function getMovements(filters: MovementFilters = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.stage) {
    conditions.push(`stage = $${paramIndex++}`);
    params.push(filters.stage);
  }
  if (filters.minMomentum !== undefined) {
    conditions.push(`momentum_score >= $${paramIndex++}`);
    params.push(filters.minMomentum);
  }
  if (filters.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    paramIndex++;
    params.push(`%${filters.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const ALLOWED_SORT_COLUMNS = new Set(["momentum_score", "last_signal_at", "created_at"]);
  const ALLOWED_SORT_DIRS = new Set(["ASC", "DESC"]);
  const sortBy = ALLOWED_SORT_COLUMNS.has(filters.sortBy ?? "") ? filters.sortBy! : "momentum_score";
  const sortDir = ALLOWED_SORT_DIRS.has(filters.sortDir ?? "") ? filters.sortDir! : "DESC";

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  const limitIdx = paramIndex++;
  const offsetIdx = paramIndex++;

  return query<{
    id: string;
    name: string;
    slug: string;
    description: string;
    geography: string;
    stage: string;
    key_slogans: string[];
    key_phrases: string[];
    categories: string[];
    estimated_size: string;
    momentum_score: number;
    sentiment: string;
    merch_potential_score: number;
    analysis_summary: string;
    first_detected_at: string;
    last_signal_at: string;
    peak_momentum_score: number;
    peak_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, slug, description, geography, stage, key_slogans, key_phrases,
            categories, estimated_size, momentum_score, sentiment, merch_potential_score,
            analysis_summary, first_detected_at, last_signal_at, peak_momentum_score,
            peak_at, created_at, updated_at
     FROM pulse_movements
     ${where}
     ORDER BY ${sortBy} ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, limit, offset]
  );
}

export async function getMovementById(id: string) {
  const rows = await query<{
    id: string;
    name: string;
    slug: string;
    description: string;
    geography: string;
    stage: string;
    key_slogans: string[];
    key_phrases: string[];
    categories: string[];
    estimated_size: string;
    momentum_score: number;
    sentiment: string;
    merch_potential_score: number;
    analysis_summary: string;
    raw_analysis: Record<string, unknown>;
    first_detected_at: string;
    last_signal_at: string;
    peak_momentum_score: number;
    peak_at: string | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM pulse_movements WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getMovementBySlug(slug: string) {
  const rows = await query<{
    id: string;
    name: string;
    slug: string;
    description: string;
    geography: string;
    stage: string;
    key_slogans: string[];
    key_phrases: string[];
    categories: string[];
    estimated_size: string;
    momentum_score: number;
    sentiment: string;
    merch_potential_score: number;
    analysis_summary: string;
    raw_analysis: Record<string, unknown>;
    first_detected_at: string;
    last_signal_at: string;
    peak_momentum_score: number;
    peak_at: string | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM pulse_movements WHERE slug = $1", [slug]);
  return rows[0] ?? null;
}

export async function getSignalsForMovement(movementId: string) {
  return query<{
    id: string;
    source: string;
    source_id: string;
    title: string;
    content: string;
    url: string;
    metadata: Record<string, unknown>;
    relevance_score: number | null;
    created_at: string;
  }>(
    `SELECT id, source, source_id, title, content, url, metadata, relevance_score, created_at
     FROM pulse_signals
     WHERE movement_id = $1
     ORDER BY created_at DESC`,
    [movementId]
  );
}
