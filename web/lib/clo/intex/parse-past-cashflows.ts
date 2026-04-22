import { parseCsvRow, parseNumeric } from "../sdf/csv-utils";

/**
 * Parser for the Intex "Past Cashflows" xlsx, exported as CSV.
 *
 * The sheet "DealCF-MV+" has a rigid column layout with three header rows
 * (group / subgroup / column label) and multi-line metadata at the top, then
 * per-period rows starting after a row with "Period" / "Date" in the first
 * two cells. We key off that marker and read data rows positionally — the
 * column layout is fixed across deals using this Intex report template.
 *
 * Column layout (0-indexed):
 *   0: Period index ("0", "1", ..., or blank for summary rows)
 *   1: Date (e.g. "Dec 15, 2021" or "07/15/2022")
 *   2-21: Collateral block (aggregate principal/interest/balance/etc.)
 *   22-23: Deal balance / factor
 *   24-35: Expenses (senior, sr-mgmt, sub-mgmt, incentive — each Due/Paid/Unpaid)
 *   36-39: Interest smoothing
 *   39-124: Per-tranche blocks (11 cols each, except B2 and Sub at 10)
 *   125+: OC/IC tests, EoD triggers, EURIBOR series
 */

export interface IntexTrancheSnapshot {
  className: string;
  principalPaid: number | null;
  interestPaid: number | null;
  endingBalance: number | null;
  interestShortfall: number | null;
  cumulativeShortfall: number | null;
  principalWritedown: number | null;
  accumPrincipalWritedown: number | null;
  rateResetIndex: number | null;
}

export interface IntexPeriodRow {
  periodIndex: number;
  date: string; // ISO YYYY-MM-DD
  collateralPrincipal: number | null;
  collateralInterest: number | null;
  collateralBalance: number | null;
  netLoss: number | null;
  senior_mgmt_fee_paid: number | null;
  sub_mgmt_fee_paid: number | null;
  incentive_fee_paid: number | null;
  tranches: IntexTrancheSnapshot[];
}

export interface IntexParseResult {
  dealName: string | null;
  dealCode: string | null;
  settlementDate: string | null;
  reportCreated: string | null;
  periods: IntexPeriodRow[];
}

// ---------------------------------------------------------------------------
// Tranche column layout — zero-indexed starts; block widths & "floating" flag.
// ---------------------------------------------------------------------------

const TRANCHE_BLOCKS: Array<{ className: string; start: number; floating: boolean }> = [
  { className: "Class A",            start: 39, floating: true  },
  { className: "Class B-1",          start: 50, floating: true  },
  { className: "Class B-2",          start: 61, floating: false }, // 10-col (no rate reset)
  { className: "Class C",            start: 71, floating: true  },
  { className: "Class D",            start: 82, floating: true  },
  { className: "Class E",            start: 93, floating: true  },
  { className: "Class F",            start: 104, floating: true },
  { className: "Subordinated Notes", start: 115, floating: false }, // 10-col
];

// Within a tranche block, these are the offsets from the block start.
const OFF_PRINCIPAL              = 0;
const OFF_INTEREST               = 1;
// OFF_CASHFLOW is 2 — derived, skipped
const OFF_BALANCE                = 3;
const OFF_INTEREST_SHORTFALL     = 4;
const OFF_ACCUM_INT_SHORTFALL    = 5;
const OFF_PRINC_WRITEDOWN        = 6;
// OFF_PREPAY_PENALTY is 7 — skipped
// OFF_IMPLIED_WRITEDOWN is 8 — skipped
const OFF_ACCUM_PRINC_WRITEDOWN  = 9;
const OFF_RATE_RESET             = 10;

// Aggregate "Collateral" block offsets (at the front of the row).
const COL_COLLAT_PRINCIPAL = 2;
const COL_COLLAT_INTEREST  = 3;
const COL_COLLAT_BALANCE   = 7;
const COL_NET_LOSS         = 8;
// Senior mgmt fee paid lives in the Sen_Mgmt_Fee subgroup → column 27 (Current Paid)
const COL_SEN_MGMT_PAID    = 27;
const COL_SUB_MGMT_PAID    = 30;
const COL_INCENTIVE_PAID   = 33;

// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Parse dates Intex uses: "Dec 15, 2021", "Jul 15, 2022", "07/15/2022", "2022-07-15". */
function parseIntexDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO pass-through
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "Dec 15, 2021" or "Jul 15 2022"
  const named = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const mon = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (mon) return `${named[3]}-${mon}-${named[2].padStart(2, "0")}`;
  }
  // "7/15/2022" US format
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

