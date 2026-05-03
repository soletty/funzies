/**
 * Pins canonical normalizer behavior across the input domains of the
 * three former implementations (intex parser CSV cells, resolver
 * extracted-class strings, api.ts LLM-extracted className strings) plus
 * the parse-notes DB-display-label shape it must round-trip through.
 *
 * If a future change to the canonical regresses any of these inputs, this
 * test catches it — the cross-source equity-collapse and the trailing-
 * "Notes" forgiveness are load-bearing for intex's CSV-to-DB tranche
 * matching on non-Euro-XV deals.
 */

import { describe, it, expect } from "vitest";
import { normalizeClassName } from "@/lib/clo/normalize-class-name";

describe("normalizeClassName (canonical)", () => {
  it("DB display-label shape (parse-notes output) → comparison key", () => {
    expect(normalizeClassName("Class A")).toBe("a");
    expect(normalizeClassName("Class A-1")).toBe("a-1");
    expect(normalizeClassName("Class A-2")).toBe("a-2");
    expect(normalizeClassName("Class B-1")).toBe("b-1");
    expect(normalizeClassName("Class C")).toBe("c");
    expect(normalizeClassName("Class F")).toBe("f");
    expect(normalizeClassName("Subordinated Notes")).toBe("sub");
    expect(normalizeClassName("Subordinated")).toBe("sub");
  });

  it("Intex CSV cell shapes (with trailing 'Notes' suffix)", () => {
    expect(normalizeClassName("Class A-1 Notes")).toBe("a-1");
    expect(normalizeClassName("Class B Notes")).toBe("b");
    expect(normalizeClassName("Class A-1 Note")).toBe("a-1");
  });

  it("Cross-source equity-flavor variance (Subordinated / Sub / Equity / Income Note all collapse)", () => {
    expect(normalizeClassName("Subordinated Notes")).toBe("sub");
    expect(normalizeClassName("Sub Notes")).toBe("sub");
    expect(normalizeClassName("Sub Loan Notes")).toBe("sub");
    expect(normalizeClassName("Sub")).toBe("sub");
    expect(normalizeClassName("Equity")).toBe("sub");
    expect(normalizeClassName("Equity Notes")).toBe("sub");
    expect(normalizeClassName("Income Note")).toBe("sub");
    expect(normalizeClassName("Income Notes")).toBe("sub");
    expect(normalizeClassName("income-note")).toBe("sub");
  });

  it("LLM-extracted shapes (free-form, with extra suffix words)", () => {
    expect(normalizeClassName("A")).toBe("a");
    expect(normalizeClassName("A-1")).toBe("a-1");
    expect(normalizeClassName("A Senior Secured FRN due 2032")).toBe("a");
    expect(normalizeClassName("B-1 Floating Rate Notes")).toBe("b-1");
  });

  it("Idempotent on canonical output", () => {
    expect(normalizeClassName(normalizeClassName("Class A-1"))).toBe("a-1");
    expect(normalizeClassName(normalizeClassName("Subordinated Notes"))).toBe("sub");
    expect(normalizeClassName(normalizeClassName("a"))).toBe("a");
    expect(normalizeClassName(normalizeClassName("sub"))).toBe("sub");
  });

  it("EOD sentinel falls through unchanged (resolver.ts:617 dependency)", () => {
    expect(normalizeClassName("EOD")).toBe("eod");
    expect(normalizeClassName("eod")).toBe("eod");
  });

  it("Empty / null-ish inputs", () => {
    expect(normalizeClassName("")).toBe("");
    expect(normalizeClassName("   ")).toBe("");
    expect(normalizeClassName(null as unknown as string)).toBe("");
    expect(normalizeClassName(undefined as unknown as string)).toBe("");
  });

  it("Letter-space-digit shapes ('B 1') normalize to dashed", () => {
    expect(normalizeClassName("B 1")).toBe("b-1");
    expect(normalizeClassName("Class B 2")).toBe("b-2");
  });

  it("Case-insensitive on input", () => {
    expect(normalizeClassName("CLASS A-1")).toBe("a-1");
    expect(normalizeClassName("class a-1")).toBe("a-1");
    expect(normalizeClassName("SUBORDINATED")).toBe("sub");
  });

  // Mezzanine / non-letter-token shapes fall through the regex match
  // (first-letter-token requires word boundary after the optional digits;
  // "Mezzanine A" has no boundary between "M" and "e", so the regex fails
  // and the function returns the stripped lowercase string verbatim).
  // Distinct mezz tranches stay distinct; cross-source variance between
  // "Mezz" abbreviation and "Mezzanine" full form is NOT bridged — if a
  // deal's PPM uses one and its SDF the other, the keys would diverge.
  // No current data exhibits this; pinning behavior so future drift is
  // caught.
  it("Mezzanine-named tranches preserve full stripped string (no regex match)", () => {
    expect(normalizeClassName("Mezzanine A")).toBe("mezzanine a");
    expect(normalizeClassName("Mezzanine B")).toBe("mezzanine b");
    expect(normalizeClassName("Class Mezzanine A")).toBe("mezzanine a");
    expect(normalizeClassName("Mezzanine A Notes")).toBe("mezzanine a");
    expect(normalizeClassName("Mezz")).toBe("mezz");
    expect(normalizeClassName("Class Mezz")).toBe("mezz");
  });
});
