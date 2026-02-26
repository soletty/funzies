import type { Pass1Output, Pass2Output, Pass3Output, Pass4Output, Pass5Output } from "./schemas";

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toDbRow(obj: Record<string, unknown>, extraFields?: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = { ...extraFields };
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      row[toSnakeCase(key)] = value;
    }
  }
  return row;
}

export function normalizePass1(data: Pass1Output, reportPeriodId: string): {
  poolSummary: Record<string, unknown>;
  complianceTests: Record<string, unknown>[];
  accountBalances: Record<string, unknown>[];
  parValueAdjustments: Record<string, unknown>[];
} {
  const base = { report_period_id: reportPeriodId };

  return {
    poolSummary: toDbRow(data.poolSummary, base),
    complianceTests: data.complianceTests.map((t) => toDbRow(t, base)),
    accountBalances: data.accountBalances.map((a) => toDbRow(a, base)),
    parValueAdjustments: data.parValueAdjustments.map((p) => toDbRow(p, base)),
  };
}

export function normalizePass2(data: Pass2Output, reportPeriodId: string): {
  holdings: Record<string, unknown>[];
} {
  const base = { report_period_id: reportPeriodId };
  return {
    holdings: data.holdings.map((h) => toDbRow(h, base)),
  };
}

export function normalizePass3(data: Pass3Output, reportPeriodId: string): {
  concentrations: Record<string, unknown>[];
} {
  const base = { report_period_id: reportPeriodId };
  return {
    concentrations: data.concentrations.map((c) => toDbRow(c, base)),
  };
}

export function normalizePass4(data: Pass4Output, reportPeriodId: string): {
  waterfallSteps: Record<string, unknown>[];
  proceeds: Record<string, unknown>[];
  trades: Record<string, unknown>[];
  tradingSummary: Record<string, unknown> | null;
  trancheSnapshots: Array<{ className: string; data: Record<string, unknown> }>;
} {
  const base = { report_period_id: reportPeriodId };

  return {
    waterfallSteps: data.waterfallSteps.map((w) => toDbRow(w, base)),
    proceeds: data.proceeds.map((p) => toDbRow(p, base)),
    trades: data.trades.map((t) => toDbRow(t, base)),
    tradingSummary: data.tradingSummary ? toDbRow(data.tradingSummary, base) : null,
    trancheSnapshots: data.trancheSnapshots.map((ts) => {
      const { className, ...rest } = ts;
      return { className, data: toDbRow(rest, base) };
    }),
  };
}

export function normalizePass5(data: Pass5Output, reportPeriodId: string, dealId: string): {
  supplementaryData: Record<string, unknown>;
  events: Record<string, unknown>[];
} {
  const { events, _overflow, ...supplementaryFields } = data;

  return {
    supplementaryData: supplementaryFields as Record<string, unknown>,
    events: events.map((e) => toDbRow(e, { deal_id: dealId, report_period_id: reportPeriodId })),
  };
}
