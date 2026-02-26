import { Pool } from "pg";
import { query as dbQuery } from "../db";

interface AnalysisHistoryRow {
  title: string;
  analysis_type: string;
  borrower_name: string | null;
  sector: string | null;
  rating: string | null;
  spread_coupon: string | null;
  facility_size: string | null;
  completed_at: string | null;
  parsed_data: {
    recommendation?: { verdict?: string; dissents?: string[] };
    riskAssessment?: { overallRisk?: string };
  } | null;
}

export async function getRecentAnalysisSummaries(
  pool: Pool,
  panelId: string,
  limit = 20
): Promise<string> {
  const result = await pool.query<AnalysisHistoryRow>(
    `SELECT title, analysis_type, borrower_name, sector, rating, spread_coupon,
            facility_size, completed_at, parsed_data
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
      const risk = parsed.riskAssessment?.overallRisk || "";
      const dissents = parsed.recommendation?.dissents;
      const dissentNote =
        dissents && dissents.length > 0
          ? ` | Dissent: ${dissents[0]}`
          : "";
      const details = [
        row.sector,
        row.rating,
        row.spread_coupon,
        row.facility_size,
        risk ? `risk:${risk}` : "",
      ].filter(Boolean).join(", ");
      return `- [${row.title}] (${row.analysis_type}, ${date}): ${verdict}${details ? ` | ${details}` : ""}${dissentNote}`;
    })
    .join("\n");
}

interface AnalysisBriefRow {
  title: string;
  analysis_type: string;
  borrower_name: string | null;
  sector: string | null;
  rating: string | null;
  spread_coupon: string | null;
  facility_size: string | null;
  completed_at: string | null;
  parsed_data: {
    recommendation?: { verdict?: string; dissents?: string[] };
    riskAssessment?: { overallRisk?: string; keyRisks?: string[] };
    memo?: { summary?: string };
  } | null;
  raw_files: Record<string, string> | null;
}

export async function getRecentAnalysisBriefs(panelId: string, limit = 10): Promise<string> {
  const rows = await dbQuery<AnalysisBriefRow>(
    `SELECT title, analysis_type, borrower_name, sector, rating, spread_coupon,
            facility_size, completed_at, parsed_data, raw_files
     FROM clo_analyses
     WHERE panel_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [panelId, limit]
  );

  if (rows.length === 0) return "";

  return rows.map((row) => {
    const parsed = row.parsed_data || {};
    const verdict = parsed.recommendation?.verdict || "pending";
    const risk = parsed.riskAssessment?.overallRisk || "";
    const dissents = parsed.recommendation?.dissents;
    const keyRisks = parsed.riskAssessment?.keyRisks;
    const date = row.completed_at
      ? new Date(row.completed_at).toLocaleDateString()
      : "Unknown date";

    let brief = `### ${row.borrower_name || row.title} (${date})`;
    brief += `\nType: ${row.analysis_type} | Verdict: ${verdict}`;
    if (row.sector || row.rating || row.spread_coupon) {
      brief += ` | ${[row.sector, row.rating, row.spread_coupon, row.facility_size].filter(Boolean).join(", ")}`;
    }
    if (risk) brief += `\nOverall Risk: ${risk}`;
    if (keyRisks && keyRisks.length > 0) {
      brief += `\nKey Risks: ${keyRisks.slice(0, 3).join("; ")}`;
    }
    if (dissents && dissents.length > 0) {
      brief += `\nDissents: ${dissents.join("; ")}`;
    }
    // Include a compact recommendation excerpt if available
    const recMd = row.raw_files?.["recommendation.md"];
    if (recMd) {
      const aggregateMatch = recMd.match(/## Aggregate Recommendation[\s\S]*?(?=\n## |\n---|\Z)/);
      if (aggregateMatch) {
        const excerpt = aggregateMatch[0].slice(0, 500).trim();
        brief += `\n${excerpt}`;
      }
    }
    return brief;
  }).join("\n\n");
}

interface PortfolioRow {
  borrower_name: string | null;
  sector: string | null;
  rating: string | null;
  spread_coupon: string | null;
  facility_size: string | null;
  parsed_data: {
    recommendation?: { verdict?: string };
    riskAssessment?: { overallRisk?: string };
  } | null;
}

export async function getPortfolioSnapshot(panelId: string): Promise<string> {
  const rows = await dbQuery<PortfolioRow>(
    `SELECT borrower_name, sector, rating, spread_coupon, facility_size, parsed_data
     FROM clo_analyses
     WHERE panel_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 50`,
    [panelId]
  );

  if (rows.length === 0) return "";

  // Aggregate sector distribution
  const sectorCounts: Record<string, number> = {};
  const ratingCounts: Record<string, number> = {};
  const verdicts: Record<string, number> = {};
  let buyCount = 0;

  for (const row of rows) {
    if (row.sector) sectorCounts[row.sector] = (sectorCounts[row.sector] || 0) + 1;
    if (row.rating) ratingCounts[row.rating] = (ratingCounts[row.rating] || 0) + 1;
    const verdict = row.parsed_data?.recommendation?.verdict;
    if (verdict) {
      verdicts[verdict] = (verdicts[verdict] || 0) + 1;
      if (verdict === "buy" || verdict === "strong_buy") buyCount++;
    }
  }

  const sections: string[] = [];
  sections.push(`Total analyses: ${rows.length} (${buyCount} buy/strong_buy)`);

  if (Object.keys(sectorCounts).length > 0) {
    const sectorLines = Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `  ${s}: ${c}`)
      .join("\n");
    sections.push(`Sector distribution:\n${sectorLines}`);
  }

  if (Object.keys(ratingCounts).length > 0) {
    const ratingLines = Object.entries(ratingCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `  ${r}: ${c}`)
      .join("\n");
    sections.push(`Rating breakdown:\n${ratingLines}`);
  }

  if (Object.keys(verdicts).length > 0) {
    const verdictLines = Object.entries(verdicts)
      .map(([v, c]) => `  ${v}: ${c}`)
      .join("\n");
    sections.push(`Verdict distribution:\n${verdictLines}`);
  }

  // Recent holdings (buy/strong_buy)
  const holdings = rows
    .filter((r) => {
      const v = r.parsed_data?.recommendation?.verdict;
      return v === "buy" || v === "strong_buy";
    })
    .slice(0, 15)
    .map((r) => `  ${r.borrower_name || "Unknown"} | ${r.sector || "?"} | ${r.rating || "?"} | ${r.spread_coupon || "?"}`)
    .join("\n");

  if (holdings) {
    sections.push(`Recent buy/strong_buy holdings:\n${holdings}`);
  }

  return sections.join("\n\n");
}
