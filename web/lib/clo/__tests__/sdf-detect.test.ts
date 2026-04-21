import { describe, it, expect } from "vitest";
import { detectSdfFileType } from "../sdf/detect";

describe("detectSdfFileType", () => {
  it("detects test_results", () => {
    const header = "Vendor_ID,Deal_ID,Deal_Name,Period_Begin_Date,As_Of_Date,Export_Date,Test_Date,Test_Name,Calculated_Result,Trigger,Pass_Fail";
    expect(detectSdfFileType(header + "\ndata")).toBe("test_results");
  });

  it("detects notes", () => {
    const header = "Deal_Name,Tranche_Name,Tranche_Type,Liab_Prin,CUSIP,ISIN,Original_Amount,SP_Rating,SP_Rating_Issuance,Fitch_Rating,Moodys_Rating,Fitch_Rating_Issuance,Moodys_Rating_Issuance,Current_Principal,Spread";
    expect(detectSdfFileType(header + "\ndata")).toBe("notes");
  });

  it("detects collateral_file", () => {
    const header = "Deal_Name,Issuer_Name,Security_Name,Principal_Funded_Balance,Native_Principal_Funded_Balance,Commitment,Native_Commitment,Principal_Balance,Native_Currency,Gross_Purchase_Price,Premium_Discount,Discount,Premium,Security_Type1,Market_Value";
    expect(detectSdfFileType(header + "\ndata")).toBe("collateral_file");
  });

  it("detects asset_level", () => {
    const header = "Vendor_ID,Deal_ID,Deal_Name,Issuer_Name,Outstanding_Funded_Balance,Moodys_Adj_DP_Rating_for_WARF";
    expect(detectSdfFileType(header + "\ndata")).toBe("asset_level");
  });

  it("detects accounts", () => {
    const header = "Vendor_ID,Deal_ID,Deal_Name,Period_Begin_Date,As_Of_Date,Export_Date,Account_Name,Account_Principal_Balance,Account_Interest";
    expect(detectSdfFileType(header + "\ndata")).toBe("accounts");
  });

  it("detects accruals", () => {
    const header = "Vendor_ID,Deal_ID,Accrual_Begin_Date,Accrual_End_Date,Annual_Interest_Adjusted_Spread";
    expect(detectSdfFileType(header + "\ndata")).toBe("accruals");
  });

  it("detects transactions", () => {
    const header = "Deal_Name,Cash_Flow_Type,Transaction_Code,Settle_Date,Amount";
    expect(detectSdfFileType(header + "\ndata")).toBe("transactions");
  });

  it("returns null for unrecognized format", () => {
    expect(detectSdfFileType("foo,bar,baz\n1,2,3")).toBeNull();
  });

  it("does not confuse collateral_file with asset_level", () => {
    const header = "Principal_Funded_Balance,Market_Value,Gross_Purchase_Price";
    expect(detectSdfFileType(header + "\ndata")).toBe("collateral_file");
  });
});
