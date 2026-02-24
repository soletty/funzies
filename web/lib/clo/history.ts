import { Pool } from "pg";

interface AnalysisHistoryRow {
  title: string;
  analysis_type: string;
  completed_at: string | null;
  parsed_data: {
    recommendation?: { verdict?: string; dissents?: string[] };
  } | null;
}

export async function getRecentAnalysisSummaries(
  pool: Pool,
  panelId: string,
  limit = 5
): Promise<string> {
  const result = await pool.query<AnalysisHistoryRow>(
    `SELECT title, analysis_type, completed_at, parsed_data
     FROM clo_analyses
     WHERE panel_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [panelId, limit]
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
      return `- [${row.title}] (${row.analysis_type}, ${date}): ${verdict}${dissentNote}`;
    })
    .join("\n");
}
