// web/lib/clo/extraction/json-ingest/compliance-mapper.ts

import type {
  ComplianceJson,
  ComplianceJsonTranche,
  ComplianceJsonHolding,
  ComplianceJsonAccrualPosition,
} from "./types";
import {
  decimalToPct,
  parseFlexibleDate,
  extractLxid,
  extractIsin,
} from "./utils";

export type ComplianceSections = Record<string, Record<string, unknown>>;

function mapComplianceSummary(c: ComplianceJson): Record<string, unknown> {
  const qualityByName = new Map(c.collateral_quality_tests.map((t) => [t.test.toLowerCase(), t.actual]));

  return {
    reportDate: c.meta.determination_date,
    paymentDate: c.key_dates.current_payment_date ?? null,
    reportType: "quarterly",
    dealName: c.meta.issuer ?? null,
    trusteeName: c.meta.trustee ?? null,
    collateralManager: c.meta.collateral_manager ?? null,
    closingDate: c.key_dates.closing_date ?? null,
    statedMaturity: c.key_dates.stated_maturity ?? null,
    nextPaymentDate: c.key_dates.next_payment_date ?? null,
    collectionPeriodEnd: c.key_dates.collection_period_end ?? null,
    reinvestmentPeriodEnd: c.key_dates.reinvestment_period_end ?? null,
    nonCallPeriodEnd: null,
    tranches: c.capital_structure.map((t: ComplianceJsonTranche) => ({
      className: t.tranche,
      principalAmount: t.original,
      spread: t.spread != null ? decimalToPct(t.spread) : null,
      allInRate: t.rate != null ? decimalToPct(t.rate) : null,
      currentBalance: t.current,
      rating: t.fitch ?? null,
      couponRate: t.rate != null ? decimalToPct(t.rate) : null,
    })),
    aggregatePrincipalBalance: c.pool_summary.aggregate_principal_balance ?? null,
    adjustedCollateralPrincipalAmount: c.pool_summary.adjusted_collateral_principal_amount ?? null,
    totalPar: c.pool_summary.adjusted_collateral_principal_amount ?? c.pool_summary.aggregate_principal_balance ?? null,
    wacSpread: (() => {
      const was = qualityByName.get("minimum wa floating spread") ?? qualityByName.get("minimum weighted average floating spread");
      return was != null ? decimalToPct(was) : null;   // 0.0368 → 3.68%
    })(),
    diversityScore: qualityByName.get("moody's minimum diversity") ?? null,
    warf: qualityByName.get("moody's maximum warf") ?? null,
    walYears: qualityByName.get("weighted average life") ?? null,
    waRecoveryRate: qualityByName.get("moody's minimum wa recovery") != null
      ? decimalToPct(qualityByName.get("moody's minimum wa recovery")!)
      : null,
    numberOfAssets: c.schedule_of_investments?.length ?? null,
  };
}

// "Admiral Bidco GmbH - Facility B2" → ["Admiral Bidco GmbH", "Facility B2"]
// Exported for use by mapAssetSchedule, mapTradingActivity, mapInterestAccrual (Tasks 7/8).
export function splitDescription(desc: string): [string, string] {
  const idx = desc.indexOf(" - ");
  if (idx === -1) return [desc.trim(), ""];
  return [desc.slice(0, idx).trim(), desc.slice(idx + 3).trim()];
}

function mapAssetSchedule(c: ComplianceJson): Record<string, unknown> {
  return {
    holdings: c.schedule_of_investments.map((h: ComplianceJsonHolding) => {
      const lxid = extractLxid(h.security_id);
      const isin = extractIsin(h.security_id);
      const [obligorName, facilityName] = splitDescription(h.description);
      return {
        obligorName,
        facilityName,
        isin,
        lxid,
        assetType: h.loan_type ?? null,
        maturityDate: parseFlexibleDate(h.maturity_date),
        parBalance: h.par_quantity ?? null,
        principalBalance: h.principal_balance ?? null,
        marketValue: h.principal_balance != null && h.market_price != null
          ? h.principal_balance * (h.market_price / 100)
          : null,
        currentPrice: h.market_price ?? null,
      };
    }),
  };
}

