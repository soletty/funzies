import { query } from "@/lib/db";

export async function getProfileForUser(userId: string) {
  const rows = await query<{
    id: string;
    user_id: string;
    investment_philosophy: string;
    risk_tolerance: string;
    asset_classes: string[];
    current_portfolio: string;
    geographic_preferences: string;
    esg_preferences: string;
    decision_style: string;
    aum_range: string;
    time_horizons: Record<string, string>;
    beliefs_and_biases: string;
    raw_questionnaire: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT * FROM investor_profiles WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

export async function getCommitteeForUser(userId: string) {
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
    `SELECT c.* FROM ic_committees c
     JOIN investor_profiles p ON c.profile_id = p.id
     WHERE p.user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function verifyEvaluationAccess(evaluationId: string, userId: string) {
  const rows = await query<{ id: string }>(
    `SELECT e.id FROM ic_evaluations e
     JOIN ic_committees c ON e.committee_id = c.id
     JOIN investor_profiles p ON c.profile_id = p.id
     WHERE e.id = $1 AND p.user_id = $2`,
    [evaluationId, userId]
  );
  return rows.length > 0;
}

export async function verifyIdeaAccess(ideaId: string, userId: string) {
  const rows = await query<{ id: string }>(
    `SELECT i.id FROM ic_ideas i
     JOIN ic_committees c ON i.committee_id = c.id
     JOIN investor_profiles p ON c.profile_id = p.id
     WHERE i.id = $1 AND p.user_id = $2`,
    [ideaId, userId]
  );
  return rows.length > 0;
}
