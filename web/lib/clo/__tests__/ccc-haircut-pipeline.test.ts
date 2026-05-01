/**
 * End-to-end test for the CCC haircut parameter pipeline:
 *
 *   PPM JSON.section_4_coverage_tests.excess_ccc_adjustment
 *     → mapPpm (ppm-mapper.ts)                      [snake_case → camelCase]
 *     → normalizePpmSectionResults (normalizer.ts)  [PpmSections → ExtractedConstraints]
 *     → resolveCccThresholds (resolver.ts)          [parseFloat strings → ResolvedDealData]
 *     → defaultsFromResolved (build-projection-inputs.ts)
 *                                                    [ResolvedDealData → UserAssumptions]
 *
 * Gap this fills: the existing portability test (`projection-advanced.test.ts`)
 * runs synthetic `ProjectionInputs` directly and bypasses the resolver. The
 * blocking-gate tests (`ki58-blocking-extraction-failures.test.ts`) verify
 * refuse-to-run on missing input but stop short of the engine. Neither
 * exercises the field-orientation invariants of the mapper / resolver chain.
 *
 * Two distinct values (17.5 ≠ 60, distinct from the global default 7.5/70)
 * make swap detection mechanical: a copy-paste bug at any layer that
 * assigned `threshold_pct` to `marketValuePct` (or vice versa) flips the
 * pinned numbers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapPpm } from "../extraction/json-ingest/ppm-mapper";
import { normalizePpmSectionResults } from "../extraction/normalizer";
import { resolveWaterfallInputs } from "../resolver";
import { defaultsFromResolved } from "../build-projection-inputs";
import type { ExtractedConstraints } from "../types";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const PPM_PATH = join(REPO_ROOT, "ppm.json");

function loadPpmWithCccOverride(threshold: number, marketValue: number): Parameters<typeof mapPpm>[0] {
  const ppm = JSON.parse(readFileSync(PPM_PATH, "utf8"));
  // Deep-clone the touched section to avoid mutating the parsed object across
  // test cases. Real ppm.json is the source of truth for schema shape; this
  // test only diverges on the CCC values to make swap detection mechanical.
  ppm.section_4_coverage_tests = {
    ...ppm.section_4_coverage_tests,
    excess_ccc_adjustment: { threshold_pct: threshold, market_value_pct: marketValue },
  };
  return ppm;
}

describe("CCC haircut params end-to-end (PPM JSON → defaultsFromResolved)", () => {
  it("preserves field orientation across mapper, resolver, and defaults layers", () => {
    // Distinct values: threshold=17.5, marketValue=60. A swap at any layer
    // would surface as one or both fields landing in the wrong slot.
    const ppm = loadPpmWithCccOverride(17.5, 60);
    const sections = mapPpm(ppm);
    const constraints = normalizePpmSectionResults(sections) as ExtractedConstraints;

    // Mapper layer — values are stringified per the project-wide convention
    // for this field, but field orientation must be preserved.
    expect(constraints.excessCccAdjustment).toEqual({
      thresholdPct: "17.5",
      marketValuePct: "60",
    });

    // Resolver layer — parseFloat to numbers, no swap.
    const { resolved } = resolveWaterfallInputs(
      constraints,
      null,
      [],
      [],
      [],
    );
    expect(resolved.cccBucketLimitPct).toBe(17.5);
    expect(resolved.cccMarketValuePct).toBe(60);

    // defaultsFromResolved layer — overrides DEFAULT_ASSUMPTIONS with the
    // per-deal values from resolved. The UserAssumptions returned here is
    // what `buildFromResolved` reads when constructing `ProjectionInputs`,
    // and the engine reads inputs.cccBucketLimitPct/cccMarketValuePct
    // directly (projection.ts:2112-2123). No further transformation.
    const userAssumptions = defaultsFromResolved(resolved, null);
    expect(userAssumptions.cccBucketLimitPct).toBe(17.5);
    expect(userAssumptions.cccMarketValuePct).toBe(60);
  });

  it("atomic resolver return: half-good extraction (one parses, one doesn't) returns both null", () => {
    // The resolver's outer-nullable inner-required contract: if either
    // field is unparseable the whole pair is null, even if the other parses
    // cleanly. This prevents downstream callers from consuming a hybrid
    // (per-deal threshold × global market-value floor, or vice versa) if
    // the gate is ever bypassed or refactored.
    const constraints = {
      excessCccAdjustment: { thresholdPct: "17.5", marketValuePct: "abc" },
    } as ExtractedConstraints;

    const { resolved, warnings } = resolveWaterfallInputs(
      constraints,
      null,
      [],
      [],
      [],
    );

    // Both fields null despite thresholdPct parsing fine — atomicity
    // protects the inner-required invariant at the type level.
    expect(resolved.cccBucketLimitPct).toBeNull();
    expect(resolved.cccMarketValuePct).toBeNull();

    // Per-field blocking warning still fires for the unparseable side.
    const w = warnings.find((w) => w.field === "cccMarketValuePct" && w.blocking === true);
    expect(w).toBeDefined();
  });
});
