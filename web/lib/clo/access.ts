import { query } from "@/lib/db";
import type { CloProfile } from "./types";

export function rowToProfile(row: Record<string, unknown>): CloProfile {
  return {
    id: row.id as string,
    userId: (row.user_id as string) || "",
    fundStrategy: (row.fund_strategy as string) || "",
    targetSectors: (row.target_sectors as string) || "",
    riskAppetite: (row.risk_appetite as CloProfile["riskAppetite"]) || "moderate",
    portfolioSize: (row.portfolio_size as string) || "",
    reinvestmentPeriod: (row.reinvestment_period as string) || "",
    concentrationLimits: (row.concentration_limits as string) || "",
    covenantPreferences: (row.covenant_preferences as string) || "",
    ratingThresholds: (row.rating_thresholds as string) || "",
    spreadTargets: (row.spread_targets as string) || "",
    regulatoryConstraints: (row.regulatory_constraints as string) || "",
    portfolioDescription: (row.portfolio_description as string) || "",
    beliefsAndBiases: (row.beliefs_and_biases as string) || "",
    rawQuestionnaire: (row.raw_questionnaire as Record<string, unknown>) || {},
    documents: (row.documents as CloProfile["documents"]) || [],
    extractedConstraints: (row.extracted_constraints as CloProfile["extractedConstraints"]) || {},
    extractedPortfolio: (row.extracted_portfolio as CloProfile["extractedPortfolio"]) || null,
    createdAt: (row.created_at as string) || "",
    updatedAt: (row.updated_at as string) || "",
  };
}

// Lightweight profile fetch — excludes the `documents` column (which can be 20MB+ of base64).
// Use `getProfileWithDocuments` when you need the raw document data.
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
    extracted_constraints: Record<string, unknown>;
    extracted_portfolio: unknown;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, user_id, fund_strategy, target_sectors, risk_appetite, portfolio_size,
            reinvestment_period, concentration_limits, covenant_preferences, rating_thresholds,
            spread_targets, regulatory_constraints, portfolio_description, beliefs_and_biases,
            raw_questionnaire, extracted_constraints, extracted_portfolio, created_at, updated_at
     FROM clo_profiles WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

// Full profile fetch including raw documents — use only when sending docs to Claude.
export async function getProfileWithDocuments(userId: string) {
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
    documents: Array<{ name: string; type: string; size: number; base64: string }>;
    extracted_constraints: Record<string, unknown>;
    extracted_portfolio: unknown;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT * FROM clo_profiles WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

// Fetch just document metadata (name, type, size) without the heavy base64 data.
export async function getProfileDocumentMeta(userId: string): Promise<Array<{ name: string; type: string; size: number }>> {
  const rows = await query<{ documents: Array<{ name: string; type: string; size: number }> }>(
    `SELECT jsonb_agg(jsonb_build_object('name', d->>'name', 'type', d->>'type', 'size', (d->>'size')::int))
       AS documents
     FROM clo_profiles, jsonb_array_elements(documents) AS d
     WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.documents || [];
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
