/**
 * Bijection unit tests for `resolveAgencyRecovery`. The helper owns the
 * "per-rate min, percent-in / fraction-out" convention consumed by two
 * engine sites (resolver T=0 + projection forward-default firing). These
 * tests pin the contract so a future drift back to a dual-shape branch
 * (the bug shape that silently mapped `1.0` to 1% when the caller
 * intended 100%) fails here rather than only on a future deal.
 */

import { describe, it, expect } from "vitest";
import { resolveAgencyRecovery } from "../recovery-rate";

describe("resolveAgencyRecovery", () => {
  describe("data gap handling", () => {
    it("returns undefined when all rates are null", () => {
      expect(resolveAgencyRecovery([null, null, null])).toBeUndefined();
    });

    it("returns undefined when all rates are undefined", () => {
      expect(resolveAgencyRecovery([undefined, undefined, undefined])).toBeUndefined();
    });

    it("returns undefined on empty input", () => {
      expect(resolveAgencyRecovery([])).toBeUndefined();
    });
  });

  describe("single-rate inputs (percent shape)", () => {
    it("45 → 0.45", () => {
      expect(resolveAgencyRecovery([45, null, null])).toBeCloseTo(0.45, 6);
    });

    it("100% boundary: 100 → 1.0", () => {
      expect(resolveAgencyRecovery([100, null, null])).toBeCloseTo(1.0, 6);
    });

    it("zero: 0 → 0", () => {
      expect(resolveAgencyRecovery([0, null, null])).toBe(0);
    });

    it("1.0 is unambiguously percent (1%), not fraction (100%)", () => {
      // Pin for the dual-shape regression: pre-narrowing the helper carried
      // an `r >= 1 ? r/100 : r` branch that mapped 1.0 to 1% (under the
      // percent reading) but a caller assuming fraction input would have
      // expected 100%. The narrowed contract is percent-only — both
      // ingestion paths emit percent (SDF + LLM-PDF prompt). A 1.0 input
      // means 1%; callers that want 100% must pass 100.
      expect(resolveAgencyRecovery([1.0, null, null])).toBeCloseTo(0.01, 6);
    });
  });

  describe("multi-rate inputs", () => {
    it("takes lesser: min(45, 70, 60) → 0.45", () => {
      expect(resolveAgencyRecovery([45, 70, 60])).toBeCloseTo(0.45, 6);
    });

    it("two-of-three present: min(null, 70, 30) → 0.30", () => {
      expect(resolveAgencyRecovery([null, 70, 30])).toBeCloseTo(0.30, 6);
    });

    it("zero is preserved as the minimum: min(0, 50, 60) → 0", () => {
      // Distinct from "no data" — a 0% recovery rate is a valid agency
      // value (e.g., total expected loss). Helper must NOT confuse it
      // with absent data.
      expect(resolveAgencyRecovery([0, 50, 60])).toBe(0);
    });
  });

  describe("KI-63 [tentative] — currently dispatches over all three agencies", () => {
    // Filed during KI-32 closure: the inline comment at resolver.ts reads
    // the Euro XV PPM as "Lesser of Fitch Collateral Value and S&P
    // Collateral Value" (a 2-agency convention), but both call sites
    // (resolver T=0 + projection LoanState construction) pass all three
    // agency rates into the helper. The helper is generic; the agency-
    // selection rule sits at the call site. This test pins the current
    // 3-agency behavior so that flipping either call site to a 2-agency
    // subset (without re-baselining the KI ledger) fails CI.
    //
    // When KI-63 closes (per-deal PPM extraction lands and the call sites
    // pass the right subset), update this assertion to the new convention
    // OR delete the test alongside removing KI-63 from the ledger.
    it("min over all 3 with Moody's = 20, S&P = 40, Fitch = 30 returns 0.20 (3-agency); a 2-agency 'lesser of Fitch and S&P' reading would return 0.30", () => {
      // The discrepancy is the KI-63 magnitude shape: Moody's is typically
      // the tightest agency on senior-secured recovery, so 3-agency-min
      // systematically pulls the value below lesser-of-Fitch-and-S&P.
      expect(resolveAgencyRecovery([20, 40, 30])).toBeCloseTo(0.20, 6);
    });
  });

  describe("invariant violations (refuse loud)", () => {
    it("throws on NaN", () => {
      expect(() => resolveAgencyRecovery([NaN, 45, null])).toThrow(/NaN/);
    });

    it("throws on negative rate", () => {
      expect(() => resolveAgencyRecovery([-5, 45, null])).toThrow(/negative/);
    });

    it("throws on > 100 (basis-point shape mis-parse)", () => {
      expect(() => resolveAgencyRecovery([4500, null, null])).toThrow(/> 100/);
    });

    it("throws on 200 (absolute-vs-percent confusion)", () => {
      expect(() => resolveAgencyRecovery([200, null, null])).toThrow(/> 100/);
    });

    it("throws on 100.01 (just above the 100% boundary)", () => {
      expect(() => resolveAgencyRecovery([100.01, null, null])).toThrow(/> 100/);
    });

    it("does NOT throw on the 100% boundary", () => {
      expect(() => resolveAgencyRecovery([100, null, null])).not.toThrow();
    });
  });
});
