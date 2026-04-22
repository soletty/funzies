import { describe, it, expect } from "vitest";
import { CANONICAL_HEADINGS, scanHeadings, COMPLIANCE_SECTION_TYPES } from "../extraction/document-mapper";

describe("COMPLIANCE_SECTION_TYPES", () => {
  it("includes notes_information", () => {
    expect(COMPLIANCE_SECTION_TYPES).toContain("notes_information");
  });
});

describe("CANONICAL_HEADINGS catalog", () => {
  it("has entries for all 12 required section types", () => {
    const expected = [
      "compliance_summary", "par_value_tests", "interest_coverage_tests",
      "default_detail", "asset_schedule", "concentration_tables",
      "waterfall", "trading_activity", "interest_accrual",
      "account_balances", "supplementary", "notes_information",
    ];
    for (const sectionType of expected) {
      expect(CANONICAL_HEADINGS).toHaveProperty(sectionType);
    }
  });
});

describe("scanHeadings", () => {
  const fakePages = [
    { page: 1, text: "§1. Deal Identity\nSome content" },
    { page: 3, text: "§5.1 Par Value (Over-collateralisation) Tests\nTable" },
    { page: 7, text: "§5.2 Interest Coverage Tests\n..." },
    { page: 10, text: "Schedule of Investments — Trustee View\n..." },
    { page: 20, text: "§20. Notes Payment History (inception-to-date)\nRows" },
    { page: 42, text: "§12 Default / Deferring / Current Pay / Discount / Exchanged Securities / Haircut" },
  ];

  it("locates each canonical heading by page", () => {
    const sections = scanHeadings(fakePages);
    const byType = Object.fromEntries(sections.map(s => [s.sectionType, s.pageStart]));
    expect(byType.compliance_summary).toBe(1);
    expect(byType.par_value_tests).toBe(3);
    expect(byType.interest_coverage_tests).toBe(7);
    expect(byType.asset_schedule).toBe(10);
    expect(byType.notes_information).toBe(20);
    expect(byType.default_detail).toBe(42);
  });

  it("computes pageEnd as next section's pageStart - 1", () => {
    const sections = scanHeadings(fakePages);
    const summary = sections.find(s => s.sectionType === "compliance_summary")!;
    const parValue = sections.find(s => s.sectionType === "par_value_tests")!;
    expect(summary.pageEnd).toBe(parValue.pageStart - 1);
  });

  it("returns empty array when no heading matches", () => {
    expect(scanHeadings([{ page: 1, text: "Nothing relevant." }])).toEqual([]);
  });

  it("matches headings case-insensitively", () => {
    const sections = scanHeadings([{ page: 1, text: "interest coverage tests" }]);
    expect(sections.some(s => s.sectionType === "interest_coverage_tests")).toBe(true);
  });

  it("picks body occurrence over TOC occurrence (last match wins)", () => {
    const pages = [
      { page: 1, text: "Cover page" },
      { page: 2, text: "Table of Contents\nDeal Identity ................ 5\nInterest Coverage Tests ...... 10\nSchedule of Investments — Trustee View ..... 12" },
      { page: 5, text: "§1. Deal Identity\nOther content" },
      { page: 10, text: "§5.2 Interest Coverage Tests\n..." },
      { page: 12, text: "Schedule of Investments — Trustee View\n..." },
    ];
    const sections = scanHeadings(pages);
    const byType = Object.fromEntries(sections.map(s => [s.sectionType, s.pageStart]));
    expect(byType.compliance_summary).toBe(5);         // body, not TOC page 2
    expect(byType.interest_coverage_tests).toBe(10);   // body, not TOC page 2
    expect(byType.asset_schedule).toBe(12);            // body, not TOC page 2
  });
});
