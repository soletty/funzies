import { describe, it, expect } from "vitest";
import { parseSpreadToBps, normalizeWacSpread, normalizeComplianceTestType, deepFixStringNulls } from "../ingestion-gate";

describe("parseSpreadToBps", () => {
  it("returns spreadBps directly when provided and > 0", () => {
    expect(parseSpreadToBps(150, null)).toBe(150);
    expect(parseSpreadToBps(200, "1.47%")).toBe(200);
  });

  it("parses percentage string (e.g. '1.47%' → 147)", () => {
    expect(parseSpreadToBps(null, "1.47%")).toBe(147);
    expect(parseSpreadToBps(null, "2.00%")).toBe(200);
    expect(parseSpreadToBps(0, "1.47%")).toBe(147);
  });

  it("parses bps string (e.g. '150bps' → 150)", () => {
    expect(parseSpreadToBps(null, "150bps")).toBe(150);
    expect(parseSpreadToBps(null, "175 BPS")).toBe(175);
  });

  it("parses plain number >= 10 as bps", () => {
    expect(parseSpreadToBps(null, "150")).toBe(150);
    expect(parseSpreadToBps(null, "10")).toBe(10);
  });

  it("parses plain number < 10 as percentage", () => {
    expect(parseSpreadToBps(null, "1.47")).toBe(147);
    expect(parseSpreadToBps(null, "2.5")).toBe(250);
  });

  it("returns null for unparseable strings", () => {
    expect(parseSpreadToBps(null, "E+150")).toBeNull();
    expect(parseSpreadToBps(null, "EURIBOR + 1.50%")).toBe(150);
    expect(parseSpreadToBps(null, "n/a")).toBeNull();
    expect(parseSpreadToBps(null, "TBD")).toBeNull();
  });

  it("returns null for null/undefined inputs", () => {
    expect(parseSpreadToBps(null, null)).toBeNull();
    expect(parseSpreadToBps(undefined, undefined)).toBeNull();
    expect(parseSpreadToBps(null, undefined)).toBeNull();
  });
});

describe("normalizeWacSpread", () => {
  it("converts value < 20 from percentage to bps", () => {
    expect(normalizeWacSpread(3.76)).toEqual({
      bps: 376,
      fix: expect.objectContaining({ before: 3.76, after: 376 }),
    });
  });

  it("keeps value >= 10 as bps with no fix", () => {
    expect(normalizeWacSpread(376)).toEqual({ bps: 376, fix: null });
    expect(normalizeWacSpread(20)).toEqual({ bps: 20, fix: null });
    expect(normalizeWacSpread(15)).toEqual({ bps: 15, fix: null });
  });

  it("treats values 10–19 as bps (not percentages)", () => {
    const result = normalizeWacSpread(15);
    expect(result.bps).toBe(15);
    expect(result.fix).toBeNull();
  });

  it("converts values < 10 from percentage to bps", () => {
    const result = normalizeWacSpread(3.76);
    expect(result.bps).toBe(376);
    expect(result.fix).not.toBeNull();
  });

  it("returns 0 bps with no fix for null", () => {
    expect(normalizeWacSpread(null)).toEqual({ bps: 0, fix: null });
  });
});

