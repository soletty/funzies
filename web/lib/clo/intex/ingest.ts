import { getClient, query } from "../../db";
import {
  parseIntexPastCashflows,
  normalizeClassName,
  IntexSchemaMismatchError,
  type IntexParseResult,
  type IntexPeriodRow,
  type DealTrancheInfo,
} from "./parse-past-cashflows";

export interface IntexIngestResult {
  dealName: string | null;
  periodsParsed: number;
  periodsInserted: number;
  periodsUpdated: number;
  snapshotsUpserted: number;
  skipped: Array<{ periodIndex: number; date: string; reason: string }>;
  warnings: string[];
}

export async function ingestIntexPastCashflows(
  dealId: string,
  csvText: string,
): Promise<IntexIngestResult> {
  // Load the deal's tranches first — both as authority for the parser's
  // schema-driven discovery and as the lookup table for per-snapshot
  // routing later. is_floating drives per-block width discovery; the parser
  // throws IntexSchemaMismatchError if the CSV's group-row doesn't match.
  const existingTranches = await query<{ id: string; class_name: string; is_floating: boolean | null }>(
    `SELECT id, class_name, is_floating FROM clo_tranches WHERE deal_id = $1`,
    [dealId]
  );
  if (existingTranches.length === 0) {
    // dealId omitted from the diff intentionally — the partner-facing 422
    // body should not echo internal row identifiers. The actionable signal
    // is in the message: "ingest SDF/PPM first."
    throw new IntexSchemaMismatchError({
      kind: "deal_has_no_tranches",
      message: `This deal has no tranches recorded yet. Ingest the SDF / PPM tranche structure before importing Intex past cashflows.`,
    });
  }
  const dealTranches: DealTrancheInfo[] = existingTranches.map(t => ({
    className: t.class_name,
    // Default to floating when DB has null. Parser will throw width mismatch
    // if the discovered block width disagrees with this assumption — that's
    // the fail-loud signal that the SDF/PPM ingest didn't populate is_floating.
    isFloating: t.is_floating ?? true,
  }));
  const trancheIdByNormName = new Map<string, string>();
  for (const t of existingTranches) {
    trancheIdByNormName.set(normalizeClassName(t.class_name), t.id);
  }

  // Parse and validate. Throws IntexSchemaMismatchError BEFORE any DB write
  // on a structural mismatch — caller (API route) catches and returns 422.
  const parsed: IntexParseResult = parseIntexPastCashflows(csvText, dealTranches);
  const result: IntexIngestResult = {
    dealName: parsed.dealName,
    periodsParsed: parsed.periods.length,
    periodsInserted: 0,
    periodsUpdated: 0,
    snapshotsUpserted: 0,
    skipped: [],
    warnings: [],
  };

  if (parsed.periods.length === 0) {
    result.warnings.push("No period rows found in the CSV — check that the file is the Intex 'DealCF-MV+' export.");
    return result;
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    for (const period of parsed.periods) {
      const { periodIdAction, periodId } = await upsertReportPeriod(client, dealId, period);
      if (periodIdAction === "inserted") result.periodsInserted++;
      else result.periodsUpdated++;

      for (const snap of period.tranches) {
        const normName = normalizeClassName(snap.className);
        const trancheId = trancheIdByNormName.get(normName);
        if (!trancheId) {
          // Unreachable: snap.className is sourced from discoveredTranches,
          // which the parser builds from dealTranches itself, which built
          // trancheIdByNormName from the same DB rows. If this fires the
          // assumption that "validated parse output round-trips through
          // normalizeClassName" has broken — surface loudly rather than
          // silently inserting a phantom row.
          throw new IntexSchemaMismatchError({
            kind: "post_validation_unmatched_tranche",
            className: snap.className,
            normalizedAs: normName,
            message: `Snapshot for tranche "${snap.className}" (normalized "${normName}") has no matching clo_tranches row even though parse-time validation passed. Refusing to insert a phantom row; investigate normalization mismatch.`,
          });
        }

        await upsertTrancheSnapshot(client, trancheId, periodId, snap);
        result.snapshotsUpserted++;
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Persist deal-level scenario assumptions best-effort, AFTER the period
  // commit. Keeping this outside the transaction means a missing migration
  // (012_add_intex_assumptions) doesn't roll back 17 periods of cashflow
  // history — the periods are the load-bearing data; assumptions are a UI
  // pre-fill nicety.
  if (parsed.assumptions) {
    try {
      await query(
        `UPDATE clo_deals SET intex_assumptions = $1::jsonb, updated_at = now() WHERE id = $2`,
        [JSON.stringify(parsed.assumptions), dealId],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.warnings.push(
        `intex_assumptions persist failed: ${msg} (run migration 012_add_intex_assumptions.sql)`,
      );
    }
  }

  return result;
}

async function upsertReportPeriod(
  client: import("pg").PoolClient,
  dealId: string,
  period: IntexPeriodRow,
): Promise<{ periodIdAction: "inserted" | "updated"; periodId: string }> {
  // The Intex sheet reports a payment date per row (e.g., 2026-04-15).
  // Existing SDF/compliance periods use the determination date as report_date
  // (e.g., 2026-04-01) with payment_date = 2026-04-15. Match on EITHER so we
  // reuse the richer existing period rather than creating a duplicate that
  // shadows the SDF data (prior bug: creating a new "2026-04-15" period
  // beat the SDF "2026-04-01" period on `getLatestReportPeriod`, hiding all
  // holdings/compliance tests in the UI).
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM clo_report_periods
       WHERE deal_id = $1
         AND (report_date = $2 OR payment_date = $2)
       ORDER BY report_date DESC
       LIMIT 1`,
    [dealId, period.date]
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE clo_report_periods SET
         payment_date = COALESCE(payment_date, $2),
         report_type = COALESCE(report_type, 'quarterly'),
         report_source = COALESCE(report_source, 'intex_past_cashflows'),
         extraction_status = COALESCE(NULLIF(extraction_status, ''), 'complete')
       WHERE id = $1`,
      [existing.rows[0].id, period.date]
    );
    return { periodIdAction: "updated", periodId: existing.rows[0].id };
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO clo_report_periods
       (id, deal_id, report_date, payment_date, report_type, report_source, extraction_status)
     VALUES (gen_random_uuid(), $1, $2, $2, 'quarterly', 'intex_past_cashflows', 'complete')
     RETURNING id`,
    [dealId, period.date]
  );
  return { periodIdAction: "inserted", periodId: inserted.rows[0].id };
}

async function upsertTrancheSnapshot(
  client: import("pg").PoolClient,
  trancheId: string,
  reportPeriodId: string,
  snap: {
    principalPaid: number | null;
    interestPaid: number | null;
    endingBalance: number | null;
    interestShortfall: number | null;
    cumulativeShortfall: number | null;
    rateResetIndex: number | null;
  },
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM clo_tranche_snapshots WHERE tranche_id = $1 AND report_period_id = $2`,
    [trancheId, reportPeriodId]
  );

  if (existing.rows.length > 0) {
    // Only overwrite fields that Intex carries. Leave SDF-populated enrichment
    // columns (ratings, accrual dates) alone — Intex can't produce them.
    await client.query(
      `UPDATE clo_tranche_snapshots SET
         principal_paid       = COALESCE($1, principal_paid),
         interest_paid        = COALESCE($2, interest_paid),
         ending_balance       = COALESCE($3, ending_balance),
         current_balance      = COALESCE($3, current_balance),
         interest_shortfall   = COALESCE($4, interest_shortfall),
         cumulative_shortfall = COALESCE($5, cumulative_shortfall),
         current_index_rate   = COALESCE($6, current_index_rate),
         data_source          = CASE
           WHEN data_source IS NULL OR data_source = '' THEN 'intex_past_cashflows'
           WHEN data_source LIKE '%intex%' THEN data_source
           ELSE data_source || '+intex_past_cashflows'
         END
       WHERE id = $7`,
      [
        snap.principalPaid,
        snap.interestPaid,
        snap.endingBalance,
        snap.interestShortfall,
        snap.cumulativeShortfall,
        snap.rateResetIndex,
        existing.rows[0].id,
      ]
    );
    return;
  }

  await client.query(
    `INSERT INTO clo_tranche_snapshots (
       id, tranche_id, report_period_id,
       principal_paid, interest_paid,
       ending_balance, current_balance,
       interest_shortfall, cumulative_shortfall,
       current_index_rate, data_source
     ) VALUES (
       gen_random_uuid(), $1, $2,
       $3, $4,
       $5, $5,
       $6, $7,
       $8, 'intex_past_cashflows'
     )`,
    [
      trancheId,
      reportPeriodId,
      snap.principalPaid,
      snap.interestPaid,
      snap.endingBalance,
      snap.interestShortfall,
      snap.cumulativeShortfall,
      snap.rateResetIndex,
    ]
  );
}
