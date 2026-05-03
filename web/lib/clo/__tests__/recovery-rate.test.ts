/**
 * Bijection unit tests for `resolveAgencyRecovery`. The helper owns the
 * "per-rate normalize THEN min" convention consumed by two engine sites
 * (resolver T=0 + projection forward-defaults); these tests pin the
 * contract so a future drift back to "min then normalize" (the bug
 * shape that silently returns the larger rate under mixed-scale
 * inputs) fails here rather than only on a future deal's SDF.
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

  describe("single-rate inputs", () => {
    it("percent shape: 45 → 0.45", () => {
      expect(resolveAgencyRecovery([45, null, null])).toBeCloseTo(0.45, 6);
    });

    it("fraction shape: 0.45 → 0.45", () => {
      expect(resolveAgencyRecovery([null, 0.45, null])).toBeCloseTo(0.45, 6);
    });

    it("100% boundary: 100 → 1.0", () => {
      expect(resolveAgencyRecovery([100, null, null])).toBeCloseTo(1.0, 6);
    });

    it("zero: 0 → 0", () => {
      expect(resolveAgencyRecovery([0, null, null])).toBe(0);
    });
  });

  describe("same-scale inputs", () => {
    it("all percent: takes lesser", () => {
      expect(resolveAgencyRecovery([45, 70, 60])).toBeCloseTo(0.45, 6);
    });

    it("all fraction: takes lesser", () => {
      expect(resolveAgencyRecovery([0.45, 0.70, 0.60])).toBeCloseTo(0.45, 6);
    });
  });

  describe("mixed-scale inputs (the load-bearing case)", () => {
    // The naive min-then-scale shape silently returns 0.70 ("70%") when
    // the correct lesser of 45% and 70% is 45%. Per-rate normalize first
    // produces the right answer.
    it("min(45%, 0.70) returns 45%, not 70%", () => {
      expect(resolveAgencyRecovery([45, 0.70, null])).toBeCloseTo(0.45, 6);
    });

    it("min(0.30, 60%) returns 30%", () => {
      expect(resolveAgencyRecovery([0.30, 60, null])).toBeCloseTo(0.30, 6);
    });

    it("three-way mixed: min(0.25, 50%, 0.80) returns 25%", () => {
      expect(resolveAgencyRecovery([0.25, 50, 0.80])).toBeCloseTo(0.25, 6);
    });
  });

  describe("KI-63 [tentative] — currently dispatches over all three agencies", () => {
    // Filed during KI-32 closure: the inline comment at resolver.ts:1453
    // reads the Euro XV PPM as "Lesser of Fitch Collateral Value and S&P
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
    it("min over all 3 with Moody's = 0.20, S&P = 0.40, Fitch = 0.30 returns 0.20 (3-agency); a 2-agency 'lesser of Fitch and S&P' reading would return 0.30", () => {
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

    it("throws on post-normalize > 1.0 (basis-point shape mis-parse)", () => {
      // 4500 → /100 → 45.0 → > 1, throws.
      expect(() => resolveAgencyRecovery([4500, null, null])).toThrow(/> 1\.0|100%/);
    });

    it("throws on 200 (absolute-vs-percent confusion)", () => {
      expect(() => resolveAgencyRecovery([200, null, null])).toThrow(/> 1\.0|100%/);
    });

    it("does NOT throw on the 100% boundary", () => {
      expect(() => resolveAgencyRecovery([100, null, null])).not.toThrow();
    });
  });
});
