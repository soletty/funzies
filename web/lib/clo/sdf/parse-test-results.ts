import { parseCsvLines, parsePercentage, parseDate, parseNumeric } from "./csv-utils";
import { isHigherBetter } from "../test-direction";
import { KNOWN_CLAUSE_LETTERS } from "../clause-letters";
import type { SdfParseResult } from "./types";

export interface SdfTestResultRow {
  test_name: string;
  test_type: string;
  test_class: string | null;
  actual_value: number | null;
  trigger_level: number | null;
  cushion_pct: number | null;
  is_passing: boolean | null;
  is_active: boolean;
  test_date: string | null;
  vendor_id: string | null;
  data_source: string;
}

// PPM clause-letter map for SDF rows. Maps each lettered clause to its
// (testType, testClass) row-shape values. SDF-vocabulary local —
// `test-direction.ts` deliberately does not import this. Both modules
// share the *key inventory* via `clause-letters.ts` (KNOWN_CLAUSE_LETTERS)
// so a new clause is one edit there; the bijection between this map's
// keys and that set is asserted by `__tests__/clause-letters.test.ts`.
// Exported for the clause-letter bijection test only; production callers
// should classify via `classifyTest` rather than reaching into this map.
export const CLAUSE_MAP: Record<string, { type: string; testClass: string }> = {
  a: { type: "CONCENTRATION", testClass: "ASSET_TYPE_SR_SECURED" },
  b: { type: "CONCENTRATION", testClass: "ASSET_TYPE_SR_LOANS" },
  c: { type: "CONCENTRATION", testClass: "ASSET_TYPE_UNSECURED" },
  d: { type: "CONCENTRATION", testClass: "FIXED_RATE" },
  e: { type: "CONCENTRATION", testClass: "ASSET_TYPE_BONDS" },
  f: { type: "CONCENTRATION", testClass: "COV_LITE" },
  g: { type: "CONCENTRATION", testClass: "HEDGED" },
  h: { type: "CONCENTRATION", testClass: "COUNTRY" },
  i: { type: "CONCENTRATION", testClass: "COUNTRY" },
  j: { type: "CONCENTRATION", testClass: "CURRENT_PAY" },
  k: { type: "CONCENTRATION", testClass: "BRIDGE_LOANS" },
  l: { type: "CONCENTRATION", testClass: "REVOLVING_DDTL" },
  m: { type: "CONCENTRATION", testClass: "PIK" },
  n: { type: "CONCENTRATION", testClass: "RATING_CCC_MOODYS" },
  o: { type: "CONCENTRATION", testClass: "RATING_CCC_FITCH" },
  p: { type: "CONCENTRATION", testClass: "SINGLE_OBLIGOR" },
  q: { type: "CONCENTRATION", testClass: "SINGLE_OBLIGOR" },
  r: { type: "CONCENTRATION", testClass: "SINGLE_OBLIGOR" },
  s: { type: "CONCENTRATION", testClass: "TOP_OBLIGORS" },
  t: { type: "CONCENTRATION", testClass: "INDUSTRY" },
  u: { type: "CONCENTRATION", testClass: "CORPORATE_RESCUE" },
  v: { type: "CONCENTRATION", testClass: "PARTICIPATIONS" },
  w: { type: "CONCENTRATION", testClass: "INDEBTEDNESS" },
  x: { type: "CONCENTRATION", testClass: "DISCOUNT" },
  y: { type: "CONCENTRATION", testClass: "PORTFOLIO_COMPANY" },
  z: { type: "ELIGIBILITY", testClass: "COUNTERPARTY" },
  aa: { type: "CONCENTRATION", testClass: "ANNUAL_OBLIGATIONS" },
  bb: { type: "CONCENTRATION", testClass: "DISTRESSED_EXCHANGE" },
  cc: { type: "CONCENTRATION", testClass: "SECTOR_RESTRICTION" },
  dd: { type: "CONCENTRATION", testClass: "DERIVED_RATING" },
};