/** Read a per-tranche slice starting at `start`. `floating` governs whether
 *  we pull a Rate Reset Index value from offset 10. */
function readTrancheBlock(
  cells: string[],
  className: string,
  start: number,
  floating: boolean,
): IntexTrancheSnapshot {
  return {
    className,
    principalPaid:           parseNumeric(cells[start + OFF_PRINCIPAL]),
    interestPaid:            parseNumeric(cells[start + OFF_INTEREST]),
    endingBalance:           parseNumeric(cells[start + OFF_BALANCE]),
    interestShortfall:       parseNumeric(cells[start + OFF_INTEREST_SHORTFALL]),
    cumulativeShortfall:     parseNumeric(cells[start + OFF_ACCUM_INT_SHORTFALL]),
    principalWritedown:      parseNumeric(cells[start + OFF_PRINC_WRITEDOWN]),
    accumPrincipalWritedown: parseNumeric(cells[start + OFF_ACCUM_PRINC_WRITEDOWN]),
    rateResetIndex:          floating ? parseNumeric(cells[start + OFF_RATE_RESET]) : null,
  };
}

/** Metadata rows in the sheet preamble: "Key:,,,Value". */
function scrapeMetaValue(rows: string[][], key: string): string | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const first = rows[i][0]?.trim() ?? "";
    if (first.toLowerCase().startsWith(key.toLowerCase())) {
      // Value is the first non-empty cell after the label
      for (let j = 1; j < rows[i].length; j++) {
        const v = rows[i][j]?.trim();
        if (v) return v;
      }
    }
  }
  return null;
}

export function parseIntexPastCashflows(csvText: string): IntexParseResult {
  const cleaned = csvText.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/);
  const rows = lines.map(l => parseCsvRow(l));

  // Preamble metadata (best-effort — absent values shouldn't fail the parse)
  const dealName = rows[0]?.[0]?.trim() || null;
  const dealCode = scrapeMetaValue(rows, "Deal Name:");
  const settlementDate = scrapeMetaValue(rows, "Settlement");
  const reportCreated = scrapeMetaValue(rows, "CF report created");

  // Find the data start row. Intex writes one "Period / Date" row, then a
  // "Hist Total" summary row, then another "Period / Date" header row, then
  // data. We scan for the SECOND occurrence of a row whose first two cells
  // are "Period" and "Date" (or period index + date), then start after it.
  let dataStart = -1;
  let seenFirstHeader = false;
  for (let i = 0; i < rows.length; i++) {
    const c0 = (rows[i][0] ?? "").trim().toLowerCase();
    const c1 = (rows[i][1] ?? "").trim().toLowerCase();
    if (c0 === "period" && c1 === "date") {
      if (seenFirstHeader) { dataStart = i + 1; break; }
      seenFirstHeader = true;
    }
  }
  if (dataStart < 0) {
    // Fallback: first row whose col 0 parses as an integer and col 1 as a date
    for (let i = 0; i < rows.length; i++) {
      const n = parseNumeric(rows[i][0]);
      const d = parseIntexDate(rows[i][1] ?? "");
      if (n != null && Number.isInteger(n) && d) { dataStart = i; break; }
    }
  }
  if (dataStart < 0) {
    return { dealName, dealCode, settlementDate, reportCreated, periods: [] };
  }

  const periods: IntexPeriodRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const pIdx = parseNumeric(r[0]);
    const date = parseIntexDate(r[1] ?? "");
    // Stop at the first row that isn't a period data row (blank or non-numeric period)
    if (pIdx == null || !Number.isInteger(pIdx) || !date) continue;

    const tranches = TRANCHE_BLOCKS.map(b =>
      readTrancheBlock(r, b.className, b.start, b.floating)
    );

    periods.push({
      periodIndex: pIdx,
      date,
      collateralPrincipal: parseNumeric(r[COL_COLLAT_PRINCIPAL]),
      collateralInterest:  parseNumeric(r[COL_COLLAT_INTEREST]),
      collateralBalance:   parseNumeric(r[COL_COLLAT_BALANCE]),
      netLoss:             parseNumeric(r[COL_NET_LOSS]),
      senior_mgmt_fee_paid: parseNumeric(r[COL_SEN_MGMT_PAID]),
      sub_mgmt_fee_paid:    parseNumeric(r[COL_SUB_MGMT_PAID]),
      incentive_fee_paid:   parseNumeric(r[COL_INCENTIVE_PAID]),
      tranches,
    });
  }

  return { dealName, dealCode, settlementDate, reportCreated, periods };
}
