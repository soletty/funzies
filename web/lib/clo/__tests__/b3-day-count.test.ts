/**
 * B3 — Day-count precision per tranche.
 *
 * PPM Condition 1 (verified via `ppm.json` grep): "Day count (Actual/360
 * floating, 30/360 fixed)". PPM worked example: €310M × 2.966% × (90/360) =
 * €2,298,650 on the 15-Apr-2026 Class A payment — confirms 90-day Q1
 * coefficient is 1/4 exactly under Actual/360.
 *
 * These tests are first-principles arithmetic on `dayCountFraction`. They
 * DO NOT go through `runProjection` — the N1 harness's period-mismatch
 * (KI-12a) means engine `periods[0]` is Q2 2026 (91 days), not Q1 (90 days),
 * so asserting Class A = €2,298,650 against `runProjection(...).periods[0]`
 * would not work. The correctness of B3's arithmetic is validated here;
 * harness-side drift is tracked as six KI-12b markers in n1-correctness.
 */

import { describe, it, expect } from "vitest";
import { dayCountFraction } from "@/lib/clo/projection";

describe("B3 — dayCountFraction (first-principles)", () => {
  describe("actual/360", () => {
    it("Q1 2026 (Jan 15 → Apr 15) = 90/360 = 0.25 exactly", () => {
      expect(dayCountFraction("actual_360", "2026-01-15", "2026-04-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("actual_360", "2026-01-15", "2026-04-15")).toBeCloseTo(90 / 360, 10);
    });

    it("Q2 2026 (Apr 15 → Jul 15) = 91/360 (NOT 1/4 — May has 31 days)", () => {
      expect(dayCountFraction("actual_360", "2026-04-15", "2026-07-15")).toBeCloseTo(91 / 360, 10);
      expect(dayCountFraction("actual_360", "2026-04-15", "2026-07-15")).not.toBeCloseTo(0.25, 5);
    });

    it("Q3 2026 (Jul 15 → Oct 15) = 92/360 (Jul and Aug are 31 days)", () => {
      expect(dayCountFraction("actual_360", "2026-07-15", "2026-10-15")).toBeCloseTo(92 / 360, 10);
    });

    it("Q4 2026 (Oct 15 → Jan 15 2027) = 92/360", () => {
      expect(dayCountFraction("actual_360", "2026-10-15", "2027-01-15")).toBeCloseTo(92 / 360, 10);
    });

    it("Full year 2026 sums to 365/360 (not 360/360)", () => {
      // 90 + 91 + 92 + 92 = 365
      const q1 = dayCountFraction("actual_360", "2026-01-15", "2026-04-15");
      const q2 = dayCountFraction("actual_360", "2026-04-15", "2026-07-15");
      const q3 = dayCountFraction("actual_360", "2026-07-15", "2026-10-15");
      const q4 = dayCountFraction("actual_360", "2026-10-15", "2027-01-15");
      expect(q1 + q2 + q3 + q4).toBeCloseTo(365 / 360, 10);
    });

    it("Leap year Q1 (Jan 15 2024 → Apr 15 2024) = 91/360 (Feb 2024 has 29 days)", () => {
      expect(dayCountFraction("actual_360", "2024-01-15", "2024-04-15")).toBeCloseTo(91 / 360, 10);
    });

    it("PPM worked example: 310M × 2.966% × dayCountFraction(Jan 15 → Apr 15) = €2,298,650", () => {
      // PPM page-level tie-out, captured verbatim in ppm.json section 9.
      const principal = 310_000_000;
      const rate = 0.02966;
      const dayFrac = dayCountFraction("actual_360", "2026-01-15", "2026-04-15");
      expect(principal * rate * dayFrac).toBeCloseTo(2_298_650, 0);
    });
  });

  describe("30/360", () => {
    it("Any clean 3-month window = 90/360 = 0.25 exactly", () => {
      expect(dayCountFraction("30_360", "2026-01-15", "2026-04-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30_360", "2026-04-15", "2026-07-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30_360", "2026-07-15", "2026-10-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30_360", "2026-10-15", "2027-01-15")).toBeCloseTo(0.25, 10);
    });

    it("Month-end edge case: Jan 31 → Feb 28 clamps to 30-day months", () => {
      // US 30/360: if start day is 31, treat as 30. Jan 31 → Feb 28 ≈ (30-30)/360 + 1 month = 30/360.
      // More precisely: d1=30, d2=28, days = 0 + 30 + (28-30) = 28 (Feb's 28)
      expect(dayCountFraction("30_360", "2026-01-31", "2026-02-28")).toBeCloseTo(28 / 360, 10);
    });

    it("30/360 is invariant across all four quarters of 2026 (all = 0.25)", () => {
      // The defining feature of 30/360 for fixed-rate instruments: uniform
      // quarterly accrual regardless of actual calendar days. Under Actual/360,
      // Q1/Q2/Q3/Q4 of 2026 are 90/91/92/92 days respectively; under 30/360
      // they all compute to exactly 0.25.
      const q1 = dayCountFraction("30_360", "2026-01-15", "2026-04-15");
      const q2 = dayCountFraction("30_360", "2026-04-15", "2026-07-15");
      const q3 = dayCountFraction("30_360", "2026-07-15", "2026-10-15");
      const q4 = dayCountFraction("30_360", "2026-10-15", "2027-01-15");
      expect(q1).toBe(0.25);
      expect(q2).toBe(0.25);
      expect(q3).toBe(0.25);
      expect(q4).toBe(0.25);
      // Year sum: exactly 1.0 under 30/360 (vs 365/360 under Actual/360).
      expect(q1 + q2 + q3 + q4).toBe(1);
    });

    it("30/360 is invariant across leap-year Q1 too (Feb 29 absorbed)", () => {
      // Under Actual/360, Q1 2024 is 91/360 because Feb 2024 has 29 days.
      // Under 30/360, same window computes to exactly 0.25 (leap-year-neutral).
      expect(dayCountFraction("30_360", "2024-01-15", "2024-04-15")).toBe(0.25);
    });
  });

  describe("convention divergence — the heart of KI-12b", () => {
    it("Q1 2026 is the coincidence that masks B3 / KI-12a interaction", () => {
      // 90/360 = 1/4 exactly. Engine's pre-B3 `/4` shortcut equals Actual/360
      // on this specific 90-day quarter, so Class A/B/C/D/E/F interest ties
      // out coincidentally even though the harness is structurally mismatched
      // (KI-12a interpretation-B). Once B3 ships and /4 is replaced by
      // `dayCountFraction`, Q2 (91 days) diverges from /4 (0.25):
      const q1Actual = dayCountFraction("actual_360", "2026-01-15", "2026-04-15");
      const q2Actual = dayCountFraction("actual_360", "2026-04-15", "2026-07-15");
      expect(q1Actual).toBe(0.25); // coincidence
      expect(q2Actual).toBeGreaterThan(0.25); // divergence appears
      expect(q2Actual - 0.25).toBeCloseTo(1 / 360, 10); // exactly one day more
    });
  });
});
