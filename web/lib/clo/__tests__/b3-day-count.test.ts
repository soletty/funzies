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
import { canonicalizeDayCount } from "@/lib/clo/day-count-canonicalize";

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

  describe("30e_360 (European 30/360, ISDA §4.16(g))", () => {
    it("Any clean 3-month window = 90/360 = 0.25 exactly (matches US 30/360)", () => {
      expect(dayCountFraction("30e_360", "2026-01-15", "2026-04-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30e_360", "2026-04-15", "2026-07-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30e_360", "2026-07-15", "2026-10-15")).toBeCloseTo(0.25, 10);
      expect(dayCountFraction("30e_360", "2026-10-15", "2027-01-15")).toBeCloseTo(0.25, 10);
    });

    it("Diverges from US 30/360 when end is 31 AND start day < 30", () => {
      // 30E/360: both endpoints unconditionally cap at 30. End = 31 → 30
      // even when start day < 30. US 30/360 does NOT clamp end day in this
      // case (anchor rule requires d1 ≥ 30 to clamp d2).
      // Mar 15 → May 31: under US 30/360, d1=15, anchor not satisfied,
      // d2=31 stays at 31. Days = 0×360 + 2×30 + (31-15) = 76.
      // Under 30E/360, d1=15, d2=30. Days = 0 + 60 + (30-15) = 75.
      const us = dayCountFraction("30_360", "2026-03-15", "2026-05-31");
      const eu = dayCountFraction("30e_360", "2026-03-15", "2026-05-31");
      expect(us).toBeCloseTo(76 / 360, 10);
      expect(eu).toBeCloseTo(75 / 360, 10);
    });

    it("Year sums to exactly 1.0 across clean mid-month boundaries", () => {
      const q1 = dayCountFraction("30e_360", "2026-01-15", "2026-04-15");
      const q2 = dayCountFraction("30e_360", "2026-04-15", "2026-07-15");
      const q3 = dayCountFraction("30e_360", "2026-07-15", "2026-10-15");
      const q4 = dayCountFraction("30e_360", "2026-10-15", "2027-01-15");
      expect(q1 + q2 + q3 + q4).toBe(1);
    });
  });

  describe("actual_365", () => {
    it("Q1 2026 (90 days) = 90/365 ≈ 0.24658", () => {
      expect(dayCountFraction("actual_365", "2026-01-15", "2026-04-15")).toBeCloseTo(90 / 365, 10);
    });

    it("Full year 2026 sums to exactly 365/365 = 1.0", () => {
      const q1 = dayCountFraction("actual_365", "2026-01-15", "2026-04-15");
      const q2 = dayCountFraction("actual_365", "2026-04-15", "2026-07-15");
      const q3 = dayCountFraction("actual_365", "2026-07-15", "2026-10-15");
      const q4 = dayCountFraction("actual_365", "2026-10-15", "2027-01-15");
      expect(q1 + q2 + q3 + q4).toBe(1);
    });

    it("Leap-year Q1 2024 (91 days) = 91/365 (NOT clamped — divergence from Actual/365L is on the other side)", () => {
      // Actual/365 Fixed always uses /365, never /366 — even when the
      // period contains Feb 29. Actual/365L (leap-year-adjusted) would
      // use /366 on a period containing Feb 29; we treat Actual/365L as
      // Actual/365 (precision downgrade, see canonicalizer).
      expect(dayCountFraction("actual_365", "2024-01-15", "2024-04-15")).toBeCloseTo(91 / 365, 10);
    });
  });

  describe("canonicalizeDayCount — raw → canonical mappings", () => {
    type Row = { raw: string | null; isFixed: boolean; expConv: string; expBlocking: boolean; expWarn: boolean };
    const rows: Row[] = [
      // Recognized exact strings
      { raw: "Actual/360",          isFixed: false, expConv: "actual_360", expBlocking: false, expWarn: false },
      { raw: "ACT/360",             isFixed: false, expConv: "actual_360", expBlocking: false, expWarn: false },
      { raw: "30/360 (European)",   isFixed: true,  expConv: "30e_360",    expBlocking: false, expWarn: false },
      { raw: "30E/360",             isFixed: true,  expConv: "30e_360",    expBlocking: false, expWarn: false },
      { raw: "30E/360 (ISDA)",      isFixed: true,  expConv: "30e_360",    expBlocking: false, expWarn: false },
      { raw: "30/360",              isFixed: true,  expConv: "30_360",     expBlocking: false, expWarn: false },
      { raw: "30/360 (US)",         isFixed: true,  expConv: "30_360",     expBlocking: false, expWarn: false },
      // Truncated-paren variant — observed in the Euro XV fixture for 2 fixed-rate
      // positions ("30/360 (US"). The canonicalizer's match list covers both the
      // truncated and complete forms; this row pins the truncated path.
      { raw: "30/360 (US",          isFixed: true,  expConv: "30_360",     expBlocking: false, expWarn: false },
      { raw: "30/360 (EOM)",        isFixed: true,  expConv: "30_360",     expBlocking: false, expWarn: false },
      { raw: "Actual/365",          isFixed: false, expConv: "actual_365", expBlocking: false, expWarn: false },
      // Approximated (precision downgrade)
      { raw: "Actual/365L",         isFixed: false, expConv: "actual_365", expBlocking: false, expWarn: true },
      // Null fallback tier
      { raw: null,                  isFixed: false, expConv: "actual_360", expBlocking: false, expWarn: true },
      { raw: null,                  isFixed: true,  expConv: "actual_360", expBlocking: true,  expWarn: true },
      // Unrecognized
      { raw: "Made-Up Convention",  isFixed: false, expConv: "actual_360", expBlocking: true,  expWarn: true },
      { raw: "Made-Up Convention",  isFixed: true,  expConv: "actual_360", expBlocking: true,  expWarn: true },
    ];
    for (const r of rows) {
      it(`raw=${JSON.stringify(r.raw)} isFixed=${r.isFixed} → ${r.expConv}, blocking=${r.expBlocking}, warn=${r.expWarn}`, () => {
        const out = canonicalizeDayCount(r.raw, { isFixedRate: r.isFixed, field: "test.field" });
        expect(out.convention).toBe(r.expConv);
        expect(out.blocking).toBe(r.expBlocking);
        expect(out.warning != null).toBe(r.expWarn);
      });
    }

    it("Case-insensitive on input", () => {
      expect(canonicalizeDayCount("ACTUAL/360", { isFixedRate: false, field: "f" }).convention).toBe("actual_360");
      expect(canonicalizeDayCount("30e/360 (isda)", { isFixedRate: true, field: "f" }).convention).toBe("30e_360");
    });

    it("Whitespace-tolerant on input", () => {
      expect(canonicalizeDayCount("  30/360 (European)  ", { isFixedRate: true, field: "f" }).convention).toBe("30e_360");
    });
  });
});
