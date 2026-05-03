// Shared clause-letter inventory consumed by the SDF row classifier and
// the test-direction taxonomy. Adding a new clause requires two edits
// (this set + the SDF-vocabulary mapping in `parse-test-results.ts`'s
// `CLAUSE_MAP`); the bijection between them is asserted by
// `__tests__/clause-letters.test.ts` so drift fails in CI rather than
// silently classifying the new clause as null-direction.

// Every PPM clause letter the SDF parser can classify. Lowercase form;
// callers must lowercase before lookup.
export const KNOWN_CLAUSE_LETTERS: ReadonlySet<string> = new Set([
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "aa", "bb", "cc", "dd",
]);

// Subset whose PPM polarity is higher-is-better (senior-secured minimums
// per the Ares Euro XV PPM section 8 schedule). All other entries in
// KNOWN_CLAUSE_LETTERS are concentration / eligibility maximums.
// Clause-letter direction is NOT standardized across CLO indentures —
// the eventual fix is per-deal extraction; until then, the name-pattern
// check in `isHigherBetter` (which fires before clause-letter dispatch)
// contains the blast radius for deals whose tests carry "Minimum" /
// "Maximum" keywords regardless of clause letter.
export const HIGHER_IS_BETTER_CLAUSE_LETTERS: ReadonlySet<string> = new Set([
  "a", "b",
]);
