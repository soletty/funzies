/**
 * E1 (Sprint 5) — PPM citation propagation tests.
 *
 * Verifies that PPM provenance metadata (`source_pages`, `source_condition`)
 * flows from the extracted constraints through the resolver and onto the
 * partner-facing `Citation` shape on `ResolvedPool`, `ResolvedFees`, and
 * `ResolvedEodTest`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

// Re-implement the helper here for direct testing — keeps the resolver's
// internal helper unexported (no API surface bloat) while still asserting
// the contract.
function extractCitation(
  source: { source_pages?: number[] | null; source_condition?: string | null } | null | undefined,
): { sourcePages: number[] | null; sourceCondition: string | null } | null {
  if (!source) return null;
  const pages = source.source_pages ?? null;
  const cond = source.source_condition ?? null;
  if ((pages == null || pages.length === 0) && cond == null) return null;
  return { sourcePages: pages, sourceCondition: cond };
}

describe("E1 — extractCitation helper", () => {
  it("returns null for null/undefined source", () => {
    expect(extractCitation(null)).toBeNull();
    expect(extractCitation(undefined)).toBeNull();
  });

  it("returns null when both source_pages and source_condition are null/empty", () => {
    expect(extractCitation({})).toBeNull();
    expect(extractCitation({ source_pages: null, source_condition: null })).toBeNull();
    expect(extractCitation({ source_pages: [], source_condition: null })).toBeNull();
  });

  it("returns populated citation when only source_pages set", () => {
    const c = extractCitation({ source_pages: [22, 23, 146] });
    expect(c).toEqual({ sourcePages: [22, 23, 146], sourceCondition: null });
  });

  it("returns populated citation when only source_condition set", () => {
    const c = extractCitation({ source_condition: "Condition 10(a)(iv)" });
    expect(c).toEqual({ sourcePages: null, sourceCondition: "Condition 10(a)(iv)" });
  });

  it("returns populated citation when both fields set", () => {
    const c = extractCitation({ source_pages: [207, 208], source_condition: "OC Condition 10(a)(iv)" });
    expect(c).toEqual({ sourcePages: [207, 208], sourceCondition: "OC Condition 10(a)(iv)" });
  });
});

describe("E1 — resolver propagates citations from constraints", () => {
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

  it("poolSummary.citation is non-null with section-8 pages", () => {
    const c = resolved.poolSummary.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([23, 27, 287, 295]);
    expect(c!.sourceCondition).toBeNull();
  });

  it("fees.citation is non-null with section-5 pages", () => {
    const c = resolved.fees.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([22, 23, 146]);
    expect(c!.sourceCondition).toBeNull();
  });

  it("eventOfDefaultTest.citation captures both pages and condition", () => {
    expect(resolved.eventOfDefaultTest).not.toBeNull();
    const c = resolved.eventOfDefaultTest!.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([207, 208]);
    expect(c!.sourceCondition).toBe("OC Condition 10(a)(iv)");
  });

  it("citation matches what the underlying constraint extraction carries", () => {
    // Round-trip: the resolver-computed citation values mirror what the
    // PPM extraction stored on the raw constraints.
    const eod = raw.constraints.eventOfDefaultParValueTest;
    expect(resolved.eventOfDefaultTest!.citation!.sourcePages).toEqual(eod.source_pages);
    expect(resolved.eventOfDefaultTest!.citation!.sourceCondition).toBe(eod.source_condition);

    const feesProv = raw.constraints._feesProvenance;
    expect(resolved.fees.citation!.sourcePages).toEqual(feesProv.source_pages);

    const poolProv = raw.constraints._poolProvenance;
    expect(resolved.poolSummary.citation!.sourcePages).toEqual(poolProv.source_pages);
  });

  it("dates.citation is non-null with section-2 pages", () => {
    const c = resolved.dates.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([18, 19, 20, 21, 22]);
    expect(c!.sourceCondition).toBeNull();
  });

  it("tranchesCitation is non-null with section-3 pages", () => {
    const c = resolved.tranchesCitation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([18]);
    expect(c!.sourceCondition).toBeNull();
  });

  it("ocTriggers and icTriggers each carry the broadcast section-4 citation", () => {
    expect(resolved.ocTriggers.length).toBeGreaterThan(0);
    for (const t of resolved.ocTriggers) {
      expect(t.citation).not.toBeNull();
      expect(t.citation).toBeDefined();
      expect(t.citation!.sourcePages).toEqual([28, 207, 208]);
    }
    expect(resolved.icTriggers.length).toBeGreaterThan(0);
    for (const t of resolved.icTriggers) {
      expect(t.citation).not.toBeNull();
      expect(t.citation).toBeDefined();
      expect(t.citation!.sourcePages).toEqual([28, 207, 208]);
    }
  });

  it("reinvestmentOcTrigger.citation broadcasts the section-4 pages", () => {
    // Assert non-null up front so this test can't pass vacuously on a fixture
    // where the trigger happens to be absent.
    expect(resolved.reinvestmentOcTrigger).not.toBeNull();
    const c = resolved.reinvestmentOcTrigger!.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([28, 207, 208]);
    expect(c!.sourceCondition).toBeNull();
  });

  it("seniorExpensesCap.citation carries section-5 cap pages + condition", () => {
    // Pre-existing E1 surface (Sprint 5 wiring); this test closes the
    // bijection gap — every named citation surface gets its own assertion,
    // not just the recursive full-equality walk in fixture-regeneration.
    expect(resolved.seniorExpensesCap).not.toBeNull();
    const c = resolved.seniorExpensesCap!.citation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([150, 151]);
    expect(c!.sourceCondition).toBe("Condition 1 (Senior Expenses Cap)");
  });

  it("waterfallCitation captures section-6 pages + condition", () => {
    const c = resolved.waterfallCitation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toEqual([176, 179]);
    expect(c!.sourceCondition).toBe("OC Condition 3(c)");
  });

  it("waterfallPostAccelCitation is condition-only (no pages on this sub-block)", () => {
    const c = resolved.waterfallPostAccelCitation;
    expect(c).not.toBeNull();
    expect(c).toBeDefined();
    expect(c!.sourcePages).toBeNull();
    expect(c!.sourceCondition).toBe("OC Condition 10");
  });
});

describe("E1 — resolver returns null citation when provenance absent", () => {
  it("citations are null when constraints lack their provenance markers", () => {
    const rawNoProv = { ...fixture.raw };
    rawNoProv.constraints = { ...fixture.raw.constraints };
    delete (rawNoProv.constraints as Record<string, unknown>)._poolProvenance;
    delete (rawNoProv.constraints as Record<string, unknown>)._feesProvenance;
    delete (rawNoProv.constraints as Record<string, unknown>)._tranchesProvenance;
    delete (rawNoProv.constraints as Record<string, unknown>)._triggersProvenance;
    rawNoProv.constraints.keyDates = { ...rawNoProv.constraints.keyDates };
    delete (rawNoProv.constraints.keyDates as Record<string, unknown>)._datesProvenance;
    rawNoProv.constraints.waterfall = { ...rawNoProv.constraints.waterfall };
    delete (rawNoProv.constraints.waterfall as Record<string, unknown>)._waterfallProvenance;
    delete (rawNoProv.constraints.waterfall as Record<string, unknown>)._waterfallPostAccelProvenance;
    rawNoProv.constraints.eventOfDefaultParValueTest = { ...rawNoProv.constraints.eventOfDefaultParValueTest };
    delete (rawNoProv.constraints.eventOfDefaultParValueTest as Record<string, unknown>).source_pages;
    delete (rawNoProv.constraints.eventOfDefaultParValueTest as Record<string, unknown>).source_condition;
    rawNoProv.constraints.seniorExpensesCap = { ...rawNoProv.constraints.seniorExpensesCap };
    delete (rawNoProv.constraints.seniorExpensesCap as Record<string, unknown>).sourcePages;
    delete (rawNoProv.constraints.seniorExpensesCap as Record<string, unknown>).sourceCondition;
    const { resolved } = resolveWaterfallInputs(
      rawNoProv.constraints,
      rawNoProv.complianceData,
      rawNoProv.tranches,
      rawNoProv.trancheSnapshots,
      rawNoProv.holdings,
      rawNoProv.dealDates,
      rawNoProv.accountBalances,
      rawNoProv.parValueAdjustments,
    );
    expect(resolved.poolSummary.citation).toBeNull();
    expect(resolved.fees.citation).toBeNull();
    expect(resolved.dates.citation).toBeNull();
    expect(resolved.tranchesCitation).toBeNull();
    expect(resolved.waterfallCitation).toBeNull();
    expect(resolved.waterfallPostAccelCitation).toBeNull();
    if (resolved.eventOfDefaultTest != null) {
      expect(resolved.eventOfDefaultTest.citation).toBeNull();
    }
    if (resolved.seniorExpensesCap != null) {
      expect(resolved.seniorExpensesCap.citation).toBeNull();
    }
    for (const t of resolved.ocTriggers) {
      expect(t.citation).toBeNull();
    }
    for (const t of resolved.icTriggers) {
      expect(t.citation).toBeNull();
    }
    if (resolved.reinvestmentOcTrigger != null) {
      expect(resolved.reinvestmentOcTrigger.citation).toBeNull();
    }
  });
});
