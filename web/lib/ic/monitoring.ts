import { Pool } from "pg";

type EventType =
  | "evaluation_started" | "evaluation_phase_complete" | "evaluation_complete"
  | "evaluation_error" | "parser_error" | "api_error"
  | "committee_started" | "committee_complete" | "committee_error"
  | "idea_started" | "idea_complete" | "idea_error";

type EntityType = "committee" | "evaluation" | "idea";

interface MonitoringEvent {
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  userId?: string;
  phase?: string;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export async function logMonitoringEvent(pool: Pool, event: MonitoringEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ic_monitoring_events (event_type, entity_type, entity_id, user_id, phase, duration_ms, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.eventType,
        event.entityType,
        event.entityId,
        event.userId || null,
        event.phase || null,
        event.durationMs || null,
        event.errorMessage || null,
        JSON.stringify(event.metadata || {}),
      ]
    );
  } catch (err) {
    console.error("[monitoring] Failed to log event:", err);
  }
}

export interface MonitoringStats {
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  completionRate: number;
  avgDurationMs: number;
  parserErrors: number;
  apiErrors: number;
  recentErrors: Array<{
    eventType: string;
    entityId: string;
    phase: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export async function getMonitoringStats(pool: Pool, hours = 24): Promise<MonitoringStats> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const [totals, durations, errors, recentErrors] = await Promise.all([
    pool.query(
      `SELECT event_type, COUNT(*)::int as count
       FROM ic_monitoring_events
       WHERE created_at >= $1 AND event_type IN ('evaluation_started', 'evaluation_complete', 'evaluation_error')
       GROUP BY event_type`,
      [since]
    ),
    pool.query(
      `SELECT AVG(duration_ms)::int as avg_duration
       FROM ic_monitoring_events
       WHERE created_at >= $1 AND event_type = 'evaluation_complete' AND duration_ms IS NOT NULL`,
      [since]
    ),
    pool.query(
      `SELECT event_type, COUNT(*)::int as count
       FROM ic_monitoring_events
       WHERE created_at >= $1 AND event_type IN ('parser_error', 'api_error')
       GROUP BY event_type`,
      [since]
    ),
    pool.query(
      `SELECT event_type, entity_id, phase, error_message, created_at
       FROM ic_monitoring_events
       WHERE created_at >= $1 AND event_type IN ('evaluation_error', 'parser_error', 'api_error', 'committee_error')
       ORDER BY created_at DESC
       LIMIT 20`,
      [since]
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const row of totals.rows) counts[row.event_type] = row.count;

  const errorCounts: Record<string, number> = {};
  for (const row of errors.rows) errorCounts[row.event_type] = row.count;

  const started = counts["evaluation_started"] || 0;
  const completed = counts["evaluation_complete"] || 0;
  const failed = counts["evaluation_error"] || 0;

  return {
    totalEvaluations: started,
    completedEvaluations: completed,
    failedEvaluations: failed,
    completionRate: started > 0 ? Math.round((completed / started) * 100) : 0,
    avgDurationMs: durations.rows[0]?.avg_duration || 0,
    parserErrors: errorCounts["parser_error"] || 0,
    apiErrors: errorCounts["api_error"] || 0,
    recentErrors: recentErrors.rows.map((r) => ({
      eventType: r.event_type,
      entityId: r.entity_id,
      phase: r.phase,
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
  };
}