describe("normalizeComplianceTestType", () => {
  it("normalizes 'overcollateralization' test name to OC_PAR", () => {
    const input = [{ testType: null, testName: "Overcollateralization Test A", isPassing: null, actualValue: null, triggerLevel: null }];
    const { tests } = normalizeComplianceTestType(input);
    expect(tests[0].testType).toBe("OC_PAR");
  });

  it("normalizes 'interest coverage' test name to IC", () => {
    const input = [{ testType: null, testName: "Interest Coverage Test", isPassing: null, actualValue: null, triggerLevel: null }];
    const { tests } = normalizeComplianceTestType(input);
    expect(tests[0].testType).toBe("IC");
  });

  it("leaves already-normalized types unchanged without producing a fix", () => {
    const input = [
      { testType: "OC_PAR", testName: "OC Test", isPassing: true, actualValue: null, triggerLevel: null },
      { testType: "IC", testName: "IC Test", isPassing: false, actualValue: null, triggerLevel: null },
      { testType: "OC_MV", testName: "MV Test", isPassing: null, actualValue: null, triggerLevel: null },
    ];
    const { tests, fixes } = normalizeComplianceTestType(input);
    expect(tests[0].testType).toBe("OC_PAR");
    expect(tests[1].testType).toBe("IC");
    expect(tests[2].testType).toBe("OC_MV");
    expect(fixes.filter(f => f.field.includes("testType"))).toHaveLength(0);
  });

  it("computes isPassing from actualValue vs triggerLevel when null", () => {
    const passing = [{ testType: "OC_PAR", testName: "OC A", isPassing: null, actualValue: 110, triggerLevel: 105 }];
    const failing = [{ testType: "IC", testName: "IC A", isPassing: null, actualValue: 90, triggerLevel: 105 }];

    const { tests: passingTests } = normalizeComplianceTestType(passing);
    expect(passingTests[0].isPassing).toBe(true);

    const { tests: failingTests } = normalizeComplianceTestType(failing);
    expect(failingTests[0].isPassing).toBe(false);
  });

  it("does not overwrite an existing isPassing value", () => {
    const input = [{ testType: "OC_PAR", testName: "OC A", isPassing: false, actualValue: 110, triggerLevel: 105 }];
    const { tests } = normalizeComplianceTestType(input);
    expect(tests[0].isPassing).toBe(false);
  });

  it("records fixes for normalized types and computed isPassing", () => {
    const input = [{ testType: null, testName: "Interest Coverage Test", isPassing: null, actualValue: 120, triggerLevel: 105 }];
    const { fixes } = normalizeComplianceTestType(input);
    expect(fixes.some(f => f.field.includes("testType"))).toBe(true);
    expect(fixes.some(f => f.field.includes("isPassing"))).toBe(true);
  });

  // --------------------------------------------------------------------
  // Direction-aware isPassing dispatch.
  //
  // The gate's fallback path computes isPassing when the source omits it.
  // For higher-is-better tests (OC, IC, WAS, recovery, diversity,
  // INTEREST_DIVERSION) it uses actual >= trigger; for lower-is-better
  // tests (WARF, WAL, concentration / eligibility maximums) it uses
  // actual <= trigger; when direction is unknown it leaves isPassing null
  // rather than silently defaulting. Direction is resolved by
  // `isHigherBetter(testType, testName)` from `lib/clo/test-direction.ts`.
  // --------------------------------------------------------------------
  describe("direction-aware isPassing dispatch", () => {
    it("higher-is-better (OC_PAR): pass when actual >= trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "OC_PAR", testName: "Class A Par Value Test", isPassing: null, actualValue: 130, triggerLevel: 105 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("higher-is-better (OC_PAR): fail when actual < trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "OC_PAR", testName: "Class A Par Value Test", isPassing: null, actualValue: 100, triggerLevel: 105 },
      ]);
      expect(tests[0].isPassing).toBe(false);
    });

    it("higher-is-better (IC): pass when actual >= trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "IC", testName: "Class A Interest Coverage Test", isPassing: null, actualValue: 110, triggerLevel: 105 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("higher-is-better (WAS): pass when actual >= trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "WAS", testName: "Minimum Weighted Average Floating Spread Test", isPassing: null, actualValue: 3.68, triggerLevel: 3.65 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("higher-is-better (RECOVERY) regression pin: pass when actual >= trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "RECOVERY", testName: "Moody's Minimum Weighted Average Recovery Rate Test", isPassing: null, actualValue: 44.6, triggerLevel: 42.6 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("higher-is-better (DIVERSITY) regression pin: pass when actual >= trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "DIVERSITY", testName: "Moody's Minimum Diversity", isPassing: null, actualValue: 67, triggerLevel: 59 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("higher-is-better (INTEREST_DIVERSION) regression pin: reinvestment-OC ratio passes when above trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "INTEREST_DIVERSION", testName: "Reinvestment Overcollateralisation Test", isPassing: null, actualValue: 105.4, triggerLevel: 103.74 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("lower-is-better (WARF): canonical bug case — fail when actual > trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "WARF", testName: "Weighted Average Rating Factor Test", isPassing: null, actualValue: 3100, triggerLevel: 3000 },
      ]);
      expect(tests[0].isPassing).toBe(false);
    });

    it("lower-is-better (WARF): pass when actual < trigger", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "WARF", testName: "Weighted Average Rating Factor Test", isPassing: null, actualValue: 2900, triggerLevel: 3000 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("lower-is-better (WAL) regression pin", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "WAL", testName: "Weighted Average Life Test", isPassing: null, actualValue: 4.5, triggerLevel: 5.0 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("CONCENTRATION clause (a): senior-secured MINIMUM is higher-is-better despite generic testType", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "(a) Senior Secured Obligations", isPassing: null, actualValue: 100, triggerLevel: 90 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("CONCENTRATION clause (a): fails when actual drops below the minimum", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "(a) Senior Secured Obligations", isPassing: null, actualValue: 85, triggerLevel: 90 },
      ]);
      expect(tests[0].isPassing).toBe(false);
    });

    it("CONCENTRATION clause (b): senior-secured-loans MINIMUM is higher-is-better", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "(b) Senior Secured Loans", isPassing: null, actualValue: 89.33, triggerLevel: 70 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("CONCENTRATION clause (n) Caa: concentration MAXIMUM via CLAUSE_MAP is lower-is-better", () => {
      const overLimit = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "(n) Moody's Caa Obligations", isPassing: null, actualValue: 8, triggerLevel: 7.5 },
      ]);
      expect(overLimit.tests[0].isPassing).toBe(false);

      const underLimit = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "(n) Moody's Caa Obligations", isPassing: null, actualValue: 6, triggerLevel: 7.5 },
      ]);
      expect(underLimit.tests[0].isPassing).toBe(true);
    });

    it("CONCENTRATION 'Maximum Obligor' via name pattern is lower-is-better", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "CONCENTRATION", testName: "Maximum Obligor Concentration Test", isPassing: null, actualValue: 22, triggerLevel: 21 },
      ]);
      expect(tests[0].isPassing).toBe(false);
    });

    it("ELIGIBILITY clause (z) counterparty-exposure: lower-is-better via CLAUSE_MAP", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "ELIGIBILITY", testName: "(z) Moodys Aggregate Third Party Credit Exposure Rated A1", isPassing: null, actualValue: 0, triggerLevel: 5 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("direction unknown: leaves isPassing null (no silent default to >=)", () => {
      const { tests, fixes } = normalizeComplianceTestType([
        { testType: "ELIGIBILITY", testName: "Foo Bar Quux Custom Eligibility Check", isPassing: null, actualValue: 100, triggerLevel: 90 },
      ]);
      expect(tests[0].isPassing).toBeNull();
      // No fix is recorded — `fixes` is a mutation log; absence indicates
      // isPassing was never set. Partner-visible signal lives in the
      // resolver's `complianceTests.ambiguousDirection` warning.
      expect(fixes.find(f => f.field.includes("isPassing"))).toBeUndefined();
    });

    it("testType=null with no name pattern: leaves isPassing null", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: null, testName: "Some Custom Test Name", isPassing: null, actualValue: 100, triggerLevel: 90 },
      ]);
      expect(tests[0].isPassing).toBeNull();
    });

    it("pre-set isPassing=false preserved even when direction would compute true", () => {
      // WARF actual=2900 trigger=3000 → direction-aware computes true (lower is
      // better, 2900 <= 3000). But source says false — gate must not override.
      const { tests } = normalizeComplianceTestType([
        { testType: "WARF", testName: "Weighted Average Rating Factor Test", isPassing: false, actualValue: 2900, triggerLevel: 3000 },
      ]);
      expect(tests[0].isPassing).toBe(false);
    });

    it("pre-set isPassing=true preserved even when direction would compute false", () => {
      // OC_PAR actual=100 trigger=105 → direction-aware computes false. Source
      // says true — gate must not override.
      const { tests } = normalizeComplianceTestType([
        { testType: "OC_PAR", testName: "OC A", isPassing: true, actualValue: 100, triggerLevel: 105 },
      ]);
      expect(tests[0].isPassing).toBe(true);
    });

    it("missing actualValue: isPassing stays null (no fallback)", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "WARF", testName: "WARF Test", isPassing: null, actualValue: null, triggerLevel: 3000 },
      ]);
      expect(tests[0].isPassing).toBeNull();
    });

    it("missing triggerLevel: isPassing stays null (no fallback)", () => {
      const { tests } = normalizeComplianceTestType([
        { testType: "OC_PAR", testName: "OC A", isPassing: null, actualValue: 100, triggerLevel: null },
      ]);
      expect(tests[0].isPassing).toBeNull();
    });

    it("audit Fix message labels the direction used (higher / lower / unknown)", () => {
      const higherFixes = normalizeComplianceTestType([
        { testType: "OC_PAR", testName: "OC A", isPassing: null, actualValue: 110, triggerLevel: 105 },
      ]).fixes;
      expect(higherFixes.find(f => f.field.includes("isPassing"))?.message).toMatch(/higher-is-better/);

      const lowerFixes = normalizeComplianceTestType([
        { testType: "WARF", testName: "WARF Test", isPassing: null, actualValue: 3100, triggerLevel: 3000 },
      ]).fixes;
      expect(lowerFixes.find(f => f.field.includes("isPassing"))?.message).toMatch(/lower-is-better/);
    });
  });
});

