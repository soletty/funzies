/**
 * Marker test for `classifyComplianceTest` and the canonicalType bijection.
 *
 * Per CLAUDE.md: every load-bearing magnitude must trace to a marker test, and
 * every marker must trace to a documented invariant. The classifier is the
 * single source of truth for compliance-test classification — it routes the
 * Moody's WARF cap, Min WAS trigger, Moody's Caa concentration, and Fitch CCC
 * concentration into the engine. A regex regression here silently disables a
 * compliance gate (over-reinvestment / wrong forward IRR) on every deal.
 *
 * The fixture-load tests (c1-reinvestment-compliance) exercise the full
 * pipeline end-to-end, but `canonicalType` is statically baked into the
 * fixture JSON. If someone regenerates the fixture after a classifier bug
 * lands, the wrong values get embedded silently. This test pins the
 * classifier directly, independent of fixture state.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyComplianceTest } from "@/lib/clo/resolver";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

describe("classifyComplianceTest — canonical mappings", () => {
  it("maps Moody's WARF test variants to moodys_max_warf", () => {
    expect(classifyComplianceTest("Moody's Maximum Weighted Average Rating Factor Test"))
      .toBe("moodys_max_warf");
    // Lower-case form (some trustees normalise)
    expect(classifyComplianceTest("moody's maximum weighted average rating factor"))
      .toBe("moodys_max_warf");
  });

  it("does NOT map Fitch WARF to moodys_max_warf", () => {
    expect(classifyComplianceTest("Fitch Maximum Weighted Average Rating Factor Test"))
      .toBe("other");
  });

  it("maps Min/Minimum WAS variants to min_was", () => {
    expect(classifyComplianceTest("Minimum Weighted Average Floating Spread Test"))
      .toBe("min_was");
    expect(classifyComplianceTest("Min Weighted Average Spread Test"))
      .toBe("min_was");
    expect(classifyComplianceTest("Minimum Weighted Average Spread"))
      .toBe("min_was");
  });

  it("does NOT map abbreviated 'WAS' rows (no 'weighted average' phrase) to min_was", () => {
    // Trustees occasionally publish supplementary rows under the abbreviation
    // 'WAS' without trigger levels. Those rows have triggerLevel=null and must
    // not shadow the canonical Min WAS row in `find(canonicalType==="min_was")`.
    expect(classifyComplianceTest("Minimum WAS excl floor incl Agg Exc Funded Spread"))
      .toBe("other");
    expect(classifyComplianceTest("Minimum WAS excl floor excl Agg Exc Funded Spread"))
      .toBe("other");
  });

  it("maps Moody's Caa Obligations variants to moodys_caa_concentration", () => {
    expect(classifyComplianceTest("Moody's Caa Obligations"))
      .toBe("moodys_caa_concentration");
    // PPM lettered form (concentrationType="n" → ct.testName has the prefix)
    expect(classifyComplianceTest("(n) Moody's Caa Obligations"))
      .toBe("moodys_caa_concentration");
  });

  it("maps Fitch CCC Obligations variants to fitch_ccc_concentration", () => {
    expect(classifyComplianceTest("Fitch CCC Obligations"))
      .toBe("fitch_ccc_concentration");
    expect(classifyComplianceTest("(o) Fitch - CCC Obligations"))
      .toBe("fitch_ccc_concentration");
  });

  it("returns 'other' for null / empty / unrelated names", () => {
    expect(classifyComplianceTest(null)).toBe("other");
    expect(classifyComplianceTest(undefined)).toBe("other");
    expect(classifyComplianceTest("")).toBe("other");
    expect(classifyComplianceTest("Class A Par Value Test")).toBe("other");
    expect(classifyComplianceTest("Senior Secured Obligations")).toBe("other");
    expect(classifyComplianceTest("Diversity Score")).toBe("other");
  });

  it("rejects single-letter input (the concentrationType-shadows-bucketName failure mode)", () => {
    // Defensive: if the resolver concentrationTests build site ever shrinks
    // its classification input back to a single-letter `bucketName` (when
    // `concentrations.bucketName` is null), the classifier must NOT silently
    // route that to a real canonical type.
    expect(classifyComplianceTest("n")).toBe("other");
    expect(classifyComplianceTest("o")).toBe("other");
  });
});

describe("Euro XV fixture — canonicalType bijection", () => {
  // Defensive against fixture regeneration drift: if the fixture is ever
  // re-serialised without running the live classifier (or after a classifier
  // bug), this test fails — preventing silently-wrong canonicalType values
  // from being baked into the snapshot.
  const fixture = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "euro-xv-q1.json"), "utf8"),
  ) as { resolved: ResolvedDealData };

  it("qualityTests carry exactly one moodys_max_warf row with trigger 3148", () => {
    const matches = fixture.resolved.qualityTests.filter(
      (t) => t.canonicalType === "moodys_max_warf",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].triggerLevel).toBe(3148);
  });

  it("qualityTests carry exactly one min_was row with trigger 3.65", () => {
    const matches = fixture.resolved.qualityTests.filter(
      (t) => t.canonicalType === "min_was",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].triggerLevel).toBe(3.65);
  });

  it("concentrationTests carry exactly one moodys_caa_concentration row with trigger 7.5", () => {
    const matches = fixture.resolved.concentrationTests.filter(
      (c) => c.canonicalType === "moodys_caa_concentration",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].triggerLevel).toBe(7.5);
  });

  it("concentrationTests carry exactly one fitch_ccc_concentration row with trigger 7.5", () => {
    const matches = fixture.resolved.concentrationTests.filter(
      (c) => c.canonicalType === "fitch_ccc_concentration",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].triggerLevel).toBe(7.5);
  });

  it("every fixture row carries a non-null canonicalType", () => {
    for (const t of fixture.resolved.qualityTests) {
      expect(t.canonicalType, `qualityTests[${t.testName}].canonicalType`).toBeDefined();
    }
    for (const c of fixture.resolved.concentrationTests) {
      expect(c.canonicalType, `concentrationTests[${c.testName}].canonicalType`).toBeDefined();
    }
  });
});
