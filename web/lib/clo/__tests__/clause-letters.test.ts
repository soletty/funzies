/**
 * Bijection between the SDF parser's `CLAUSE_MAP` and the shared
 * `KNOWN_CLAUSE_LETTERS` inventory consumed by `test-direction.ts`.
 *
 * The two pieces are physically separated (CLAUSE_MAP holds SDF
 * vocabulary; the shared set holds just the keys for direction
 * classification) but their key-set must stay aligned — adding a clause
 * to one without adding it to the other silently classifies the new
 * clause as null-direction, which leaks past the ingestion gate as a
 * partner-visible PASS/FAIL signal gap.
 *
 * Also pins the higher-is-better subset against the SDF-shape map: any
 * letter flagged higher-is-better must exist in CLAUSE_MAP (otherwise
 * the dispatch in `isHigherBetter` is unreachable).
 */

import { describe, it, expect } from "vitest";
import {
  KNOWN_CLAUSE_LETTERS,
  HIGHER_IS_BETTER_CLAUSE_LETTERS,
} from "../clause-letters";
import { CLAUSE_MAP } from "../sdf/parse-test-results";

describe("clause-letter inventory bijection", () => {
  it("KNOWN_CLAUSE_LETTERS exactly matches CLAUSE_MAP keys", () => {
    const mapKeys = new Set(Object.keys(CLAUSE_MAP));
    const sharedKeys = new Set(KNOWN_CLAUSE_LETTERS);

    const inMapNotShared = [...mapKeys].filter(k => !sharedKeys.has(k));
    const inSharedNotMap = [...sharedKeys].filter(k => !mapKeys.has(k));

    expect(inMapNotShared, "CLAUSE_MAP has keys missing from KNOWN_CLAUSE_LETTERS").toEqual([]);
    expect(inSharedNotMap, "KNOWN_CLAUSE_LETTERS has keys missing from CLAUSE_MAP").toEqual([]);
  });

  it("HIGHER_IS_BETTER_CLAUSE_LETTERS is a subset of CLAUSE_MAP keys", () => {
    const mapKeys = new Set(Object.keys(CLAUSE_MAP));
    for (const k of HIGHER_IS_BETTER_CLAUSE_LETTERS) {
      expect(mapKeys.has(k), `Higher-is-better clause "${k}" not in CLAUSE_MAP`).toBe(true);
    }
  });
});
