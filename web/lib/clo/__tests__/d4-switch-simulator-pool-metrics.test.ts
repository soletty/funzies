/**
 * D4 — Switch simulator pool-metric recomputation (Sprint 4).
 *
 * `applySwitch` now returns `switchedResolved` with a recomputed `poolSummary`
 * so partner UI comparing base vs switched pool summaries sees compliance
 * impact of the proposed trade directly. Shared computation lives in
 * `pool-metrics.ts` — same helpers as the projection engine's per-period
 * metrics (KI-21 — avoid parallel implementations).
 *
 * Scope:
 *   ✅ warf, walYears, wacSpreadBps, pctCccAndBelow recomputed from switchedLoans.
 *   ✅ top10ObligorsPct new field, resolver + applySwitch both populate.
 *   ✅ numberOfObligors recounted on switched pool.
 *   ❌ pctCovLite / pctPik / pctBonds / pctSeniorSecured / etc — inherited
 *      stale from base pool (no per-loan data); see applySwitch comment.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applySwitch } from "@/lib/clo/switch-simulator";
import { defaultsFromResolved } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData, ResolvedLoan } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
  raw: Parameters<typeof defaultsFromResolved>[1];
};

const assumptions = defaultsFromResolved(fixture.resolved, fixture.raw);

// Pick a mid-par B loan to swap away from (Euro XV pool is B-heavy).
const sellIdx = fixture.resolved.loans.findIndex(
  (l) => l.ratingBucket === "B" && l.parBalance > 500_000 && !l.isDelayedDraw,
);

/** Compute the engine's baseline pool metrics by running a NO-OP switch
 *  (sell 0 par, buy a zero-par placeholder). Establishes apples-to-apples
 *  comparison against real switches — avoids the KI-17 engine-vs-trustee
 *  wacSpreadBps drift that contaminates comparisons against the fixture's
 *  trustee-reported `resolved.poolSummary` values.
 *
 *  TODO(KI-17): delete this helper once the engine's WAS computation matches
 *  trustee methodology (fixed-rate floating-equivalent adjustment + defaulted
 *  exclusion). After KI-17 closes, direct `fixture.resolved.poolSummary`
 *  comparison becomes valid and engineBaseline() becomes redundant. */
function engineBaseline(): ResolvedDealData["poolSummary"] {
  const zeroBuyLoan: ResolvedLoan = {
    parBalance: 0,
    maturityDate: fixture.resolved.loans[sellIdx].maturityDate,
    ratingBucket: "B",
    spreadBps: 0,
    obligorName: "",
    warfFactor: 2720,
  };
  const result = applySwitch(
    fixture.resolved,
    { sellLoanIndex: sellIdx, sellParAmount: 0, buyLoan: zeroBuyLoan, sellPrice: 100, buyPrice: 100 },
    assumptions,
  );
  return result.switchedResolved.poolSummary;
}
const enginBase = engineBaseline();

describe("D4 — top10ObligorsPct populated on engine-computed pool", () => {
  it("applySwitch computes top10ObligorsPct on the switched pool", () => {
    const top10 = enginBase.top10ObligorsPct;
    expect(top10).not.toBeNull();
    // Euro XV's well-diversified pool — top 10 typically 5-25% of par.
    // Tests the engine's computation; resolver-side population tested
    // indirectly via fresh re-ingest on real data (fixture JSON predates
    // the top10ObligorsPct field and persists null; re-ingest populates it).
    expect(top10!).toBeGreaterThan(3);
    expect(top10!).toBeLessThan(40);
  });
});

