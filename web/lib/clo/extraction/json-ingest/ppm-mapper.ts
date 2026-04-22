// web/lib/clo/extraction/json-ingest/ppm-mapper.ts

import type {
  PpmJson,
  PpmJsonTranche,
  PpmJsonTransactionParty,
} from "./types";
import { pctToBps, decimalSpreadToBps, parseFlexibleDate } from "./utils";

export type PpmSections = Record<string, Record<string, unknown>>;

// PPM-side Zod schemas use `z.string().optional()` — meaning `string | undefined`,
// NOT `string | null`. null values WILL fail safeParse. All mapper fields that
// might be absent must use `?? undefined`, and any `parseFlexibleDate` result
// must be coerced with `?? undefined` before being placed into a PPM-schema field.
const u = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

function mapTransactionOverview(ppm: PpmJson): Record<string, unknown> {
  const di = ppm.section_1_deal_identity;
  const cm = di.transaction_parties.find((p) => p.role === "Collateral Manager");
  return {
    dealName: di.legal_name,
    issuerLegalName: di.legal_name,
    collateralManager: u(cm?.entity),
    jurisdiction: u(di.jurisdiction),
    entityType: u(di.entity_form),
    governingLaw: u(di.jurisdiction),
    currency: u(ppm.meta.reporting_currency as string | undefined),
    listingExchange: u(di.listing),
  };
}

function mapCapitalStructure(ppm: PpmJson): Record<string, unknown> {
  const tranches = ppm.section_3_capital_structure.tranches;
  return {
    capitalStructure: tranches.map((t: PpmJsonTranche) => {
      const spreadBps =
        t.margin_decimal != null ? decimalSpreadToBps(t.margin_decimal)
        : t.spread_pct != null ? pctToBps(t.spread_pct)
        : t.fixed_coupon_decimal != null ? decimalSpreadToBps(t.fixed_coupon_decimal)
        : t.fixed_coupon_pct != null ? pctToBps(t.fixed_coupon_pct)
        : null;
      const isSub = /sub|subordinated|residual/i.test(t.class) || t.rate_type === "residual";
      return {
        class: t.class,
        principalAmount: String(t.principal),
        rateType: t.rate_type ?? undefined,   // ppmCapitalStructure schema is string | undefined (not nullable)
        referenceRate: t.rate_type === "floating" ? "EURIBOR" : undefined,
        spreadBps: spreadBps ?? undefined,
        rating: {
          fitch: t.fitch ?? undefined,
          moodys: t.moodys ?? undefined,
        },
        isSubordinated: isSub,
        maturityDate: parseFlexibleDate(ppm.section_3_capital_structure.common_maturity as string | undefined) ?? undefined,
      };
    }),
    dealSizing: {
      targetParAmount: ppm.section_1_deal_identity.target_par_amount?.amount != null
        ? String(ppm.section_1_deal_identity.target_par_amount.amount)
        : undefined,
      totalRatedNotes: ppm.section_3_capital_structure.rated_notes_principal != null
        ? String(ppm.section_3_capital_structure.rated_notes_principal)
        : undefined,
      totalSubordinatedNotes: ppm.section_3_capital_structure.subordinated_principal != null
        ? String(ppm.section_3_capital_structure.subordinated_principal)
        : undefined,
      totalDealSize: ppm.section_3_capital_structure.total_principal != null
        ? String(ppm.section_3_capital_structure.total_principal)
        : undefined,
    },
  };
}

function mapKeyDates(ppm: PpmJson): Record<string, unknown> {
  const kd = ppm.section_2_key_dates;
  return {
    originalIssueDate: u(parseFlexibleDate(kd.issue_date)),
    currentIssueDate: u(parseFlexibleDate(kd.effective_date_actual)),
    maturityDate: u(parseFlexibleDate(kd.stated_maturity)),
    nonCallPeriodEnd: u(parseFlexibleDate(kd.non_call_period_end)),
    reinvestmentPeriodEnd: u(parseFlexibleDate(kd.reinvestment_period_end)),
    firstPaymentDate: u(parseFlexibleDate(kd.first_payment_date)),
    paymentFrequency: u(kd.payment_frequency),
  };
}

function mapKeyParties(ppm: PpmJson): Record<string, unknown> {
  const parties = ppm.section_1_deal_identity.transaction_parties;
  const cm = parties.find((p) => p.role === "Collateral Manager");
  return {
    keyParties: parties.map((p: PpmJsonTransactionParty) => ({
      role: p.role,
      entity: p.entity,
    })),
    cmDetails: cm ? { name: cm.entity, parent: undefined, replacementMechanism: undefined } : undefined,
  };
}

export function mapPpm(ppm: PpmJson): PpmSections {
  return {
    transaction_overview: mapTransactionOverview(ppm),
    capital_structure: mapCapitalStructure(ppm),
    key_dates: mapKeyDates(ppm),
    key_parties: mapKeyParties(ppm),
    // remaining sections added in subsequent tasks
  };
}
