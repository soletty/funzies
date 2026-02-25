import { Pool } from "pg";

interface EvaluationHistoryRow {
  title: string;
  opportunity_type: string | null;
  company_name: string | null;
  thesis: string | null;
  completed_at: string | null;
  parsed_data: {
    recommendation?: { verdict?: string; dissents?: string[] };
    riskAssessment?: { overallRisk?: string };
    memo?: { sections?: Array<{ heading: string; content: string }> };
  } | null;
}

export async function getRecentEvaluationSummaries(
  pool: Pool,
  committeeId: string,
  limit = 25
): Promise<string> {
  const result = await pool.query<EvaluationHistoryRow>(
    `SELECT title, opportunity_type, company_name, thesis, completed_at, parsed_data
     FROM ic_evaluations
     WHERE committee_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [committeeId, limit]
  );

  if (result.rows.length === 0) return "";

  const summaries = result.rows.map((row) => {
    const date = row.completed_at
      ? new Date(row.completed_at).toLocaleDateString()
      : "Unknown date";
    const parsed = row.parsed_data || {};
    const verdict = parsed.recommendation?.verdict || "no perspective";
    const risk = parsed.riskAssessment?.overallRisk || "unknown";
    const dissents = parsed.recommendation?.dissents;
    const dissentNote =
      dissents && dissents.length > 0
        ? ` | Dissent: ${dissents[0]}`
        : "";

    const type = row.opportunity_type ? ` (${row.opportunity_type})` : "";
    const company = row.company_name ? ` — ${row.company_name}` : "";
    const thesisBrief = row.thesis
      ? ` | Thesis: ${row.thesis.slice(0, 120)}${row.thesis.length > 120 ? "..." : ""}`
      : "";

    return `- [${row.title}]${company}${type} (${date}): perspective=${verdict}, risk=${risk}${thesisBrief}${dissentNote}`;
  });

  const patternSection = buildPatternInsights(result.rows);

  return [
    "## Recent Evaluation History",
    ...summaries,
    "",
    patternSection,
  ].join("\n");
}

function buildPatternInsights(rows: EvaluationHistoryRow[]): string {
  if (rows.length < 3) return "";

  const verdicts: Record<string, number> = {};
  const riskLevels: Record<string, number> = {};
  const types: Record<string, number> = {};

  for (const row of rows) {
    const v = row.parsed_data?.recommendation?.verdict;
    if (v) verdicts[v] = (verdicts[v] || 0) + 1;
    const r = row.parsed_data?.riskAssessment?.overallRisk;
    if (r) riskLevels[r] = (riskLevels[r] || 0) + 1;
    if (row.opportunity_type) types[row.opportunity_type] = (types[row.opportunity_type] || 0) + 1;
  }

  const lines: string[] = ["## Committee Patterns"];
  lines.push(`- Total evaluations reviewed: ${rows.length}`);

  const verdictSummary = Object.entries(verdicts)
    .sort((a, b) => b[1] - a[1])
    .map(([v, c]) => `${v}: ${c}`)
    .join(", ");
  if (verdictSummary) lines.push(`- Perspective distribution: ${verdictSummary}`);

  const riskSummary = Object.entries(riskLevels)
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r}: ${c}`)
    .join(", ");
  if (riskSummary) lines.push(`- Risk distribution: ${riskSummary}`);

  const topTypes = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, c]) => `${t} (${c})`)
    .join(", ");
  if (topTypes) lines.push(`- Most evaluated opportunity types: ${topTypes}`);

  const favorableRate = rows.length > 0
    ? Math.round(
        ((verdicts["strongly_favorable"] || 0) + (verdicts["favorable"] || 0)) /
        rows.length * 100
      )
    : 0;
  lines.push(`- Favorable rate: ${favorableRate}% of evaluations received a favorable or strongly favorable perspective`);

  lines.push("");
  lines.push("Use these patterns to provide context — note when the current opportunity is similar to or different from past evaluations, and reference specific past decisions when relevant.");

  return lines.join("\n");
}
