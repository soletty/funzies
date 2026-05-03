// Compliance-test direction taxonomy. Single source of truth for the
// higher-is-better vs lower-is-better axis, consumed by the SDF parser
// (cushion polarity) and the ingestion gate (isPassing dispatch). The
// SDF-vocabulary `CLAUSE_MAP` lives in `sdf/parse-test-results.ts` and
// is intentionally NOT re-exported from here — `test-direction.ts` is
// the direction-axis module and must not also be the SDF row-shape
// supplier (avoids the reverse-coupling shape). The clause-letter
// inventory is shared between this module and the SDF parser via
// `clause-letters.ts` so adding a new clause is a single edit there.

import { HIGHER_IS_BETTER_CLAUSE_LETTERS, KNOWN_CLAUSE_LETTERS } from "./clause-letters";

/**
 * Classify a compliance test's direction.
 *
 * Returns:
 *   true  — pass when actual >= trigger (OC ratios, IC, WAS, recovery rates,
 *           diversity, INTEREST_DIVERSION reinvestment-OC).
 *   false — pass when actual <= trigger (WARF, WAL, concentration / eligibility
 *           maximums).
 *   null  — direction cannot be determined. Caller MUST NOT silently default;
 *           leave isPassing unset and let downstream surface the gap.
 *
 * Resolution order:
 *   1. Explicit testType (case-folded): OC_PAR / OC_MV / IC / INTEREST_DIVERSION
 *      / RECOVERY / DIVERSITY / WAS → higher; WARF / WAL → lower.
 *   2. Name pattern (case-insensitive): "Minimum"/"Min" → higher;
 *      "Maximum"/"Max" → lower (word-bounded so "Mining" / "Maximally"
 *      don't false-positive).
 *   3. Clause-letter prefix (case-insensitive) in KNOWN_CLAUSE_LETTERS:
 *      letters in HIGHER_IS_BETTER_CLAUSE_LETTERS → higher (PPM senior-
 *      secured minimums); other known clauses → lower (concentration /
 *      eligibility maximums).
 *   4. Otherwise null.
 */
export function isHigherBetter(testType: string | null, testName: string | null): boolean | null {
  const upperType = testType?.toUpperCase() ?? null;
  if (
    upperType === "OC_PAR" ||
    upperType === "OC_MV" ||
    upperType === "IC" ||
    upperType === "INTEREST_DIVERSION" ||
    upperType === "RECOVERY" ||
    upperType === "DIVERSITY" ||
    upperType === "WAS"
  ) {
    return true;
  }
  if (upperType === "WARF" || upperType === "WAL") return false;

  const name = testName ?? "";
  if (/\b(Minimum|Min)\b/i.test(name)) return true;
  if (/\b(Maximum|Max)\b/i.test(name)) return false;

  const clauseMatch = name.match(/^\(([a-z]{1,2})\)/i);
  if (clauseMatch) {
    const clause = clauseMatch[1].toLowerCase();
    if (HIGHER_IS_BETTER_CLAUSE_LETTERS.has(clause)) return true;
    if (KNOWN_CLAUSE_LETTERS.has(clause)) return false;
  }

  return null;
}
