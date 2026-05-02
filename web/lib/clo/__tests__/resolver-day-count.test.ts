/**
 * Resolver-level coverage of the day-count-convention carve-out logic in
 * `resolveTranches`. The carve-out is structural: a future refactor of
 * `carveOut = isSub || hasAmort` (e.g., dropping `hasAmort`, or splitting
 * the predicate) would silently regress income-note and Class X behavior.
 * These tests lock the three cases.
 *
 * Carve-out rule (per resolver.ts comment block):
 *   1. carveOut = isSub || hasAmort. Income notes don't accrue; Class X
 *      rides the engine's `isFloating ? actual_360 : 30_360` fallback.
 *      Both bypass blocking-on-null.
 *   2. canonicalize iff dayCountConvention is non-null OR carveOut is
 *      false. carveOut + null → undefined (engine fallback fires).
 *      Non-null DCC → canonicalize regardless.
 *
 * The PPM-fallback branch always passes undefined (no DCC source); the
 * DB-tranche branch passes `t.dayCountConvention` from the DB row.
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints, CloTranche } from "@/lib/clo/types";

const baseConstraints = {
  deal: null,
  keyDates: null,
  payFreqMonths: null,
  feeSchedule: { fees: [] },
  ocTests: { tests: [] },
  icTests: { tests: [] },
  concentrations: { limits: [] },
  waterfall: { clauses: [] },
  ccc: { bucketLimitPct: null, valuationPct: null, valuationMode: null },
  waterfallType: null,
};

describe("resolver — day-count-convention carve-out (PPM-fallback branch)", () => {
  it("Class X (amortising fixed) with no DCC source → dayCountConvention undefined, no blocking warning", () => {
    const constraints = {
      ...baseConstraints,
      capitalStructure: [
        { class: "Class A", principalAmount: "200000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        // Class X: fixed (rateType missing → defaults to floating in resolver, override via spread match)
        // Use rateType="Fixed" so isFloating=false. amortisationPerPeriod set so hasAmort=true.
        { class: "Class X", principalAmount: "5000000",   spread: "5.0%",          spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Fixed",    amortisationPerPeriod: "500000" },
        { class: "Sub",     principalAmount: "30000000",  spread: null,            spreadBps: null, isSubordinated: true,  deferrable: false, rateType: null },
      ],
    } as unknown as ExtractedConstraints;

    const { resolved, warnings } = resolveWaterfallInputs(constraints, null, [], [], []);
    const classX = resolved.tranches.find((t) => t.className === "Class X");
    expect(classX).toBeDefined();
    expect(classX!.isAmortising).toBe(true);
    expect(classX!.dayCountConvention).toBeUndefined();
    const blockingDccWarnings = warnings.filter((w) => w.field === "dayCountConvention" && w.blocking);
    const classXBlock = blockingDccWarnings.filter((w) => w.message.includes("Class X"));
    expect(classXBlock).toHaveLength(0);
  });

  it("Sub Notes (income note) with no DCC source → dayCountConvention undefined, no blocking warning", () => {
    const constraints = {
      ...baseConstraints,
      capitalStructure: [
        { class: "Class A", principalAmount: "200000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        { class: "Sub",     principalAmount: "30000000",  spread: null,            spreadBps: null, isSubordinated: true,  deferrable: false, rateType: null },
      ],
    } as unknown as ExtractedConstraints;

    const { resolved, warnings } = resolveWaterfallInputs(constraints, null, [], [], []);
    const sub = resolved.tranches.find((t) => t.isIncomeNote);
    expect(sub).toBeDefined();
    expect(sub!.dayCountConvention).toBeUndefined();
    const blockingDcc = warnings.filter((w) => w.field === "dayCountConvention" && w.blocking && w.message.includes(sub!.className));
    expect(blockingDcc).toHaveLength(0);
  });

  it("non-amort, non-sub fixed-rate tranche (Class B-2 shape) with no DCC source → emits blocking DCC warning", () => {
    const constraints = {
      ...baseConstraints,
      capitalStructure: [
        { class: "Class A",   principalAmount: "200000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        { class: "Class B-2", principalAmount: "20000000",  spread: "5.5%",          spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Fixed" },
        { class: "Sub",       principalAmount: "30000000",  spread: null,            spreadBps: null, isSubordinated: true,  deferrable: false, rateType: null },
      ],
    } as unknown as ExtractedConstraints;

    const { warnings } = resolveWaterfallInputs(constraints, null, [], [], []);
    const blockingDcc = warnings.filter(
      (w) => w.field === "dayCountConvention" && w.blocking && w.message.includes("Class B-2"),
    );
    expect(blockingDcc).toHaveLength(1);
    expect(blockingDcc[0].message).toContain("No market default exists for fixed-rate");
  });

  it("floating tranche with no DCC source → falls back to actual_360 with severity:'warn'", () => {
    const constraints = {
      ...baseConstraints,
      capitalStructure: [
        { class: "Class A", principalAmount: "200000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        { class: "Sub",     principalAmount: "30000000",  spread: null,            spreadBps: null, isSubordinated: true,  deferrable: false, rateType: null },
      ],
    } as unknown as ExtractedConstraints;

    const { resolved, warnings } = resolveWaterfallInputs(constraints, null, [], [], []);
    const a = resolved.tranches.find((t) => t.className === "Class A");
    expect(a).toBeDefined();
    expect(a!.dayCountConvention).toBe("actual_360");
    const aWarn = warnings.find(
      (w) => w.field === "dayCountConvention" && !w.blocking && w.message.includes("Class A"),
    );
    expect(aWarn).toBeDefined();
    expect(aWarn!.severity).toBe("warn");
  });
});

describe("resolver — day-count-convention propagation (DB-tranche branch)", () => {
  // DB-tranche branch tests: source provides explicit dayCountConvention. The
  // canonicalizer runs even on carve-out tranches when DCC is non-null —
  // verifies "explicit DCC wins over carve-out's undefined fallback."

  const minimalConstraints = baseConstraints as unknown as ExtractedConstraints;

  function makeDbTranche(overrides: Partial<CloTranche>): CloTranche {
    return {
      id: "t-" + (overrides.className ?? "x"),
      dealId: "d-1",
      className: "Class A",
      isin: null,
      cusip: null,
      commonCode: null,
      currency: null,
      originalBalance: 100_000_000,
      seniorityRank: 1,
      isFloating: true,
      referenceRate: null,
      referenceRateTenor: null,
      spreadBps: 140,
      couponFloor: null,
      couponCap: null,
      dayCountConvention: null,
      paymentFrequency: null,
      isDeferrable: false,
      isPik: null,
      ratingMoodys: null,
      ratingSp: null,
      ratingFitch: null,
      ratingDbrs: null,
      isSubordinate: false,
      isIncomeNote: false,
      trancheType: null,
      liabPrin: null,
      legalMaturityDate: null,
      amountNative: null,
      vendorCustomFields: null,
      ...overrides,
    };
  }

  it("Class B-2 with explicit dayCountConvention='30/360 (European)' → canonicalized to 30e_360", () => {
    const dbTranches: CloTranche[] = [
      makeDbTranche({ className: "Class A",   isFloating: true,  spreadBps: 140 }),
      makeDbTranche({ className: "Class B-2", isFloating: false, spreadBps: 250, dayCountConvention: "30/360 (European)" }),
    ];
    const { resolved } = resolveWaterfallInputs(minimalConstraints, null, dbTranches, [], []);
    const b2 = resolved.tranches.find((t) => t.className === "Class B-2");
    expect(b2).toBeDefined();
    expect(b2!.dayCountConvention).toBe("30e_360");
  });

  it("Sub Notes with explicit dayCountConvention='Actual/360' → canonicalized to actual_360 (NOT undefined despite carve-out)", () => {
    const dbTranches: CloTranche[] = [
      makeDbTranche({ className: "Class A", isFloating: true,  spreadBps: 140 }),
      makeDbTranche({ className: "Subordinated Notes", isFloating: false, spreadBps: 0, isSubordinate: true, isIncomeNote: true, seniorityRank: 99, dayCountConvention: "Actual/360" }),
    ];
    const { resolved } = resolveWaterfallInputs(minimalConstraints, null, dbTranches, [], []);
    const sub = resolved.tranches.find((t) => t.isIncomeNote);
    expect(sub).toBeDefined();
    expect(sub!.dayCountConvention).toBe("actual_360");
  });

  it("Class B-2 with null DCC → emits blocking warning (no explicit + no carve-out)", () => {
    const dbTranches: CloTranche[] = [
      makeDbTranche({ className: "Class A",   isFloating: true,  spreadBps: 140 }),
      makeDbTranche({ className: "Class B-2", isFloating: false, spreadBps: 250, dayCountConvention: null }),
    ];
    const { warnings } = resolveWaterfallInputs(minimalConstraints, null, dbTranches, [], []);
    const blockingDcc = warnings.filter(
      (w) => w.field === "dayCountConvention" && w.blocking && w.message.includes("Class B-2"),
    );
    expect(blockingDcc).toHaveLength(1);
  });
});
