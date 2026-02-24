import { Pool } from "pg";

interface EvaluationHistoryRow {
  title: string;
  completed_at: string | null;
  parsed_data: {
    recommendation?: { verdict?: string; dissents?: string[] };
  } | null;
}

export async function getRecentEvaluationSummaries(
  pool: Pool,
  committeeId: string,
  limit = 5
): Promise<string> {
  const result = await pool.query<EvaluationHistoryRow>(
    `SELECT title, completed_at, parsed_data
     FROM ic_evaluations
     WHERE committee_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [committeeId, limit]
  );

  if (result.rows.length === 0) return "";

  return result.rows
    .map((row) => {
      const date = row.completed_at
        ? new Date(row.completed_at).toLocaleDateString()
        : "Unknown date";
      const parsed = row.parsed_data || {};
      const verdict = parsed.recommendation?.verdict || "no verdict";
      const dissents = parsed.recommendation?.dissents;
      const dissentNote =
        dissents && dissents.length > 0
          ? ` — Dissent: ${dissents[0]}`
          : "";
      return `- [${row.title}] (${date}): ${verdict}${dissentNote}`;
    })
    .join("\n");
}
