/**
 * Bijection unit tests for `resolveAgencyRecovery`. The helper owns the
 * "lesser of available agency rates within the deal's Rating Agencies
 * subset, with optional per-agency MV floor" convention consumed by two
 * engine sites (resolver T=0 + projection forward-default firing). These
 * tests pin the contract so a future drift back to a dual-shape branch
 * (the bug shape that silently mapped `1.0` to 1% when the caller intended
 * 100%) or a regression on the agency-subset filter / MV-floor application
 * fails here rather than only on a future deal.
 */

import { describe, it, expect } from "vitest";
import { resolveAgencyRecovery } from "../recovery-rate";

const ALL_AGENCIES = ["moodys", "sp", "fitch"] as const;
const FITCH_MOODYS = ["moodys", "fitch"] as const; // Euro XV's Rating Agencies set

describe("resolveAgencyRecovery", () => {
  describe("data gap handling", () => {
    it("returns undefined when all rates are null", () => {
      expect(
        resolveAgencyRecovery({ moodys: null, sp: null, fitch: null }, ALL_AGENCIES),
      ).toBeUndefined();
    });

    it("returns undefined when all subset-relevant rates are absent", () => {
      // S&P is set but the deal's Rating Agencies set excludes it — the
      // S&P rate should be dropped, leaving no subset-relevant rates.
      expect(
        resolveAgencyRecovery({ moodys: null, sp: 50, fitch: null }, FITCH_MOODYS),
      ).toBeUndefined();
    });

    it("returns undefined on empty subset", () => {
      expect(
        resolveAgencyRecovery({ moodys: 50, sp: 50, fitch: 50 }, []),
      ).toBeUndefined();
    });
  });

  describe("single-rate inputs (percent shape)", () => {
    it("45 → 0.45", () => {
      expect(resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES)).toBeCloseTo(0.45, 6);
    });

    it("100% boundary: 100 → 1.0", () => {
      expect(resolveAgencyRecovery({ moodys: 100 }, ALL_AGENCIES)).toBeCloseTo(1.0, 6);
    });

    it("zero: 0 → 0", () => {
      expect(resolveAgencyRecovery({ moodys: 0 }, ALL_AGENCIES)).toBe(0);
    });

    it("1.0 is unambiguously percent (1%), not fraction (100%)", () => {
      // Pin for the dual-shape regression: pre-narrowing the helper carried
      // an `r >= 1 ? r/100 : r` branch that mapped 1.0 to 1% (under the
      // percent reading) but a caller assuming fraction input would have
      // expected 100%. The narrowed contract is percent-only — both
      // ingestion paths emit percent (SDF + LLM-PDF prompt). A 1.0 input
      // means 1%; callers that want 100% must pass 100.
      expect(resolveAgencyRecovery({ moodys: 1.0 }, ALL_AGENCIES)).toBeCloseTo(0.01, 6);
    });
  });

  describe("multi-rate inputs", () => {
    it("takes lesser: min(45, 70, 60) → 0.45", () => {
      expect(
        resolveAgencyRecovery({ moodys: 45, sp: 70, fitch: 60 }, ALL_AGENCIES),
      ).toBeCloseTo(0.45, 6);
    });

    it("two-of-three present: min(70, 30) over [moodys, fitch] → 0.30", () => {
      expect(
        resolveAgencyRecovery({ moodys: 70, sp: null, fitch: 30 }, ALL_AGENCIES),
      ).toBeCloseTo(0.30, 6);
    });

    it("zero is preserved as the minimum: min(0, 50, 60) → 0", () => {
      // Distinct from "no data" — a 0% recovery rate is a valid agency
      // value (e.g., total expected loss). Helper must NOT confuse it
      // with absent data.
      expect(
        resolveAgencyRecovery({ moodys: 0, sp: 50, fitch: 60 }, ALL_AGENCIES),
      ).toBe(0);
    });
  });

  describe("agencySubset filtering — per-deal Rating Agencies set", () => {
    // The deal's Rating Agencies subset filters out agencies that are not
    // in the indenture even when their RR data is populated upstream.
    // Closes the parallel-implementation drift between the helper's
    // generic min and the indenture's per-deal agency selection.
    it("S&P-lowest scenario: 3-agency input, FITCH+MOODYS subset drops S&P", () => {
      // Pre-fix: min(40, 20, 30) = 20 — S&P pulls the floor down.
      // Post-fix on Euro XV (Fitch + Moody's): min(40, 30) = 30.
      // Per Adjusted CPA paragraph (e) the helper takes the lesser
      // across the deal's Rating Agencies only; S&P data on a non-S&P-
      // rated indenture is not the deal's rating-agency rate and must
      // not pull the OC-numerator floor.
      expect(
        resolveAgencyRecovery({ moodys: 40, sp: 20, fitch: 30 }, FITCH_MOODYS),
      ).toBeCloseTo(0.30, 6);
    });

    it("subset narrows to single agency", () => {
      expect(
        resolveAgencyRecovery({ moodys: 50, sp: 30, fitch: 40 }, ["moodys"]),
      ).toBeCloseTo(0.50, 6);
    });
  });

  describe("mvFloor opt — per-agency floor before cross-agency min", () => {
    // Per Adjusted CPA paragraph (e), each Collateral Value is
    // `min(MV, RR_agency)` per agency BEFORE the cross-agency min.
    // The mvFloor opt applies the per-agency floor; the .map ordering
    // is load-bearing (PPM-correct vs post-min floor diverge when one
    // agency's RR sits below MV while another's sits above).
    it("mvFloor below all agency rates wins (Castle US shape)", () => {
      // par × min(min(41.4, 45)) — Castle US fixture pin.
      // Pre-fix (no mvFloor): min(45) / 100 = 0.45.
      // Post-fix (mvFloor=41.4): min(min(41.4, 45)) / 100 = 0.414.
      expect(
        resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES, { mvFloor: 41.4 }),
      ).toBeCloseTo(0.414, 6);
    });

    it("mvFloor above all agency rates is non-binding", () => {
      // mvFloor=70 > min(M=35, F=60); the floor doesn't bite — agency
      // min wins. Tele Columbus shape: M=35, F=60, MV=58.5 → result is M=35.
      expect(
        resolveAgencyRecovery({ moodys: 35, fitch: 60 }, ALL_AGENCIES, { mvFloor: 58.5 }),
      ).toBeCloseTo(0.35, 6);
    });

    it("mvFloor between agencies — per-agency framing matters", () => {
      // M=20, F=80, MV=50. Per-agency: min(M, MV) = 20, min(F, MV) = 50.
      // Cross-agency min: 20. (Same answer as post-min floor here —
      // this case doesn't expose the ordering. The next test does.)
      expect(
        resolveAgencyRecovery({ moodys: 20, fitch: 80 }, ALL_AGENCIES, { mvFloor: 50 }),
      ).toBeCloseTo(0.20, 6);
    });

    it("mvFloor changes the answer when only the high-RR agency is present", () => {
      // F=80 (only agency populated), MV=50.
      // Per-agency: min(F, MV) = 50. Without mvFloor: 80.
      expect(
        resolveAgencyRecovery({ fitch: 80 }, ALL_AGENCIES, { mvFloor: 50 }),
      ).toBeCloseTo(0.50, 6);
    });

    it("mvFloor not provided: pre-floor shape preserved", () => {
      expect(
        resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES),
      ).toBeCloseTo(0.45, 6);
    });

    it("mvFloor + subset filter compose correctly", () => {
      // S&P=10 would dominate without filter; subset drops it; then mvFloor
      // applies to remaining. M=40, F=60, MV=30 → min(min(40,30), min(60,30)) = 30.
      expect(
        resolveAgencyRecovery({ moodys: 40, sp: 10, fitch: 60 }, FITCH_MOODYS, { mvFloor: 30 }),
      ).toBeCloseTo(0.30, 6);
    });
  });

  describe("invariant violations (refuse loud)", () => {
    it("throws on NaN agency rate", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: NaN, sp: 45 }, ALL_AGENCIES),
      ).toThrow(/NaN/);
    });

    it("throws on negative agency rate", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: -5, sp: 45 }, ALL_AGENCIES),
      ).toThrow(/negative/);
    });

    it("throws on > 100 agency rate (basis-point shape mis-parse)", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 4500 }, ALL_AGENCIES),
      ).toThrow(/> 100/);
    });

    it("throws on 200 agency rate (absolute-vs-percent confusion)", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 200 }, ALL_AGENCIES),
      ).toThrow(/> 100/);
    });

    it("throws on 100.01 agency rate (just above the 100% boundary)", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 100.01 }, ALL_AGENCIES),
      ).toThrow(/> 100/);
    });

    it("does NOT throw on the 100% boundary", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 100 }, ALL_AGENCIES),
      ).not.toThrow();
    });

    it("throws on NaN mvFloor", () => {
      // mvFloor validation must happen at boundary too, otherwise NaN
      // through Math.min(rate, NaN) silently propagates and the agency-
      // rate path's NaN error message would be misleading.
      expect(() =>
        resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES, { mvFloor: NaN }),
      ).toThrow(/NaN mvFloor/);
    });

    it("throws on negative mvFloor", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES, { mvFloor: -5 }),
      ).toThrow(/negative mvFloor/);
    });

    it("throws on > 100 mvFloor (absolute-vs-percent confusion)", () => {
      expect(() =>
        resolveAgencyRecovery({ moodys: 45 }, ALL_AGENCIES, { mvFloor: 200 }),
      ).toThrow(/mvFloor 200 > 100/);
    });
  });
});
