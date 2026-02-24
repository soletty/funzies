import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query(
    "SELECT * FROM investor_profiles WHERE user_id = $1",
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
    `INSERT INTO investor_profiles (
      user_id,
      investment_philosophy,
      risk_tolerance,
      asset_classes,
      current_portfolio,
      geographic_preferences,
      esg_preferences,
      decision_style,
      aum_range,
      time_horizons,
      beliefs_and_biases,
      raw_questionnaire
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (user_id) DO UPDATE SET
      investment_philosophy = EXCLUDED.investment_philosophy,
      risk_tolerance = EXCLUDED.risk_tolerance,
      asset_classes = EXCLUDED.asset_classes,
      current_portfolio = EXCLUDED.current_portfolio,
      geographic_preferences = EXCLUDED.geographic_preferences,
      esg_preferences = EXCLUDED.esg_preferences,
      decision_style = EXCLUDED.decision_style,
      aum_range = EXCLUDED.aum_range,
      time_horizons = EXCLUDED.time_horizons,
      beliefs_and_biases = EXCLUDED.beliefs_and_biases,
      raw_questionnaire = EXCLUDED.raw_questionnaire,
      updated_at = now()
    RETURNING id`,
    [
      user.id,
      body.investmentPhilosophy || null,
      body.riskTolerance || null,
      JSON.stringify(body.assetClasses || []),
      body.currentPortfolio || null,
      body.geographicPreferences || null,
      body.esgPreferences || null,
      body.decisionStyle || null,
      body.aumRange || null,
      JSON.stringify(body.timeHorizons || {}),
      body.beliefsAndBiases || null,
      JSON.stringify(body),
    ]
  );

  return NextResponse.json(rows[0], { status: 201 });
}
