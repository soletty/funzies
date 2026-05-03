/**
 * Regression pin for the resolver's `directionalCushion` fallback used
 * when an upstream `cushion_pct` is null on a compliance/concentration
 * row. Pre-fix the resolver hardcoded `trigger - actual` (lower-is-better
 * polarity) at both the compliance-test mapping site and the
 * concentrations-only fallback site — which inverted the cushion sign on
 * clause (a)/(b) senior-secured MINIMUMS arriving with null cushionPct
 * (the typical shape of pre-isHigherBetter ingest rows still in the DB).
 *
 * The fix dispatches on `isHigherBetter(testType, testName)`:
 *   - higher-is-better → cushion = actual − trigger (positive when above min)
 *   - lower-is-better  → cushion = trigger − actual (positive when below max)
 *   - unknown          → cushion = null
 *
 * Only the fallback path is exercised here; rows with non-null cushionPct
 * pass through unchanged because the SDF parser already signs them
 * correctly via its own `computeCushion(actual, trigger, higherIsBetter)`.
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints } from "@/lib/clo/types";

const baseConstraints = {
  deal: null,
  keyDates: null,
  payFreqMonths: null,
  capitalStructure: [
    { class: "Class A", principalAmount: "300000000", spread: "EURIBOR + 100", spreadBps: 100, isSubordinated: false, deferrable: false, rateType: "Floating" },
    { class: "Sub",     principalAmount: "30000000",  spread: null,            spreadBps: null, isSubordinated: true,  deferrable: false, rateType: null },
  ],
  feeSchedule: { fees: [] },
  ocTests: { tests: [] },
  icTests: { tests: [] },
  concentrations: { limits: [] },
  waterfall: { clauses: [] },
  ccc: { bucketLimitPct: null, valuationPct: null, valuationMode: null },
  waterfallType: null,
} as unknown as ExtractedConstraints;

function makeComplianceTest(opts: {
  testName: string;
  testType: string;
  testClass: string;
  actualValue: number;
  triggerLevel: number;
  cushionPct: number | null;
}) {
  return {
    id: "ct1",
    reportPeriodId: "rp1",
    testName: opts.testName,
    testType: opts.testType,
    testClass: opts.testClass,
    actualValue: opts.actualValue,
    triggerLevel: opts.triggerLevel,
    cushionPct: opts.cushionPct,
    isPassing: true,
    dataSource: "sdf",
    testDate: "2026-04-01",
    vendorId: "BNY",
  };
}

function makeConcentration(concentrationType: string, bucketName: string, actualValue: number | null) {
  return { concentrationType, bucketName, actualValue };
}

describe("resolver — directional cushion fallback on stale-row cushionPct=null", () => {
  it("clause (a) senior-secured MINIMUM joined via concentrations: cushion = actual − trigger (positive when above min)", () => {
    const complianceData = {
      poolSummary: null,
      complianceTests: [
        makeComplianceTest({
          testName: "(a) Senior Secured Obligations",
          testType: "CONCENTRATION",
          testClass: "ASSET_TYPE_SR_SECURED",
          actualValue: 100,
          triggerLevel: 90,
          cushionPct: null, // legacy DB row — pre-isHigherBetter cushion was unset
        }),
      ],
      concentrations: [makeConcentration("a", "(a) Senior Secured Obligations", 100)],
    };

    const { resolved } = resolveWaterfallInputs(
      baseConstraints,
      complianceData as unknown as Parameters<typeof resolveWaterfallInputs>[1],
      [],
      [],
      [],
    );

    const row = resolved.concentrationTests.find(t => t.testName.startsWith("(a)"));
    expect(row).toBeDefined();
    // Higher-is-better polarity: actual (100) − trigger (90) = +10. Pre-fix
    // this was −10 (trigger − actual), which would render in the UI as a
    // negative cushion suggesting breach when the test was actually passing
    // by 10pp.
    expect(row!.cushion).toBe(10);
  });

  it("clause (n) Caa MAXIMUM joined via concentrations: cushion = trigger − actual (positive when below max)", () => {
    const complianceData = {
      poolSummary: null,
      complianceTests: [
        makeComplianceTest({
          testName: "(n) Moody's Caa Obligations",
          testType: "CONCENTRATION",
          testClass: "RATING_CCC_MOODYS",
          actualValue: 6.92,
          triggerLevel: 7.5,
          cushionPct: null,
        }),
      ],
      concentrations: [makeConcentration("n", "(n) Moody's Caa Obligations", 6.92)],
    };

    const { resolved } = resolveWaterfallInputs(
      baseConstraints,
      complianceData as unknown as Parameters<typeof resolveWaterfallInputs>[1],
      [],
      [],
      [],
    );

    const row = resolved.concentrationTests.find(t => t.testName.startsWith("(n)"));
    expect(row).toBeDefined();
    // Lower-is-better: trigger (7.5) − actual (6.92) = +0.58. Polarity
    // matches pre-fix behavior on this row — included as a regression
    // guard to confirm the fix didn't accidentally flip max-tests too.
    expect(row!.cushion).toBeCloseTo(0.58, 2);
  });

  it("non-null upstream cushionPct passes through unchanged regardless of direction", () => {
    const complianceData = {
      poolSummary: null,
      complianceTests: [
        makeComplianceTest({
          testName: "(a) Senior Secured Obligations",
          testType: "CONCENTRATION",
          testClass: "ASSET_TYPE_SR_SECURED",
          actualValue: 100,
          triggerLevel: 90,
          cushionPct: 7.123, // upstream-correct value (signed by SDF parser)
        }),
      ],
      concentrations: [makeConcentration("a", "(a) Senior Secured Obligations", 100)],
    };

    const { resolved } = resolveWaterfallInputs(
      baseConstraints,
      complianceData as unknown as Parameters<typeof resolveWaterfallInputs>[1],
      [],
      [],
      [],
    );

    const row = resolved.concentrationTests.find(t => t.testName.startsWith("(a)"));
    expect(row!.cushion).toBe(7.123);
  });
});
