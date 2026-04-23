/**
 * N1 — Engine correctness on the PRODUCTION path (no input pinning).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  This file exercises what a user actually sees when they load the deal   ║
 * ║  and click "Run projection" with no manual slider overrides. It's the    ║
 * ║  integration test for the pre-fill family (A1 + D3 + baseRate + fees).  ║
 * ║                                                                          ║
 * ║  Correctness is measured against trustee reality with legitimate         ║
 * ║  tolerance. No pinning of any field — the `DEFAULT_ASSUMPTIONS` path is  ║
 * ║  what a user actually sees.                                              ║
 * ║                                                                          ║
 * ║  This file is RED BY DESIGN until the pre-fill family ships. When each   ║
 * ║  pre-fill gap closes, a failsWithMagnitude marker removes and the        ║
 * ║  corresponding bucket goes green.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Compare with `n1-correctness.test.ts`:
 *   - n1-correctness: legitimate pins for EURIBOR rate + PPM fees. Tests
 *     engine arithmetic. Red on KI-08 (trusteeFeeBps not pinned) + day-count.
 *   - n1-production-path (this file): no pins. Exposes the full user-visible
 *     picture. Red on every pre-fill gap in addition to engine bugs.
 *
 * When `defaultsFromResolved(resolved, raw)` ships per the plan's D3
 * consolidation, the baseRate / fee / recovery-rate pre-fills auto-populate
 * from resolver and raw data. The `DEFAULT_ASSUMPTIONS` path will then converge
 * with `n1-correctness.test.ts`, and most markers here will close.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runBacktestHarness, formatHarnessTable } from "@/lib/clo/backtest-harness";
import { buildBacktestInputs } from "@/lib/clo/backtest-types";
import { buildFromResolved, DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";
import { failsWithMagnitude } from "./fails-with-magnitude";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: Parameters<typeof buildBacktestInputs>[0];
};

// No pinning — use DEFAULT_ASSUMPTIONS straight. This is what a user sees.
const projectionInputs = buildFromResolved(fixture.resolved, DEFAULT_ASSUMPTIONS);
const backtest = buildBacktestInputs(fixture.raw);
const harnessResult = runBacktestHarness(projectionInputs, backtest);
const driftsByBucket = new Map(harnessResult.steps.map((s) => [s.engineBucket, s]));

function drift(bucket: string): number {
  const row = driftsByBucket.get(bucket as typeof harnessResult.steps[number]["engineBucket"]);
  if (!row) throw new Error(`Harness did not emit bucket "${bucket}"`);
  return row.delta;
}

describe("N1 production path — diagnostic table (not an assertion)", () => {
  it("prints the full delta table for partner-facing diagnostics", () => {
    console.log("\n" + formatHarnessTable(harnessResult));
  });
});

// ----------------------------------------------------------------------------
// Pre-fill-gap drifts. Each represents a real user-visible bug that closes
// when the plan's A1/D3/baseRate/C3 pre-fill family lands.
// ----------------------------------------------------------------------------

describe("N1 production path — pre-fill gap drifts (red by design)", () => {
  // Post-B3 drifts are KI-10 (baseRate mispin) + KI-12b (day-count / harness
  // period mismatch) combined. Neither can be cleanly separated in the
  // production path without pinning; both will close together when D3 +
  // KI-12a land. Magnitudes re-measured empirically after B3 ship.
  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 91363.89,
      tolerance: 500,
    },
    "Class A interest: stale baseRate + day-count drift",
    () => drift("classA_interest"),
  );

  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 10650,
      tolerance: 200,
    },
    "Class B interest: stale baseRate + day-count drift",
    () => drift("classB_interest"),
  );

  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 10616.67,
      tolerance: 200,
    },
    "Class C interest: stale baseRate + day-count drift",
    () => drift("classC_current"),
  );

  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 12231.77,
      tolerance: 200,
    },
    "Class D interest: stale baseRate + day-count drift",
    () => drift("classD_current"),
  );

  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 11225.17,
      tolerance: 200,
    },
    "Class E interest: stale baseRate + day-count drift",
    () => drift("classE_current"),
  );

  failsWithMagnitude(
    {
      ki: "KI-10 + KI-12b",
      closesIn: "Sprint 1 / baseRate pre-fill (D3) + KI-12a harness fix",
      expectedDrift: 7712.50,
      tolerance: 200,
    },
    "Class F interest: stale baseRate + day-count drift",
    () => drift("classF_current"),
  );

  // DEFAULT_ASSUMPTIONS.seniorFeePct = 0 (not pre-filled from resolved.fees.seniorFeePct = 0.15%)
  failsWithMagnitude(
    {
      ki: "KI-11",
      closesIn: "Sprint 3 / C3 (fee pre-fill family)",
      expectedDrift: -176587.19,
      tolerance: 200,
    },
    "seniorMgmtFee emits 0 (default) vs trustee €176,587",
    () => drift("seniorMgmtFeePaid"),
  );

  // DEFAULT_ASSUMPTIONS.subFeePct = 0 (not pre-filled from resolved.fees.subFeePct = 0.35%)
  failsWithMagnitude(
    {
      ki: "KI-11",
      closesIn: "Sprint 3 / C3 (fee pre-fill family)",
      expectedDrift: -412036.78,
      tolerance: 500,
    },
    "subMgmtFee emits 0 (default) vs trustee €412,037",
    () => drift("subMgmtFeePaid"),
  );

  // KI-08: trusteeFeeBps = 0 default (per-agreement not derived from Q1 actuals).
  failsWithMagnitude(
    {
      ki: "KI-08",
      closesIn: "Sprint 3 / C3 (trustee/admin fee pre-fill from Q1 actuals)",
      expectedDrift: -64660.20,
      tolerance: 100,
    },
    "trusteeFeesPaid matches trustee within €10",
    () => drift("trusteeFeesPaid"),
  );
});

describe("N1 production path — sub distribution cascade", () => {
  // Residual cascading from all upstream drifts. Under no pinning, engine
  // keeps all the missing fee amounts — sub distribution is massively
  // higher than trustee because engine underpays all fees.
  failsWithMagnitude(
    {
      ki: "KI-13b-productionPath",
      closesIn: "Progressively as KI-10 / KI-11 / KI-12a / KI-12b close (re-baseline on each — see KI-13 ledger entry)",
      // Pre-B3: +€617,122.40. Post-B3: +€645,435.62 — cascade grew by ~€28K
      // as the six class-interest drifts added to the residual. Re-baselined
      // per reviewer's KI-13 maintenance protocol.
      expectedDrift: 645435.62,
      tolerance: 1000,
    },
    "subDistribution massively over-pays engine-side (pre-fill gaps compound)",
    () => drift("subDistribution"),
  );
});

// Informational — these are not pre-fill gaps but engine-does-not-model entries.
describe("N1 production path — KI-01 / KI-09 engine-does-not-model steps", () => {
  it("taxes drift is present (KI-09): engine emits 0; trustee collected €6,133", () => {
    const row = driftsByBucket.get("taxes");
    expect(row?.actual).toBeCloseTo(6133, -1);
  });
  it("issuerProfit drift is present (KI-01): engine emits 0; trustee collected €250", () => {
    const row = driftsByBucket.get("issuerProfit");
    expect(row?.actual).toBeCloseTo(250, 0);
  });
});
