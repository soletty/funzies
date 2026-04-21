import type { SdfFileType } from "./types";
import { parseCsvLines } from "./csv-utils";

interface Fingerprint {
  type: SdfFileType;
  mustHave: string[];
  mustNotHave: string[];
}

const FINGERPRINTS: Fingerprint[] = [
  {
    type: "test_results",
    mustHave: ["Test_Name", "Calculated_Result", "Pass_Fail"],
    mustNotHave: [],
  },
  {
    type: "notes",
    mustHave: ["Tranche_Name", "Current_Principal", "Spread"],
    mustNotHave: ["Outstanding_Funded_Balance"],
  },
  {
    type: "asset_level",
    mustHave: ["Moodys_Adj_DP_Rating_for_WARF", "Outstanding_Funded_Balance"],
    mustNotHave: [],
  },
  {
    type: "collateral_file",
    mustHave: ["Principal_Funded_Balance", "Market_Value", "Gross_Purchase_Price"],
    mustNotHave: ["Moodys_Adj_DP_Rating_for_WARF"],
  },
  {
    type: "accounts",
    mustHave: ["Account_Name", "Account_Principal_Balance"],
    mustNotHave: ["Test_Name"],
  },
  {
    type: "accruals",
    mustHave: ["Accrual_Begin_Date", "Annual_Interest_Adjusted_Spread"],
    mustNotHave: [],
  },
  {
    type: "transactions",
    mustHave: ["Cash_Flow_Type", "Transaction_Code", "Settle_Date"],
    mustNotHave: [],
  },
];

export function detectSdfFileType(csvText: string): SdfFileType | null {
  const { headers } = parseCsvLines(csvText.split(/\r?\n/).slice(0, 2).join("\n"));

  for (const fp of FINGERPRINTS) {
    const hasAll = fp.mustHave.every((h) => headers.includes(h));
    const hasNone = fp.mustNotHave.every((h) => !headers.includes(h));
    if (hasAll && hasNone) return fp.type;
  }

  return null;
}