describe("D4 — applySwitch recomputes pool quality metrics", () => {
  it("swapping B→CCC raises WARF monotonically", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    const buyLoan: ResolvedLoan = {
      parBalance: sellLoan.parBalance,
      maturityDate: sellLoan.maturityDate,
      ratingBucket: "CCC",
      spreadBps: sellLoan.spreadBps + 200,
      obligorName: "Synthetic CCC Obligor",
      warfFactor: 6500, // Caa2
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 95, buyPrice: 95 },
      assumptions,
    );
    const switchedWarf = result.switchedResolved.poolSummary.warf;
    expect(switchedWarf).toBeGreaterThan(enginBase.warf);
  });

  it("swapping B→CCC raises pctCccAndBelow when buy par is meaningful", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    const buyLoan: ResolvedLoan = {
      parBalance: 10_000_000,
      maturityDate: sellLoan.maturityDate,
      ratingBucket: "CCC",
      spreadBps: 600,
      obligorName: "Big CCC Position",
      warfFactor: 6500,
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 95, buyPrice: 95 },
      assumptions,
    );
    const switchedPctCcc = result.switchedResolved.poolSummary.pctCccAndBelow ?? 0;
    expect(switchedPctCcc).toBeGreaterThan(enginBase.pctCccAndBelow ?? 0);
  });

  it("increasing spread on buy raises wacSpreadBps", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    const buyLoan: ResolvedLoan = {
      parBalance: sellLoan.parBalance,
      maturityDate: sellLoan.maturityDate,
      ratingBucket: "B",
      spreadBps: sellLoan.spreadBps + 100,
      obligorName: "Wider Spread",
      warfFactor: sellLoan.warfFactor,
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 100, buyPrice: 100 },
      assumptions,
    );
    const switchedWas = result.switchedResolved.poolSummary.wacSpreadBps;
    expect(switchedWas).toBeGreaterThan(enginBase.wacSpreadBps);
  });

  it("extending maturity raises walYears", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    const sellMatYears = (new Date(sellLoan.maturityDate).getTime() - new Date(fixture.resolved.dates.currentDate).getTime()) / (1000 * 86400 * 365.25);
    const longerMatYear = Math.ceil(sellMatYears) + 5;
    const buyLoan: ResolvedLoan = {
      parBalance: sellLoan.parBalance,
      maturityDate: `${new Date(fixture.resolved.dates.currentDate).getUTCFullYear() + longerMatYear}-01-15`,
      ratingBucket: "B",
      spreadBps: sellLoan.spreadBps,
      obligorName: "Longer Mat",
      warfFactor: sellLoan.warfFactor,
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 100, buyPrice: 100 },
      assumptions,
    );
    const switchedWal = result.switchedResolved.poolSummary.walYears;
    expect(switchedWal).toBeGreaterThan(enginBase.walYears);
  });
});

describe("D4 — top10ObligorsPct recomputed on switch", () => {
  it("adding a huge new obligor raises top10ObligorsPct", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    // Buy a massive position on a new obligor — should rank into the top 10.
    const buyLoan: ResolvedLoan = {
      parBalance: 30_000_000, // ~6% of Euro XV's €493M pool — definitely top 10
      maturityDate: sellLoan.maturityDate,
      ratingBucket: "B",
      spreadBps: sellLoan.spreadBps,
      obligorName: "Massive New Obligor",
      warfFactor: sellLoan.warfFactor,
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 100, buyPrice: 100 },
      assumptions,
    );
    const switchedTop10 = result.switchedResolved.poolSummary.top10ObligorsPct!;
    expect(switchedTop10).toBeGreaterThan(enginBase.top10ObligorsPct!);
  });
});

// TODO(KI-18-adjacent / future "isCovLite on ResolvedLoan"): DELETE this
// describe block when `pctCovLite`, `pctPik`, etc. become recomputable on the
// switched pool (i.e. ResolvedLoan gains per-loan `isCovLite` / `isPik` flags
// and applySwitch starts recomputing these fields instead of inheriting
// stale from base). This test pins the CURRENT stale-inherit contract; when
// the correct fix ships, it will fail — don't flip it, delete it and add a
// positive-enforcement assertion that the recompute happened.
describe("D4 — non-recomputed fields inherit from base (documented gap)", () => {
  it("pctCovLite stays at base value on switched pool", () => {
    const sellLoan = fixture.resolved.loans[sellIdx];
    const buyLoan: ResolvedLoan = {
      parBalance: sellLoan.parBalance,
      maturityDate: sellLoan.maturityDate,
      ratingBucket: "B",
      spreadBps: sellLoan.spreadBps,
      obligorName: "No-Op Swap",
      warfFactor: sellLoan.warfFactor,
    };
    const result = applySwitch(
      fixture.resolved,
      { sellLoanIndex: sellIdx, sellParAmount: sellLoan.parBalance, buyLoan, sellPrice: 100, buyPrice: 100 },
      assumptions,
    );
    // pctCovLite is among the fields we CAN'T recompute — inherited from base.
    // This is the documented methodology gap; test pins the current behavior so
    // a future expansion to recompute from isCovLite doesn't silently change
    // the contract without a test update.
    expect(result.switchedResolved.poolSummary.pctCovLite).toBe(
      fixture.resolved.poolSummary.pctCovLite,
    );
    expect(result.switchedResolved.poolSummary.pctPik).toBe(
      fixture.resolved.poolSummary.pctPik,
    );
  });
});
