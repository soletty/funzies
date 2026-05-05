/**
 * Resolver-side correctness tests for `resolveHedgeCost` (KI-31 closure
 * Signal 2). The function is internal (not exported) per the canonical
 * pattern — exercised through `resolveWaterfallInputs` here, mirroring
 * how `resolveSeniorExpensesCap` is tested.
 *
 * Blocking-path tests live in `blocking-extraction-failures.test.ts`
 * (canonical inventory). This file covers positive cases and
 * non-blocking advisories that the blocking-only file should not
 * dilute — sum across multiple periodic rows, event-driven exclusion,
 * sanity-warn at ≥ 200 bps.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");

// Raw fixture shape: untyped at the boundary because `resolveWaterfallInputs`
// is the layer that asserts the shape (parser + sanity gates inside).
// Using `unknown` arrays/objects keeps the type system honest here while
// letting per-test mutations cast at the assignment site.
interface RawFixture {
  raw: {
    constraints: { fees?: Array<{ name: string; rate?: string; rateUnit?: string | null }> } & Record<string, unknown>;
    complianceData: unknown;
    tranches: unknown[];
    trancheSnapshots: unknown[];
    holdings: unknown[];
    dealDates: unknown;
    accountBalances: unknown[];
    parValueAdjustments: unknown[];
  };
}

function loadRaw(): RawFixture["raw"] {
  return JSON.parse(JSON.stringify(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).raw));
}

function runResolver(raw: RawFixture["raw"]) {
  // The resolver entry's parameter types diverge from the fixture's
  // unknown-shaped arrays; cast at this boundary, where the runtime
  // shape is identical and the type contract is the resolver's
  // responsibility to enforce.
  return resolveWaterfallInputs(
    raw.constraints as Parameters<typeof resolveWaterfallInputs>[0],
    raw.complianceData as Parameters<typeof resolveWaterfallInputs>[1],
    raw.tranches as Parameters<typeof resolveWaterfallInputs>[2],
    raw.trancheSnapshots as Parameters<typeof resolveWaterfallInputs>[3],
    raw.holdings as Parameters<typeof resolveWaterfallInputs>[4],
    raw.dealDates as Parameters<typeof resolveWaterfallInputs>[5],
    raw.accountBalances as Parameters<typeof resolveWaterfallInputs>[6],
    raw.parValueAdjustments as Parameters<typeof resolveWaterfallInputs>[7],
  );
}

describe("resolveHedgeCost — Signal 2 positive cases", () => {
  it("greenfield (Euro XV: no /hedge|swap/ rows) → resolved.hedgeCostBps = 0, no hedge warnings", () => {
    const raw = loadRaw();
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(0);
    expect(warnings.find((w) => w.field === "hedgeCostBps")).toBeUndefined();
  });

  it("single periodic hedge row, bps_pa explicit → returned as-is", () => {
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "30", rateUnit: "bps_pa" },
    ];
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(30);
    expect(warnings.find((w) => w.field === "hedgeCostBps")).toBeUndefined();
  });

  it("single periodic hedge row, pct_pa explicit → multiplied by 100", () => {
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "0.30", rateUnit: "pct_pa" },
    ];
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(30);
    expect(warnings.find((w) => w.field === "hedgeCostBps")).toBeUndefined();
  });

  it("multiple periodic hedge rows → summed at step (F)", () => {
    // A hedged deal with both a currency hedge (30 bps) and an IR
    // swap (20 bps) carries combined periodic cost at step (F).
    // The engine consumes the total bps × beginPar × dayFrac, so
    // both must contribute to `hedgeCostBps`. Returning only the
    // first match would silently understate the periodic accrual.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "30", rateUnit: "bps_pa" },
      { name: "IR Swap Periodic Fee", rate: "20", rateUnit: "bps_pa" },
    ];
    const { resolved } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(50);
  });

  it("event-driven rows (termination, replacement, defaulted, MTM) excluded from sum", () => {
    // PPM step (AA) Defaulted Hedge Termination is KI-06 territory
    // (event-driven on counterparty default). Hedge Replacement is
    // a one-off transition payment, not periodic. MTM revaluation
    // flows through the OC numerator, not the interest waterfall.
    // None should contribute to `hedgeCostBps` (which represents
    // the periodic step (F) accrual). Treat the periodic row as
    // the only contribution.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "30", rateUnit: "bps_pa" }, // periodic — INCLUDE
      { name: "Hedge Termination Fee", rate: "100", rateUnit: "bps_pa" }, // EXCLUDE
      { name: "Defaulted Hedge Termination", rate: "150", rateUnit: "bps_pa" }, // EXCLUDE (KI-06)
      { name: "Hedge Replacement Payment", rate: "75", rateUnit: "bps_pa" }, // EXCLUDE
      { name: "Hedge MTM", rate: "200", rateUnit: "bps_pa" }, // EXCLUDE
      { name: "Currency Hedge Mark-to-Market", rate: "50", rateUnit: "bps_pa" }, // EXCLUDE
    ];
    const { resolved } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(30);
  });

  it("only event-driven rows (no periodic) → returned 0, no warning", () => {
    // A deal whose extracted fees lists only termination/replacement
    // entries (e.g., where step F periodic is "per agreement" and
    // not extracted, but step AA termination IS extracted) should
    // return 0 from Signal 2. Signal 1 (waterfall back-derive) may
    // still fire downstream. No blocking warning here — the absence
    // of periodic data isn't a parsing failure.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Hedge Termination Fee", rate: "100", rateUnit: "bps_pa" },
      { name: "Hedge Replacement Payment", rate: "75", rateUnit: "bps_pa" },
    ];
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(0);
    expect(warnings.find((w) => w.field === "hedgeCostBps")).toBeUndefined();
  });

  it("sanity warn fires at >= 200 bps without blocking", () => {
    // 200 bps is the upper bound for stress cross-currency hedge
    // cost; values at or above suggest extraction artefacts. Surface
    // a warn for partner-audit visibility but do NOT block — the
    // value is still consumed.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "250", rateUnit: "bps_pa" },
    ];
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(250);
    const w = warnings.find((w) => w.field === "hedgeCostBps");
    expect(w?.severity).toBe("warn");
    expect(w?.blocking).toBe(false);
  });

  it("/swap/ alone (no 'hedge' substring) is matched", () => {
    // "Interest Rate Swap Cost" has no "hedge" but is a periodic
    // hedge instrument. The /hedge|swap/i alternation must catch it.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Interest Rate Swap Cost", rate: "15", rateUnit: "bps_pa" },
    ];
    const { resolved } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(15);
  });

  it("multi-row with one unparseable rate → blocks; partial sum is discarded", () => {
    // Defense-in-depth invariant: if ANY periodic hedge row has a
    // blocking issue, the whole hedgeCostBps blocks. A future change
    // that "skips bad rows and sums the rest" would silently report
    // partial data — exactly the principle-3 violation this closure
    // exists to prevent. Locks return-0-on-block + early-exit.
    const raw = loadRaw();
    raw.constraints.fees = [
      ...(raw.constraints.fees ?? []),
      { name: "Currency Hedge Cost", rate: "30", rateUnit: "bps_pa" }, // valid
      { name: "IR Swap Cost", rate: "per agreement", rateUnit: null }, // unparseable
    ];
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.hedgeCostBps).toBe(0);
    const w = warnings.find((w) => w.field === "hedgeCostBps");
    expect(w?.severity).toBe("error");
    expect(w?.blocking).toBe(true);
  });
});
