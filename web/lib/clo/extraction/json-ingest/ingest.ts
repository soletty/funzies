// web/lib/clo/extraction/json-ingest/ingest.ts
import { query, getPool } from "../../../db";
import {
  ppmCapitalStructureSchema,
  ppmCoverageTestsSchema,
  ppmFeesSchema,
  ppmKeyDatesSchema,
  ppmKeyPartiesSchema,
  ppmPortfolioConstraintsSchema,
  ppmWaterfallRulesSchema,
  ppmInterestMechanicsSchema,
  transactionOverviewSchema,
  complianceSummarySchema,
  parValueTestsSchema,
  interestCoverageTestsSchema,
  collateralQualityTestsSchema,
  concentrationSchema,
  waterfallSchema,
  tradingActivitySchema,
  accountBalancesSchema,
  interestAccrualSchema,
  interestAccrualDetailSchema,
  defaultDetailSchema,
  supplementarySchema,
  assetScheduleSchema,
} from "../section-schemas";
import { normalizePpmSectionResults } from "../normalizer";
import { validateAndNormalizeConstraints } from "../../ingestion-gate";
import { syncPpmToRelationalTables } from "../persist-ppm";
import { persistComplianceSections } from "./persist-compliance";
import { mapPpm } from "./ppm-mapper";
import { mapCompliance } from "./compliance-mapper";
import type { PpmJson, ComplianceJson } from "./types";
import type { ExtractedConstraints } from "../../types/extraction";

type SchemaLike = { safeParse: (v: unknown) => { success: boolean; error?: unknown } };

const PPM_SCHEMAS: Record<string, SchemaLike> = {
  transaction_overview: transactionOverviewSchema,
  capital_structure: ppmCapitalStructureSchema,
  coverage_tests: ppmCoverageTestsSchema,
  key_dates: ppmKeyDatesSchema,
  key_parties: ppmKeyPartiesSchema,
  fees_and_expenses: ppmFeesSchema,
  portfolio_constraints: ppmPortfolioConstraintsSchema,
  waterfall_rules: ppmWaterfallRulesSchema,
  interest_mechanics: ppmInterestMechanicsSchema,
};

const COMPLIANCE_SCHEMAS: Record<string, SchemaLike> = {
  compliance_summary: complianceSummarySchema,
  par_value_tests: parValueTestsSchema,
  interest_coverage_tests: interestCoverageTestsSchema,
  collateral_quality_tests: collateralQualityTestsSchema,
  interest_accrual_detail: interestAccrualDetailSchema,
  asset_schedule: assetScheduleSchema,
  concentration_tables: concentrationSchema,
  waterfall: waterfallSchema,
  trading_activity: tradingActivitySchema,
  interest_accrual: interestAccrualSchema,
  account_balances: accountBalancesSchema,
  default_detail: defaultDetailSchema,
  supplementary: supplementarySchema,
};