function classifyTest(testName: string): { type: string; testClass: string | null } {
  if (testName.includes("Par Value Test")) {
    const classMatch = testName.match(/^Class\s+(.+?)\s+Par Value Test/);
    return { type: "OC_PAR", testClass: classMatch ? classMatch[1] : null };
  }
  if (testName.includes("Interest Coverage Test")) {
    const classMatch = testName.match(/^Class\s+(.+?)\s+Interest Coverage Test/);
    return { type: "IC", testClass: classMatch ? classMatch[1] : null };
  }
  if (testName.includes("Reinvestment Overcollateralisation")) {
    return { type: "INTEREST_DIVERSION", testClass: null };
  }
  if (testName.includes("Weighted Average Rating Factor")) {
    return { type: "WARF", testClass: null };
  }
  if (testName.includes("Weighted Average Floating Spread") || testName.includes("WAS")) {
    return { type: "WAS", testClass: null };
  }
  if (testName.includes("Diversity")) {
    return { type: "DIVERSITY", testClass: null };
  }
  if (testName.includes("Weighted Average Life")) {
    return { type: "WAL", testClass: null };
  }
  if (testName.includes("Recovery Rate")) {
    return { type: "RECOVERY", testClass: null };
  }
  if (testName === "Event of Default") {
    return { type: "OC_PAR", testClass: "EOD" };
  }

  const clauseMatch = testName.match(/^\(([a-z]{1,2})\)/i);
  if (clauseMatch) {
    const clause = clauseMatch[1].toLowerCase();
    const mapping = CLAUSE_MAP[clause];
    if (mapping) return { type: mapping.type, testClass: mapping.testClass };
  }

  if (testName.includes("Counterparty Rating Event")) {
    return { type: "ELIGIBILITY", testClass: "COUNTERPARTY_RATING" };
  }
  if (testName.includes("Frequency Switch")) {
    return { type: "ELIGIBILITY", testClass: "FREQUENCY_SWITCH" };
  }
  if (testName.includes("Maximum Obligor Concentration")) {
    return { type: "CONCENTRATION", testClass: "OBLIGOR_CONCENTRATION" };
  }

  return { type: "ELIGIBILITY", testClass: null };
}

function parsePassFail(value: string): { isPassing: boolean | null; isActive: boolean } {
  const trimmed = value.trim();
  if (trimmed === "Passed") return { isPassing: true, isActive: true };
  if (trimmed === "Failed") return { isPassing: false, isActive: true };
  if (trimmed === "Not Calculated") return { isPassing: null, isActive: false };
  return { isPassing: null, isActive: false };
}

function parseValue(raw: string): number | null {
  const pct = parsePercentage(raw);
  if (pct !== null) return pct;
  return parseNumeric(raw);
}

function computeCushion(
  actual: number | null,
  trigger: number | null,
  higherIsBetter: boolean | null
): number | null {
  if (higherIsBetter === null || actual === null || trigger === null) return null;
  return higherIsBetter ? actual - trigger : trigger - actual;
}

export function parseTestResults(csvText: string): SdfParseResult<SdfTestResultRow> {
  const { rows: csvRows } = parseCsvLines(csvText);

  const firstRow = csvRows[0];
  const dealName = firstRow?.Deal_Name?.trim() || null;
  const asOfDate = parseDate(firstRow?.As_Of_Date, "DD-Mon-YYYY");
  const periodBeginDate = parseDate(firstRow?.Period_Begin_Date, "DD-Mon-YYYY");

  const rows: SdfTestResultRow[] = csvRows.map((raw) => {
    const testName = raw.Test_Name?.trim() ?? "";
    const { type, testClass } = classifyTest(testName);
    const { isPassing, isActive } = parsePassFail(raw.Pass_Fail ?? "");

    const actual = parseValue(raw.Calculated_Result);
    const trigger = parseValue(raw.Trigger);
    const cushion = computeCushion(actual, trigger, isHigherBetter(type, testName));

    return {
      test_name: testName,
      test_type: type,
      test_class: testClass,
      actual_value: actual,
      trigger_level: trigger,
      cushion_pct: cushion,
      is_passing: isPassing,
      is_active: isActive,
      test_date: parseDate(raw.Test_Date, "DD-Mon-YYYY"),
      vendor_id: raw.Vendor_ID?.trim() || null,
      data_source: "sdf",
    };
  });

  return {
    fileType: "test_results",
    periodBeginDate,
    asOfDate,
    dealName,
    rows,
    rowCount: rows.length,
  };
}
