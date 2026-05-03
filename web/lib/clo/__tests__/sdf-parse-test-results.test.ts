import { describe, it, expect } from "vitest";
import { parseTestResults } from "../sdf/parse-test-results";

const HEADER =
  "Vendor_ID,Deal_ID,Deal_Name,Period_Begin_Date,As_Of_Date,Export_Date,Test_Date,Test_Name,Calculated_Result,Trigger,Pass_Fail";

function makeCsv(...dataRows: string[]): string {
  return [HEADER, ...dataRows].join("\n");
}

const ROW_OC_PAR =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Class A/B Par Value Test,136.98000%,129.37000%,Passed ";
const ROW_IC =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Class A/B Interest Coverage Test,248.08000%,120.00000%,Passed ";
const ROW_WARF_MOODYS =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Moody's Maximum Weighted Average Rating Factor Test,3035.00000,3148.00000,Passed ";
const ROW_WARF_FITCH =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Fitch Maximum Weighted Average Rating Factor Test,25.69000,28.00000,Passed ";
const ROW_WAS =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Minimum Weighted Average Floating Spread Test,3.68000%,3.65000%,Passed ";
const ROW_WAL =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Weighted Average Life Test,4.15000,4.50000,Passed ";
const ROW_DIVERSITY =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Moody's Minimum Diversity,67.00000,59.00000,Passed ";
const ROW_RECOVERY =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Fitch Minimum Weighted Average Recovery Rate Test,61.70000%,57.15000%,Passed ";
const ROW_EOD =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Event of Default,158.52000%,102.50000%,Passed ";
const ROW_REINVESTMENT_OC =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Reinvestment Overcollateralisation Test,105.40000%,103.74000%,Passed ";
const ROW_NOT_CALCULATED =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Minimum WAS excl floor incl Agg Exc Funded Spread,3.65000,,Not Calculated";
const ROW_COUNTERPARTY_RATING =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,Counterparty Rating Event  - Account Bank (A3/P-1),,,Passed ";

// Concentration / eligibility clause rows
const ROW_A =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(a) Senior Secured Obligations,100.00000%,90.00000%,Passed ";
const ROW_D =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(d) Fixed Rate Collateral Debt Obligations,7.42000%,10.00000%,Passed ";
const ROW_F =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(f) Cov-Lite Loans,0.93000%,30.00000%,Passed ";
const ROW_H =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(h) Obligors - Domiciled in country with a country ceiling below AAA By Fitch,4.32000%,10.00000%,Passed ";
const ROW_N =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(n) Moody's Caa Obligations,6.92000%,7.50000%,Passed ";
const ROW_O =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(o) Fitch - CCC Obligations,5.87000%,7.50000%,Passed ";
const ROW_P =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(p)(i) Highest Single Obligor Senior Secured Obligations,1.02000%,2.50000%,Passed ";
const ROW_S =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(s) Top 10 Obligors,9.46000%,16.00000%,Passed ";
const ROW_T =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(t)(i) Largest Single Fitch Industry,11.01000%,17.50000%,Passed ";
const ROW_Z =
  "BNY,2916,Ares European CLO XV  DAC,06-Jan-2026,01-Apr-2026,14-Apr-2026,01-Apr-2026,(z) Third Party Credit Exposure Rated Fitch Individual AAA,0.00000%,20.00000%,Passed ";