function validateAll(
  sections: Record<string, Record<string, unknown>>,
  schemas: Record<string, SchemaLike>,
): { ok: true } | { ok: false; errors: Array<{ section: string; issues: unknown }> } {
  const errors: Array<{ section: string; issues: unknown }> = [];
  for (const [name, data] of Object.entries(sections)) {
    const schema = schemas[name];
    if (!schema) continue;
    const r = schema.safeParse(data);
    if (!r.success) errors.push({ section: name, issues: r.error });
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export async function ingestPpmJson(
  profileId: string,
  ppm: PpmJson,
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; errors: Array<{ section: string; issues: unknown }> }> {
  const sections = mapPpm(ppm);
  const validation = validateAll(sections, PPM_SCHEMAS);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const extractedConstraints: Record<string, unknown> = normalizePpmSectionResults(sections);
  const gate = validateAndNormalizeConstraints(extractedConstraints as ExtractedConstraints);
  if (gate.ok) {
    Object.assign(extractedConstraints, gate.data);
  } else {
    console.warn("[json-ingest] PPM gate validation failed:", gate.errors);
  }
  extractedConstraints._sectionBasedExtraction = true;
  extractedConstraints._jsonIngest = true;

  await query(
    `UPDATE clo_profiles
     SET extracted_constraints = $1::jsonb,
         ppm_raw_extraction = $2::jsonb,
         ppm_extracted_at = now(),
         ppm_extraction_status = 'complete',
         ppm_extraction_error = NULL,
         ppm_extraction_progress = $3::jsonb,
         updated_at = now()
     WHERE id = $4`,
    [
      JSON.stringify(extractedConstraints),
      JSON.stringify({ _jsonIngest: true, _rawInput: ppm }),
      JSON.stringify({ step: "complete", detail: "JSON ingest complete", updatedAt: new Date().toISOString() }),
      profileId,
    ],
  );

  const pool = getPool();
  await syncPpmToRelationalTables(pool, profileId, extractedConstraints);

  return {
    ok: true,
    counts: {
      sections_mapped: Object.keys(sections).length,
      tranches: Array.isArray(extractedConstraints.capitalStructure) ? (extractedConstraints.capitalStructure as unknown[]).length : 0,
      fees: Array.isArray(extractedConstraints.fees) ? (extractedConstraints.fees as unknown[]).length : 0,
      key_parties: Array.isArray(extractedConstraints.keyParties) ? (extractedConstraints.keyParties as unknown[]).length : 0,
    },
  };
}

export async function ingestComplianceJson(
  profileId: string,
  compliance: ComplianceJson,
): Promise<{ ok: true; reportPeriodId: string; counts: Record<string, number> } | { ok: false; errors: Array<{ section: string; issues: unknown }> }> {
  const sections = mapCompliance(compliance);
  const validation = validateAll(sections, COMPLIANCE_SCHEMAS);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  // Resolve deal — auto-create if missing, mirroring runner.ts getOrCreateDeal
  // (runner.ts:179-203) so the JSON compliance path is not stricter than the
  // LLM path. If PPM hasn't been ingested yet, we create a bare-bones deal from
  // whatever the compliance report gives us (issuer + collateral_manager from meta).
  const deals = await query<{ id: string }>(
    `SELECT id FROM clo_deals WHERE profile_id = $1`,
    [profileId],
  );
  let dealId: string;
  if (deals.length > 0) {
    dealId = deals[0].id;
  } else {
    const profileRows = await query<{ extracted_constraints: Record<string, unknown> | null }>(
      `SELECT extracted_constraints FROM clo_profiles WHERE id = $1`,
      [profileId],
    );
    const constraints = (profileRows[0]?.extracted_constraints ?? {}) as Record<string, unknown>;
    const dealIdentity = (constraints.dealIdentity ?? {}) as Record<string, string>;
    const cmDetails = (constraints.cmDetails ?? {}) as Record<string, string>;

    const dealName = dealIdentity.dealName ?? compliance.meta.issuer ?? null;
    const collateralManager = (constraints.collateralManager as string | undefined)
      ?? cmDetails.name
      ?? compliance.meta.collateral_manager
      ?? null;

    const inserted = await query<{ id: string }>(
      `INSERT INTO clo_deals (profile_id, deal_name, collateral_manager)
       VALUES ($1, $2, $3) RETURNING id`,
      [profileId, dealName, collateralManager],
    );
    dealId = inserted[0].id;
    console.log(`[json-ingest] created clo_deals row ${dealId} for profile ${profileId} (no prior PPM)`);
  }

  const reportDate = compliance.meta.determination_date;
  const periods = await query<{ id: string }>(
    `INSERT INTO clo_report_periods (deal_id, report_date, payment_date, reporting_period_start, reporting_period_end, extraction_status, report_source)
     VALUES ($1, $2, $3, $4, $5, 'extracting', 'json_ingest')
     ON CONFLICT (deal_id, report_date) DO UPDATE SET extraction_status = 'extracting', updated_at = now()
     RETURNING id`,
    [
      dealId,
      reportDate,
      compliance.key_dates.current_payment_date ?? null,
      compliance.key_dates.collection_period_start ?? null,
      compliance.key_dates.collection_period_end ?? null,
    ],
  );
  const reportPeriodId = periods[0].id;

  const result = await persistComplianceSections(sections, reportPeriodId, dealId, compliance);
  return { ok: true, reportPeriodId, counts: result.counts };
}
