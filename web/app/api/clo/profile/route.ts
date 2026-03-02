import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query(
    "SELECT * FROM clo_profiles WHERE user_id = $1",
    [user.id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const rows = await query<{ id: string }>(
    `INSERT INTO clo_profiles (
      user_id,
      fund_strategy,
      target_sectors,
      risk_appetite,
      portfolio_size,
      reinvestment_period,
      concentration_limits,
      covenant_preferences,
      rating_thresholds,
      spread_targets,
      regulatory_constraints,
      portfolio_description,
      beliefs_and_biases,
      raw_questionnaire
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (user_id) DO UPDATE SET
      fund_strategy = EXCLUDED.fund_strategy,
      target_sectors = EXCLUDED.target_sectors,
      risk_appetite = EXCLUDED.risk_appetite,
      portfolio_size = EXCLUDED.portfolio_size,
      reinvestment_period = EXCLUDED.reinvestment_period,
      concentration_limits = EXCLUDED.concentration_limits,
      covenant_preferences = EXCLUDED.covenant_preferences,
      rating_thresholds = EXCLUDED.rating_thresholds,
      spread_targets = EXCLUDED.spread_targets,
      regulatory_constraints = EXCLUDED.regulatory_constraints,
      portfolio_description = EXCLUDED.portfolio_description,
      beliefs_and_biases = EXCLUDED.beliefs_and_biases,
      raw_questionnaire = EXCLUDED.raw_questionnaire,
      updated_at = now()
    RETURNING id`,
    [
      user.id,
      body.fundStrategy || null,
      body.targetSectors || null,
      body.riskAppetite || null,
      body.portfolioSize || null,
      body.reinvestmentPeriod || null,
      body.concentrationLimits || null,
      body.covenantPreferences || null,
      body.ratingThresholds || null,
      body.spreadTargets || null,
      body.regulatoryConstraints || null,
      body.portfolioDescription || null,
      body.beliefsAndBiases || null,
      JSON.stringify(body),
    ]
  );

  // Note: documents and extracted_constraints are managed separately via
  // /api/clo/profile/upload and /api/clo/profile/extract endpoints

  return NextResponse.json(rows[0], { status: 201 });
}

const ALLOWED_FIELDS = new Set([
  "fund_strategy", "target_sectors", "risk_appetite", "portfolio_size",
  "reinvestment_period", "concentration_limits", "covenant_preferences",
  "rating_thresholds", "spread_targets", "regulatory_constraints",
  "portfolio_description", "beliefs_and_biases",
]);

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    updates.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.push(`updated_at = now()`);
  values.push(user.id);

  const rows = await query<{ id: string }>(
    `UPDATE clo_profiles SET ${updates.join(", ")} WHERE user_id = $${paramIndex} RETURNING id`,
    values
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profileId: rows[0].id });
}
