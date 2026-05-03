/**
 * Direct unit tests for `lib/clo/test-direction.ts` `isHigherBetter`.
 *
 * The helper is consumed by both `sdf/parse-test-results.ts` (cushion polarity)
 * and `ingestion-gate.ts` (isPassing dispatch). These tests exercise its four
 * resolution paths in isolation: explicit testType, name pattern, clause-letter
 * lookup, and the unknown-fallback contract.
 */

import { describe, it, expect } from "vitest";
import { isHigherBetter } from "../test-direction";

describe("isHigherBetter", () => {
  describe("explicit testType", () => {
    it.each([
      ["OC_PAR", true],
      ["OC_MV", true],
      ["IC", true],
      ["INTEREST_DIVERSION", true],
      ["RECOVERY", true],
      ["DIVERSITY", true],
      ["WAS", true],
      ["WARF", false],
      ["WAL", false],
    ] as const)("%s → %s", (testType, expected) => {
      expect(isHigherBetter(testType, "")).toBe(expected);
    });

    it("case-insensitive: lowercase testType resolves the same as uppercase", () => {
      expect(isHigherBetter("warf", "WARF Test")).toBe(false);
      expect(isHigherBetter("oc_par", "OC A")).toBe(true);
    });
  });

  describe("name pattern (when testType is generic or null)", () => {
    it("'Minimum' in name → higher", () => {
      expect(isHigherBetter("CONCENTRATION", "Minimum Senior Secured Loans")).toBe(true);
      expect(isHigherBetter(null, "Minimum WAS")).toBe(true);
    });

    it("'Maximum' in name → lower", () => {
      expect(isHigherBetter("CONCENTRATION", "Maximum Obligor Concentration Test")).toBe(false);
      expect(isHigherBetter(null, "Maximum Single Industry")).toBe(false);
    });

    it("word-bounded: 'Mining' does NOT match 'Min'", () => {
      // Without word boundaries this would false-positive to higher.
      expect(isHigherBetter("ELIGIBILITY", "Mining Sector Concentration")).toBeNull();
    });

    it("word-bounded: 'Maximally' does NOT match 'Max'", () => {
      expect(isHigherBetter("ELIGIBILITY", "Maximally Diversified Pool")).toBeNull();
    });

    it("case-insensitive: lowercase 'minimum' / uppercase 'MAXIMUM' resolve like title case", () => {
      // Pins the /i flag on the name-pattern regex so a future drift back
      // to case-sensitive matching fails here rather than silently on a
      // different deal whose SDF emits non-title-case test names.
      expect(isHigherBetter(null, "minimum WAS")).toBe(true);
      expect(isHigherBetter(null, "MAXIMUM Single Industry")).toBe(false);
      expect(isHigherBetter(null, "MiNiMuM Senior Secured")).toBe(true);
    });
  });

  describe("clause-letter lookup", () => {
    it("clause (a): senior-secured minimum → higher", () => {
      expect(isHigherBetter("CONCENTRATION", "(a) Senior Secured Obligations")).toBe(true);
    });

    it("clause (b): senior-secured-loans minimum → higher", () => {
      expect(isHigherBetter("CONCENTRATION", "(b) Senior Secured Loans")).toBe(true);
    });

    it("clause (n): Caa concentration maximum → lower", () => {
      expect(isHigherBetter("CONCENTRATION", "(n) Moody's Caa Obligations")).toBe(false);
    });

    it("clause (s): Top 10 obligors maximum → lower", () => {
      expect(isHigherBetter("CONCENTRATION", "(s) Top 10 Obligors")).toBe(false);
    });

    it("clause (z): counterparty-exposure eligibility maximum → lower", () => {
      expect(isHigherBetter("ELIGIBILITY", "(z) Moodys Aggregate Third Party Credit Exposure Rated A1")).toBe(false);
    });

    it("clause (aa) double-letter: lower (concentration maximum)", () => {
      expect(isHigherBetter("CONCENTRATION", "(aa) Annual Obligations")).toBe(false);
    });

    it("case-insensitive: uppercase clause letter resolves like lowercase", () => {
      // Pins the /i flag on the clause-letter regex AND the .toLowerCase()
      // normalization before the KNOWN_CLAUSE_LETTERS / HIGHER_IS_BETTER_
      // CLAUSE_LETTERS lookups. A drift back to case-sensitive matching
      // (or dropping the lowercase) silently classifies "(A)" / "(N)" as
      // null-direction on the next deal whose SDF emits uppercase letters.
      expect(isHigherBetter("CONCENTRATION", "(A) Senior Secured Obligations")).toBe(true);
      expect(isHigherBetter("CONCENTRATION", "(N) Caa Obligations")).toBe(false);
      expect(isHigherBetter("CONCENTRATION", "(AA) Annual Obligations")).toBe(false);
    });
  });

  describe("unknown direction (the contract that prevents silent fallback)", () => {
    it("unknown testType + name without pattern + no clause prefix → null", () => {
      expect(isHigherBetter("ELIGIBILITY", "Counterparty Rating Event")).toBeNull();
      expect(isHigherBetter(null, "Some Custom Test")).toBeNull();
      expect(isHigherBetter("FOO_TYPE", "Unrecognized")).toBeNull();
    });

    it("clause prefix not in CLAUSE_MAP → null (does not silently classify)", () => {
      // Clause "(zz)" doesn't exist in PPM and isn't in our CLAUSE_MAP.
      expect(isHigherBetter("CONCENTRATION", "(zz) Hypothetical Test")).toBeNull();
    });
  });

});
