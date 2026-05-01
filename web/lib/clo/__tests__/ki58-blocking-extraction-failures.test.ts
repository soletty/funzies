/**
 * Per-site marker tests for the silent-extraction-failure sites in the
 * resolver. Each test mutates the Euro XV fixture's `raw` to remove or
 * break the field, runs the real `resolveWaterfallInputs`, and asserts:
 *
 *   1. The expected warning fires with `severity: "error"` AND
 *      `blocking: true` (the gate's predicate).
 *   2. `buildFromResolved(resolved, DEFAULT_ASSUMPTIONS, warnings)`
 *      throws `IncompleteDataError` carrying that warning.
 *
 * If a future PR drops `blocking: true` from a site, its marker test
 * fails immediately rather than waiting for a portability incident
 * to surface the regression. This file IS the canonical inventory of
 * blocking-warning sites — adding a new site means adding an `it()`
 * block here in the same change.
 *
 * Each test deep-clones the fixture before mutation so tests can run
 * in any order without state leakage.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import {
  buildFromResolved,
  DEFAULT_ASSUMPTIONS,
  IncompleteDataError,
} from "@/lib/clo/build-projection-inputs";
import type { ResolutionWarning } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");

interface RawFixture {
  raw: {
    constraints: any;
    complianceData: any;
    tranches: any[];
    trancheSnapshots: any[];
    holdings: any[];
    dealDates: any;
    accountBalances: any[];
    parValueAdjustments: any[];
  };
}

function loadRaw(): RawFixture["raw"] {
  return JSON.parse(JSON.stringify(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).raw));
}

function runResolver(raw: RawFixture["raw"]) {
  return resolveWaterfallInputs(
    raw.constraints,
    raw.complianceData,
    raw.tranches,
    raw.trancheSnapshots,
    raw.holdings,
    raw.dealDates,
    raw.accountBalances,
    raw.parValueAdjustments,
  );
}

function expectBlockingError(w: ResolutionWarning | undefined, fieldHint: string) {
  expect(w, `Expected blocking warning matching ${fieldHint}; got none.`).toBeDefined();
  expect(w!.severity).toBe("error");
  expect(w!.blocking).toBe(true);
}

function expectGateThrows(
  resolved: ReturnType<typeof runResolver>["resolved"],
  warnings: ResolutionWarning[],
) {
  expect(() =>
    buildFromResolved(resolved, DEFAULT_ASSUMPTIONS, warnings),
  ).toThrow(IncompleteDataError);
}

describe("Pattern A (silent fallback to common default)", () => {
  it("diversionPct (resolver.ts:861) — diversionAmount unparseable → blocking", () => {
    const raw = loadRaw();
    raw.constraints.reinvestmentOcTest.diversionAmount = "no percent here";
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) =>
      w.field === "reinvestmentOcTrigger.diversionPct",
    );
    expectBlockingError(w, "reinvestmentOcTrigger.diversionPct");
    expectGateThrows(resolved, warnings);
  });

  it("diversionPct (resolver.ts:870) — trigger present but no diversionAmount → blocking", () => {
    const raw = loadRaw();
    raw.constraints.reinvestmentOcTest = { trigger: "103.74%" };
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) =>
      w.field === "reinvestmentOcTrigger.diversionPct",
    );
    expectBlockingError(w, "reinvestmentOcTrigger.diversionPct (no-diversionAmount path)");
    expectGateThrows(resolved, warnings);
  });

  it("incentiveFeeHurdleIrr (resolver.ts:536) — incentive fee present but no hurdleRate → blocking", () => {
    const raw = loadRaw();
    const incFee = (raw.constraints.fees as any[]).find((f: any) =>
      (f.name ?? "").toLowerCase().includes("incentive"),
    );
    expect(incFee).toBeDefined();
    delete incFee.hurdleRate;
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "fees.incentiveFeeHurdleIrr");
    expectBlockingError(w, "fees.incentiveFeeHurdleIrr");
    expectGateThrows(resolved, warnings);
  });

  it("maturityDate fallback (resolver.ts:814) — no maturity in keyDates or dealDates → blocking", () => {
    const raw = loadRaw();
    if (raw.constraints.keyDates) raw.constraints.keyDates.maturityDate = null;
    if (raw.dealDates) raw.dealDates.maturity = null;
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "dates.maturity");
    expectBlockingError(w, "dates.maturity");
    expectGateThrows(resolved, warnings);
  });

  it("cccBucketLimitPct — excessCccAdjustment missing → blocking", () => {
    const raw = loadRaw();
    delete (raw.constraints as any).excessCccAdjustment;
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "cccBucketLimitPct");
    expectBlockingError(w, "cccBucketLimitPct");
    expectGateThrows(resolved, warnings);
  });

  it("cccMarketValuePct — excessCccAdjustment missing → blocking", () => {
    const raw = loadRaw();
    delete (raw.constraints as any).excessCccAdjustment;
    const { resolved, warnings } = runResolver(raw);
    // Same missing-object root cause emits BOTH field warnings; this marker
    // pins the second emission so a future change that drops one of the two
    // pushes fails immediately.
    const w = warnings.find((w) => w.field === "cccMarketValuePct");
    expectBlockingError(w, "cccMarketValuePct");
    expectGateThrows(resolved, warnings);
  });

  it("cccMarketValuePct — unparseable inner field → blocking + atomic null return", () => {
    const raw = loadRaw();
    (raw.constraints as any).excessCccAdjustment = { thresholdPct: "7.5", marketValuePct: "per agreement" };
    const { resolved, warnings } = runResolver(raw);
    // Distinct code path: object present, inner string parses to NaN.
    const w = warnings.find((w) => w.field === "cccMarketValuePct");
    expectBlockingError(w, "cccMarketValuePct (unparseable)");
    // Atomic-return invariant: thresholdPct parses to 7.5 cleanly, but
    // marketValuePct is invalid → both fields collapse to null. Prevents a
    // hybrid (per-deal threshold × global market-value floor) leaking through
    // if the gate were ever bypassed or refactored.
    expect(resolved.cccBucketLimitPct).toBeNull();
    expect(resolved.cccMarketValuePct).toBeNull();
    expectGateThrows(resolved, warnings);
  });

  it("cccBucketLimitPct — fraction-shape mis-extraction (0.075) → blocking + atomic null return", () => {
    const raw = loadRaw();
    (raw.constraints as any).excessCccAdjustment = { thresholdPct: "0.075", marketValuePct: "70" };
    const { resolved, warnings } = runResolver(raw);
    // Distinct code path: parseable but outside plausible range. Without this
    // guard, parseFloat("0.075") would pass 0.075 through, applying a 100×
    // too-tight haircut cap silently.
    const w = warnings.find((w) => w.field === "cccBucketLimitPct");
    expectBlockingError(w, "cccBucketLimitPct (fraction-shape)");
    // Atomic-return invariant from the opposite side: thresholdPct fails the
    // range check, marketValuePct = 70 is valid → both fields still collapse
    // to null. Half-good output (thresholdPct=null, marketValuePct=70) would
    // pass every other test in this file but is the exact shape the atomic
    // return is designed to prevent.
    expect(resolved.cccBucketLimitPct).toBeNull();
    expect(resolved.cccMarketValuePct).toBeNull();
    expectGateThrows(resolved, warnings);
  });
});

describe("Pattern B (silent acceptance of sentinel value)", () => {
  // Helper: a non-subordinated tranche / capital-structure entry. Uses the
  // structural flags the resolver itself uses (`isIncomeNote`, `isSubordinate`,
  // class-name "sub"/"equity"/"income" substring) — never literal class names.
  // Per CLAUDE.md principle 1, tests should not overfit to a single deal's
  // tranche naming. Zeroing every non-sub spread / PPM entry ensures the
  // zero-spread guard fires regardless of which tranche the fixture happens
  // to put first.
  function isNonSub(className: string | undefined | null, flags: { isIncomeNote?: boolean; isSubordinate?: boolean; isSubordinated?: boolean } = {}): boolean {
    if (flags.isIncomeNote || flags.isSubordinate || flags.isSubordinated) return false;
    const n = ((className ?? "") as string).toLowerCase();
    return !n.includes("sub") && !n.includes("equity") && !n.includes("income");
  }

  it("spreadBps = 0 PPM path (resolver.ts:281) — no DB tranches, all PPM non-sub spreads zero → blocking", () => {
    const raw = loadRaw();
    // Force the PPM-fallback branch by passing dbTranches: [] (the resolver
    // takes the PPM-only path when no DB tranches are supplied).
    raw.tranches = [];
    raw.trancheSnapshots = [];
    let zeroed = 0;
    for (const c of (raw.constraints.capitalStructure as any[]) ?? []) {
      if (!isNonSub(c.class, c)) continue;
      c.spreadBps = 0;
      c.spread = null;
      zeroed++;
    }
    expect(zeroed, "no non-sub PPM capital-structure entries to zero").toBeGreaterThan(0);
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field.endsWith(".spreadBps"));
    expectBlockingError(w, "<non-sub>.spreadBps (PPM path)");
    expectGateThrows(resolved, warnings);
  });

  it("spreadBps = 0 DB path (resolver.ts:211) — all non-sub DB + PPM spreads zero → blocking", () => {
    const raw = loadRaw();
    let zeroedTranches = 0;
    for (const t of raw.tranches as any[]) {
      if (!isNonSub(t.className, t)) continue;
      t.spreadBps = 0;
      t.referenceRate = null;
      zeroedTranches++;
    }
    expect(zeroedTranches, "no non-sub DB tranches to zero").toBeGreaterThan(0);
    // Also zero PPM capital-structure entries to defeat the PPM-spread-fallback
    // path that would otherwise restore a spread for any tranche with `spreadBps == null`.
    for (const c of (raw.constraints.capitalStructure as any[]) ?? []) {
      if (!isNonSub(c.class, c)) continue;
      c.spreadBps = 0;
      c.spread = null;
    }
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field.endsWith(".spreadBps"));
    expectBlockingError(w, "<non-sub>.spreadBps (DB path)");
    expectGateThrows(resolved, warnings);
  });

  it("OC trigger 10-90% band (resolver.ts:416) — implausible trigger → blocking", () => {
    const raw = loadRaw();
    // Set the first OC test's triggerLevel into the no-man's-land (50%).
    const ocTest = (raw.complianceData.complianceTests as any[]).find(
      (t: any) => t.testType === "OC_PAR",
    );
    expect(ocTest).toBeDefined();
    ocTest.triggerLevel = 50;
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find(
      (w) => w.field.startsWith("ocTrigger.") && w.message.includes("implausible"),
    );
    expectBlockingError(w, "ocTrigger.* (10-90% band)");
    expectGateThrows(resolved, warnings);
  });

  it("seniorFeePct = 0 (resolver.ts:566) — no Senior CMF in fees[] → blocking", () => {
    const raw = loadRaw();
    raw.constraints.fees = (raw.constraints.fees as any[]).filter((f: any) => {
      const n = (f.name ?? "").toLowerCase();
      return !(n.includes("senior") && (n.includes("mgmt") || n.includes("management")));
    });
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "fees.seniorFeePct");
    expectBlockingError(w, "fees.seniorFeePct");
    expectGateThrows(resolved, warnings);
  });

  it("subFeePct = 0 (resolver.ts:577) — no Sub CMF in fees[] → blocking", () => {
    const raw = loadRaw();
    raw.constraints.fees = (raw.constraints.fees as any[]).filter((f: any) => {
      const n = (f.name ?? "").toLowerCase();
      return !(n.includes("sub") && (n.includes("mgmt") || n.includes("management")));
    });
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "fees.subFeePct");
    expectBlockingError(w, "fees.subFeePct");
    expectGateThrows(resolved, warnings);
  });

  it("totalPar = 0 (resolver.ts:746) — empty pool summary → blocking", () => {
    const raw = loadRaw();
    if (raw.complianceData?.poolSummary) {
      raw.complianceData.poolSummary.totalPar = 0;
      raw.complianceData.poolSummary.totalPrincipalBalance = 0;
    }
    raw.holdings = [];
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "poolSummary.totalPar");
    expectBlockingError(w, "poolSummary.totalPar");
    expectGateThrows(resolved, warnings);
  });

  it("fee bps heuristic (resolver.ts:482) — rate > 5 with null rateUnit guesses bps → blocking", () => {
    const raw = loadRaw();
    // Trip the heuristic: senior mgmt fee with rate > 5 and rateUnit null.
    // Without rateUnit the resolver guesses bps; the wrong-direction guess
    // produces a 100× silent error. New behavior refuses rather than guess.
    const seniorFee = (raw.constraints.fees as any[]).find((f: any) => {
      const n = (f.name ?? "").toLowerCase();
      return n.includes("senior") && (n.includes("mgmt") || n.includes("management"));
    });
    expect(seniorFee).toBeDefined();
    seniorFee.rate = "10";
    seniorFee.rateUnit = null;
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) =>
      w.field === "fees.seniorFeePct" && w.message.includes("no rateUnit"),
    );
    expectBlockingError(w, "fees.seniorFeePct (bps heuristic)");
    expectGateThrows(resolved, warnings);
  });

  it("ocTriggers empty (resolver.ts:374) — no OC triggers in compliance OR PPM → blocking", () => {
    const raw = loadRaw();
    // Drop every OC test the resolver's `isOcTest` predicate would match
    // (testType oc_*/overcollateralization OR testName matches "overcollateral"
    // / "par value" / both "oc"+"ratio"). Mirroring the predicate here keeps
    // the test honest if the resolver's matcher widens — the fixture filter
    // tracks the production code.
    raw.complianceData.complianceTests = (raw.complianceData.complianceTests as any[]).filter(
      (t: any) => {
        const tt = (t.testType ?? "").toLowerCase();
        if (tt === "oc_par" || tt === "oc_mv" || tt === "overcollateralization" || tt.startsWith("oc")) return false;
        const name = (t.testName ?? "").toLowerCase();
        if (name.includes("overcollateral") || name.includes("par value")) return false;
        if (name.includes("oc") && name.includes("ratio")) return false;
        return true;
      },
    );
    raw.constraints.coverageTestEntries = [];
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "ocTriggers");
    expectBlockingError(w, "ocTriggers (empty)");
    expectGateThrows(resolved, warnings);
  });
});

