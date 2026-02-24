import { query } from "@/lib/db";

export async function getProfileForUser(userId: string) {
  const rows = await query<{
    id: string;
    user_id: string;
    fund_strategy: string;
    target_sectors: string;
    risk_appetite: string;
    portfolio_size: string;
    reinvestment_period: string;
    concentration_limits: string;
    covenant_preferences: string;
    rating_thresholds: string;
    spread_targets: string;
    regulatory_constraints: string;
    portfolio_description: string;
    beliefs_and_biases: string;
    raw_questionnaire: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT * FROM clo_profiles WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

export async function getPanelForUser(userId: string) {
  const rows = await query<{
    id: string;
    profile_id: string;
    status: string;
    members: unknown[];
    avatar_mappings: Record<string, string>;
    raw_files: Record<string, string>;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT p.* FROM clo_panels p
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE pr.user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function verifyAnalysisAccess(analysisId: string, userId: string) {
  const rows = await query<{ id: string }>(
    `SELECT a.id FROM clo_analyses a
     JOIN clo_panels p ON a.panel_id = p.id
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE a.id = $1 AND pr.user_id = $2`,
    [analysisId, userId]
  );
  return rows.length > 0;
}

export async function verifyScreeningAccess(screeningId: string, userId: string) {
  const rows = await query<{ id: string }>(
    `SELECT s.id FROM clo_screenings s
     JOIN clo_panels p ON s.panel_id = p.id
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE s.id = $1 AND pr.user_id = $2`,
    [screeningId, userId]
  );
  return rows.length > 0;
}