function mapInterestAccrualDetail(c: ComplianceJson): Record<string, unknown> {
  const positions = c.interest_accrual_detail?.positions ?? [];
  return {
    rows: positions.map((p: ComplianceJsonAccrualPosition) => {
      const lxid = extractLxid(p.security_id);
      const isin = extractIsin(p.security_id);
      return {
        description: p.description,
        securityId: p.security_id ?? null,
        lxid,
        isin,
        rateType: p.rate_type ?? null,
        paymentPeriod: p.payment_period ?? null,
        principalBalance: p.principal_balance ?? null,
        baseIndex: p.base_index ?? null,
        indexRatePct: p.index_rate_pct ?? null,
        indexFloorPct: p.index_floor_pct ?? null,
        spreadPct: p.spread_pct ?? null,
        creditSpreadAdjPct: p.credit_spread_adj_pct ?? null,
        effectiveSpreadPct: p.effective_spread_pct ?? null,
        allInRatePct: p.all_in_rate_pct ?? null,
        spreadBps: p.spread_bps ?? null,
      };
    }),
  };
}

function mapParValueTests(c: ComplianceJson): Record<string, unknown> {
  return {
    tests: c.par_value_tests.map((t) => {
      const className = t.test;
      const isEod = /event of default/i.test(t.test) || t.subtype === "EventOfDefault";
      const testType = /reinvestment/i.test(t.test) ? "INTEREST_DIVERSION" : "OC_PAR";
      return {
        testName: t.test,
        testType,
        testClass: isEod ? "EOD" : className.replace(/^Class\s*/i, "").trim(),
        numerator: t.numerator,
        denominator: t.denominator,
        actualValue: t.actual * 100,            // 1.3698 → 136.98
        triggerLevel: t.trigger * 100,
        cushionPct: t.cushion != null ? t.cushion * 100 : null,
        isPassing: t.result === "Passed" ? true : t.result === "Failed" ? false : null,
      };
    }),
    parValueAdjustments: [],  // synthesised later if adjusted_cpa_reconciliation has non-zero fields
  };
}

function mapInterestCoverageTests(c: ComplianceJson): Record<string, unknown> {
  return {
    tests: c.interest_coverage_tests.tests.map((t) => ({
      testName: t.test,
      testType: "IC",
      testClass: t.test.replace(/\s*IC$/, "").replace(/^Class\s*/i, "").trim(),
      numerator: t.numerator,
      denominator: t.denominator,
      actualValue: t.actual * 100,
      triggerLevel: t.trigger * 100,
      cushionPct: t.cushion != null ? t.cushion * 100 : null,
      isPassing: t.result === "Passed" ? true : t.result === "Failed" ? false : null,
    })),
    interestAmountsPerTranche: c.capital_structure.map((tr) => ({
      className: tr.tranche,
      interestAmount: tr.period_interest ?? null,
      currency: c.meta.reporting_currency ?? "EUR",
    })),
  };
}

function mapCollateralQualityTests(c: ComplianceJson): Record<string, unknown> {
  return {
    tests: c.collateral_quality_tests.map((t) => {
      const agency = /moody/i.test(t.test) ? "Moody's" : /fitch/i.test(t.test) ? "Fitch" : null;
      const triggerType: "MIN" | "MAX" = /min/i.test(t.test) ? "MIN" : /max/i.test(t.test) ? "MAX" : (t.actual < t.trigger ? "MIN" : "MAX");
      return {
        testName: t.test,
        agency,
        actualValue: t.actual,
        triggerLevel: t.trigger,
        triggerType,
        isPassing: t.result === "Passed" ? true : t.result === "Failed" ? false : null,
        cushion: triggerType === "MIN" ? t.actual - t.trigger : t.trigger - t.actual,
      };
    }),
  };
}

function mapConcentrationTables(c: ComplianceJson): Record<string, unknown> {
  return {
    concentrations: c.portfolio_profile_tests.map((p) => ({
      concentrationType: p.code,
      bucketName: p.test,
      actualValue: p.actual ?? null,
      actualPct: p.actual_pct ?? null,
      limitValue: p.limit ?? null,
      limitPct: p.limit_pct ?? null,
      excessAmount: null,
      isPassing: p.result === "Passed" ? true : p.result === "Failed" ? false : null,
      isHaircutApplied: null,
      haircutAmount: null,
      obligorCount: null,
      assetCount: null,
    })),
  };
}

export function mapCompliance(c: ComplianceJson): ComplianceSections {
  return {
    compliance_summary: mapComplianceSummary(c),
    asset_schedule: mapAssetSchedule(c),
    interest_accrual_detail: mapInterestAccrualDetail(c),
    par_value_tests: mapParValueTests(c),
    interest_coverage_tests: mapInterestCoverageTests(c),
    collateral_quality_tests: mapCollateralQualityTests(c),
    concentration_tables: mapConcentrationTables(c),
    // remaining sections added in Task 8
  };
}