describe("deepFixStringNulls", () => {
  it("coerces 'null' at depth 1", () => {
    expect(deepFixStringNulls({ a: "null", b: 42 })).toEqual({ a: null, b: 42 });
  });

  it("coerces 'null' at depth 3", () => {
    expect(deepFixStringNulls({ outer: { middle: { inner: "null" } } }))
      .toEqual({ outer: { middle: { inner: null } } });
  });

  it("coerces 'NULL' and 'Null' case-insensitively", () => {
    expect(deepFixStringNulls({ a: "NULL", b: "Null", c: "nULL" }))
      .toEqual({ a: null, b: null, c: null });
  });

  it("coerces 'undefined' string to null", () => {
    expect(deepFixStringNulls({ a: "undefined" })).toEqual({ a: null });
  });

  it("walks arrays", () => {
    expect(deepFixStringNulls([{ a: "null" }, { a: "value" }]))
      .toEqual([{ a: null }, { a: "value" }]);
  });

  it("leaves legitimate values untouched", () => {
    const input = { a: "hello", b: 0, c: false, d: null, e: "nullable-field-name" };
    expect(deepFixStringNulls(input)).toEqual(input);
  });

  it("does not coerce substring 'null' (exact match only)", () => {
    expect(deepFixStringNulls({ a: "not null", b: "nullable" }))
      .toEqual({ a: "not null", b: "nullable" });
  });

  it("processes 236-row holdings schedule in under 50ms (perf guard)", () => {
    const holdings = Array.from({ length: 236 }, (_, i) => ({
      obligorName: `Obligor ${i}`, isin: `XS${String(i).padStart(10, "0")}`,
      spreadBps: i % 5 === 0 ? "null" : 350, rating: "B",
      moodysRating: i % 7 === 0 ? "NULL" : "B2",
      nested: { deeper: { value: i % 11 === 0 ? "undefined" : 100 } },
    }));
    const start = performance.now();
    deepFixStringNulls({ holdings });
    expect(performance.now() - start).toBeLessThan(50);
  });
});