describe("Carve-out at :1434 (display-only, severity:error + blocking:false)", () => {
  // Behavioral fixture-based test: trip the carve-out by stripping the
  // "(a)..(dd)" letter prefix from every CONCENTRATION test name. The
  // resolver's letter-prefix regex then matches none of them →
  // `matchedLetters = 0 < 20` while `concCount = 36 >= 10` → the
  // vocabulary-drift guard fires. The test asserts the warning is
  // (a) emitted, (b) `severity: "error"`, and (c) `blocking: false`
  // — and crucially that `buildFromResolved` does NOT throw, because
  // a non-blocking error must not gate the projection. This locks the
  // behavior, not the source-text shape: a future refactor that
  // preserves the carve-out semantics keeps this test green; one that
  // accidentally drops `blocking: false` (or flips to `blocking: true`)
  // fails immediately.
  it("vocabulary mismatch fires the carve-out warning without blocking the projection", () => {
    const raw = loadRaw();
    let stripped = 0;
    for (const t of (raw.complianceData?.complianceTests ?? []) as any[]) {
      if (t.testType !== "CONCENTRATION") continue;
      // Drop the leading "(letter)" / "(letter)(roman)" prefix so the
      // resolver's join regex matches nothing.
      t.testName = (t.testName ?? "").replace(/^\s*\([a-z]+\)(?:\([iv]+\))?\s*/i, "");
      stripped++;
    }
    expect(stripped, "fixture should contain CONCENTRATION tests to strip").toBeGreaterThanOrEqual(10);
    const { resolved, warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "concentrationJoin.vocabulary");
    expect(w, "carve-out warning did not fire — verify trigger thresholds").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(false);
    // Behavioral half of the carve-out: the warning is severity:error but
    // does NOT block the projection. If a future change flips it to
    // blocking:true, this expectation flips and signals the regression.
    expect(() =>
      buildFromResolved(resolved, DEFAULT_ASSUMPTIONS, warnings),
    ).not.toThrow();
  });
});