describe("parseTestResults", () => {
  it("extracts dealName, asOfDate, periodBeginDate", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR));
    expect(result.dealName).toBe("Ares European CLO XV  DAC");
    expect(result.asOfDate).toBe("2026-04-01");
    expect(result.periodBeginDate).toBe("2026-01-06");
    expect(result.fileType).toBe("test_results");
  });

  it("returns correct rowCount", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR, ROW_IC, ROW_WAL));
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  it("parses OC Par Value Test", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR));
    const row = result.rows[0];
    expect(row.test_type).toBe("OC_PAR");
    expect(row.test_class).toBe("A/B");
    expect(row.actual_value).toBeCloseTo(136.98);
    expect(row.trigger_level).toBeCloseTo(129.37);
    expect(row.cushion_pct).toBeCloseTo(7.61);
    expect(row.is_passing).toBe(true);
    expect(row.is_active).toBe(true);
    expect(row.data_source).toBe("sdf");
  });

  it("parses IC test", () => {
    const result = parseTestResults(makeCsv(ROW_IC));
    const row = result.rows[0];
    expect(row.test_type).toBe("IC");
    expect(row.test_class).toBe("A/B");
    expect(row.actual_value).toBeCloseTo(248.08);
    expect(row.trigger_level).toBeCloseTo(120.0);
    expect(row.cushion_pct).toBeCloseTo(128.08);
    expect(row.is_passing).toBe(true);
  });

  it("parses WARF test (lower-is-better)", () => {
    const result = parseTestResults(makeCsv(ROW_WARF_MOODYS));
    const row = result.rows[0];
    expect(row.test_type).toBe("WARF");
    expect(row.test_class).toBeNull();
    expect(row.actual_value).toBeCloseTo(3035);
    expect(row.trigger_level).toBeCloseTo(3148);
    expect(row.cushion_pct).toBeCloseTo(113);
    expect(row.is_passing).toBe(true);
  });

  it("parses WAS test (higher-is-better)", () => {
    const result = parseTestResults(makeCsv(ROW_WAS));
    const row = result.rows[0];
    expect(row.test_type).toBe("WAS");
    expect(row.actual_value).toBeCloseTo(3.68);
    expect(row.trigger_level).toBeCloseTo(3.65);
    expect(row.cushion_pct).toBeCloseTo(0.03);
    expect(row.is_passing).toBe(true);
  });

  it("parses WAL test (lower-is-better)", () => {
    const result = parseTestResults(makeCsv(ROW_WAL));
    const row = result.rows[0];
    expect(row.test_type).toBe("WAL");
    expect(row.actual_value).toBeCloseTo(4.15);
    expect(row.trigger_level).toBeCloseTo(4.5);
    expect(row.cushion_pct).toBeCloseTo(0.35);
  });

  it("parses Diversity test (higher-is-better)", () => {
    const result = parseTestResults(makeCsv(ROW_DIVERSITY));
    const row = result.rows[0];
    expect(row.test_type).toBe("DIVERSITY");
    expect(row.actual_value).toBeCloseTo(67);
    expect(row.trigger_level).toBeCloseTo(59);
    expect(row.cushion_pct).toBeCloseTo(8);
  });

  it("parses Recovery Rate test (higher-is-better)", () => {
    const result = parseTestResults(makeCsv(ROW_RECOVERY));
    const row = result.rows[0];
    expect(row.test_type).toBe("RECOVERY");
    expect(row.actual_value).toBeCloseTo(61.7);
    expect(row.trigger_level).toBeCloseTo(57.15);
    expect(row.cushion_pct).toBeCloseTo(4.55);
  });

  it("parses Event of Default as OC_PAR with test_class EOD", () => {
    const result = parseTestResults(makeCsv(ROW_EOD));
    const row = result.rows[0];
    expect(row.test_type).toBe("OC_PAR");
    expect(row.test_class).toBe("EOD");
    expect(row.cushion_pct).toBeCloseTo(56.02);
  });

  it("parses Reinvestment OC Test as INTEREST_DIVERSION", () => {
    const result = parseTestResults(makeCsv(ROW_REINVESTMENT_OC));
    const row = result.rows[0];
    expect(row.test_type).toBe("INTEREST_DIVERSION");
    expect(row.test_class).toBeNull();
    expect(row.cushion_pct).toBeCloseTo(1.66);
  });

  it("handles Not Calculated status", () => {
    const result = parseTestResults(makeCsv(ROW_NOT_CALCULATED));
    const row = result.rows[0];
    expect(row.is_passing).toBeNull();
    expect(row.is_active).toBe(false);
  });

  it("handles Passed with trailing space", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR));
    expect(result.rows[0].is_passing).toBe(true);
    expect(result.rows[0].is_active).toBe(true);
  });

  it("handles tests with no numeric values (Counterparty Rating Event)", () => {
    const result = parseTestResults(makeCsv(ROW_COUNTERPARTY_RATING));
    const row = result.rows[0];
    expect(row.test_type).toBe("ELIGIBILITY");
    expect(row.test_class).toBe("COUNTERPARTY_RATING");
    expect(row.actual_value).toBeNull();
    expect(row.trigger_level).toBeNull();
    expect(row.cushion_pct).toBeNull();
    expect(row.is_passing).toBe(true);
    expect(row.is_active).toBe(true);
  });

  describe("concentration clause-letter tests", () => {
    it("(a) → CONCENTRATION, ASSET_TYPE_SR_SECURED (higher-is-better)", () => {
      const result = parseTestResults(makeCsv(ROW_A));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("ASSET_TYPE_SR_SECURED");
      expect(row.cushion_pct).toBeCloseTo(10);
    });

    // Concentration / eligibility maximums (every CLAUSE_MAP entry except
    // (a)/(b)) are lower-is-better: cushion = trigger − actual, positive
    // when actual is below the limit.
    it("(d) → CONCENTRATION, FIXED_RATE (concentration max, lower-is-better)", () => {
      const result = parseTestResults(makeCsv(ROW_D));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("FIXED_RATE");
      expect(row.cushion_pct).toBeCloseTo(2.58, 2); // 10 − 7.42
    });

    it("(f) → CONCENTRATION, COV_LITE", () => {
      const result = parseTestResults(makeCsv(ROW_F));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("COV_LITE");
      expect(row.cushion_pct).toBeCloseTo(29.07, 2); // 30 − 0.93
    });

    it("(h) → CONCENTRATION, COUNTRY", () => {
      const result = parseTestResults(makeCsv(ROW_H));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("COUNTRY");
      expect(row.cushion_pct).toBeCloseTo(5.68, 2); // 10 − 4.32
    });

    it("(n) → CONCENTRATION, RATING_CCC_MOODYS", () => {
      const result = parseTestResults(makeCsv(ROW_N));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("RATING_CCC_MOODYS");
      expect(row.cushion_pct).toBeCloseTo(0.58, 2); // 7.5 − 6.92
    });

    it("(o) → CONCENTRATION, RATING_CCC_FITCH", () => {
      const result = parseTestResults(makeCsv(ROW_O));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("RATING_CCC_FITCH");
      expect(row.cushion_pct).toBeCloseTo(1.63, 2); // 7.5 − 5.87
    });

    it("(p)(i) → CONCENTRATION, SINGLE_OBLIGOR", () => {
      const result = parseTestResults(makeCsv(ROW_P));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("SINGLE_OBLIGOR");
      expect(row.cushion_pct).toBeCloseTo(1.48, 2); // 2.5 − 1.02
    });

    it("(s) → CONCENTRATION, TOP_OBLIGORS", () => {
      const result = parseTestResults(makeCsv(ROW_S));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("TOP_OBLIGORS");
      expect(row.cushion_pct).toBeCloseTo(6.54, 2); // 16 − 9.46
    });

    it("(t)(i) → CONCENTRATION, INDUSTRY", () => {
      const result = parseTestResults(makeCsv(ROW_T));
      const row = result.rows[0];
      expect(row.test_type).toBe("CONCENTRATION");
      expect(row.test_class).toBe("INDUSTRY");
      expect(row.cushion_pct).toBeCloseTo(6.49, 2); // 17.5 − 11.01
    });

    it("(z) → ELIGIBILITY, COUNTERPARTY", () => {
      const result = parseTestResults(makeCsv(ROW_Z));
      const row = result.rows[0];
      expect(row.test_type).toBe("ELIGIBILITY");
      expect(row.test_class).toBe("COUNTERPARTY");
      expect(row.cushion_pct).toBeCloseTo(20, 2); // 20 − 0
    });
  });

  it("extracts test_date correctly", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR));
    expect(result.rows[0].test_date).toBe("2026-04-01");
  });

  it("sets vendor_id from CSV", () => {
    const result = parseTestResults(makeCsv(ROW_OC_PAR));
    expect(result.rows[0].vendor_id).toBe("BNY");
  });
});
