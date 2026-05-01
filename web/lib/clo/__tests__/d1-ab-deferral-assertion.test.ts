/**
 * D1 — senior-debt deferral runtime assertion.
 *
 * PPM: the two most-senior debt tranches (structurally Class A and Class B,
 * regardless of label) are non-deferrable — non-payment of interest is an
 * Event of Default, not a PIK deferral (unlike C/D/E/F which PIK deferred
 * interest). A tranche misconfigured with `isDeferrable: true` at one of
 * those ranks would silently compound deferred interest onto a
 * non-deferrable balance and produce materially wrong projections.
 *
 * Predicate is rank-based, not name-based: protected = the lowest two
 * distinct seniorityRank values among non-income, non-amortising tranches.
 * Amortising tranches (Class X) are also non-deferrable per PPM and trip a
 * separate guard.
 *
 * D1 is a fail-fast guard at `runProjection` entry. These tests exercise it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runProjection, type ProjectionInputs } from "@/lib/clo/projection";
import { buildFromResolved, DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";
import { makeInputs } from "./test-helpers";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: {
    constraints: Parameters<typeof resolveWaterfallInputs>[0];
    complianceData: Parameters<typeof resolveWaterfallInputs>[1];
    tranches: Parameters<typeof resolveWaterfallInputs>[2];
    trancheSnapshots: Parameters<typeof resolveWaterfallInputs>[3];
    holdings: Parameters<typeof resolveWaterfallInputs>[4];
    dealDates: Parameters<typeof resolveWaterfallInputs>[5];
    accountBalances: Parameters<typeof resolveWaterfallInputs>[6];
    parValueAdjustments: Parameters<typeof resolveWaterfallInputs>[7];
  };
};

describe("D1 — senior-debt deferral runtime assertion", () => {
  it('"Class A" (rank 1) with isDeferrable=true throws', () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true|seniorityRank/);
  });

  it('"Class B-1" (rank 2) with isDeferrable=true throws', () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class B-1" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true|seniorityRank/);
  });

  it('"Class C" (rank 3) with isDeferrable=true does NOT throw (C is PIK-deferrable per PPM)', () => {
    const ok: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class C" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(ok, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).not.toThrow();
  });

  it("Euro XV base fixture runs cleanly (no A/B incorrectly marked deferrable)", () => {
    const inputs = buildFromResolved(fixture.resolved, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).not.toThrow();
  });

  // Marker — deferrable propagation from interestMechanics.interest_deferral.
  //
  // The LLM cap-structure prompt asks for `deferrable` per tranche, but the
  // cap-structure pages of a PPM rarely state deferrability inline; the
  // authoritative source is the §7 interest-mechanics block. Without the
  // resolver's fall-through to `interestMechanics.interest_deferral.class_X
  // .deferral_permitted`, every deal whose cap-structure extraction misses
  // `deferrable` (which is most of them) resolves Class C/D/E/F to
  // isDeferrable=false, silently disabling PIK accrual under junior-interest
  // shortfall. Magnitude on Euro XV: ~1.15pp shift in equity IRR gap (a1 test
  // anchor moved -15.71 → -16.86 when this fix landed). Asserts on regenerated
  // resolver output from raw constraints — Class C/D/E/F MUST resolve to
  // isDeferrable=true on Euro XV given its `interest_deferral.class_c..f
  // .deferral_permitted=true` and absent `capitalStructure[].deferrable`.
  it("regenerated tranches[].isDeferrable propagates from interest_deferral block", () => {
    const raw = fixture.raw;
    const { resolved } = resolveWaterfallInputs(
      raw.constraints,
      raw.complianceData,
      raw.tranches,
      raw.trancheSnapshots,
      raw.holdings,
      raw.dealDates,
      raw.accountBalances,
      raw.parValueAdjustments,
    );
    const byClass = Object.fromEntries(resolved.tranches.map((t) => [t.className, t.isDeferrable]));
    expect(byClass["Class A"]).toBe(false);
    expect(byClass["Class B-1"]).toBe(false);
    expect(byClass["Class B-2"]).toBe(false);
    expect(byClass["Class C"]).toBe(true);
    expect(byClass["Class D"]).toBe(true);
    expect(byClass["Class E"]).toBe(true);
    expect(byClass["Class F"]).toBe(true);
  });

  // A senior tranche named with a non-A/B prefix (e.g. "K-1") and marked
  // isDeferrable=true must still trip the guard — the rank-based predicate
  // catches it because structurally it IS the rank-1 non-income-note
  // senior debt tranche, regardless of its label.
  it("non-A/B-named rank-1 senior with isDeferrable=true throws (rank-based)", () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, className: "K-1", isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true|seniorityRank/);
  });

  it("rank-3 deferrable tranche does NOT throw (predicate isn't over-strict)", () => {
    // 3+ non-amort debt ranks; the deferrable tranche at rank 3 is below
    // the protected top-2 set and should be allowed.
    const inputs: ProjectionInputs = makeInputs({
      tranches: [
        { className: "A", currentBalance: 50_000_000, spreadBps: 110, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: false },
        { className: "B", currentBalance: 20_000_000, spreadBps: 200, seniorityRank: 2, isFloating: true, isIncomeNote: false, isDeferrable: false },
        { className: "C", currentBalance: 10_000_000, spreadBps: 350, seniorityRank: 3, isFloating: true, isIncomeNote: false, isDeferrable: true },
        { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 4, isFloating: false, isIncomeNote: true, isDeferrable: false },
      ],
      ocTriggers: [],
      icTriggers: [],
    });
    expect(() => runProjection(inputs)).not.toThrow();
  });

  it("amortising tranche with isDeferrable=true throws (Class X cannot defer)", () => {
    const inputs: ProjectionInputs = makeInputs({
      tranches: [
        { className: "X", currentBalance: 5_000_000, spreadBps: 60, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: true, isAmortising: true, amortisationPerPeriod: 500_000 },
        { className: "A", currentBalance: 50_000_000, spreadBps: 110, seniorityRank: 2, isFloating: true, isIncomeNote: false, isDeferrable: false },
        { className: "B", currentBalance: 20_000_000, spreadBps: 200, seniorityRank: 3, isFloating: true, isIncomeNote: false, isDeferrable: false },
        { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 4, isFloating: false, isIncomeNote: true, isDeferrable: false },
      ],
      ocTriggers: [],
      icTriggers: [],
    });
    expect(() => runProjection(inputs)).toThrow(/amortising/i);
  });

  it("X-bearing structure: Class A at rank 2 is protected (top-2 of non-amort debt = ranks 2,3)", () => {
    // X amortising at rank 1 → nonAmortDebtRanks = [2, 3, ...]. Top 2 = {2, 3}.
    // Class A at rank 2 with isDeferrable=true must throw.
    const inputs: ProjectionInputs = makeInputs({
      tranches: [
        { className: "X", currentBalance: 5_000_000, spreadBps: 60, seniorityRank: 1, isFloating: true, isIncomeNote: false, isDeferrable: false, isAmortising: true, amortisationPerPeriod: 500_000 },
        { className: "A", currentBalance: 50_000_000, spreadBps: 110, seniorityRank: 2, isFloating: true, isIncomeNote: false, isDeferrable: true },
        { className: "B", currentBalance: 20_000_000, spreadBps: 200, seniorityRank: 3, isFloating: true, isIncomeNote: false, isDeferrable: false },
        { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 4, isFloating: false, isIncomeNote: true, isDeferrable: false },
      ],
      ocTriggers: [],
      icTriggers: [],
    });
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true|seniorityRank/);
  });
});
