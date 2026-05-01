/**
 * Canonical rank-assignment rule for CLO tranches.
 *
 * Pari-passu tranches (split A-1/A-2 senior, split B-1/B-2 mezz, etc.) share
 * waterfall priority. The engine groups by equal `seniorityRank` for pari-passu
 * absorption (projection.ts), so the resolver and the extraction write sites
 * must produce equal ranks for tranches that share a letter-bucket — otherwise
 * the engine pays B-1 to exhaustion before B-2 instead of splitting the
 * shortfall pro-rata, and OC/IC bucketing can diverge silently on future deals.
 *
 * Rule: bucket each tranche by structural class-letter prefix
 * (Class X = 0, A = 1, ..., F = 6, subordinated/equity/income = 100, unknown
 * = 50), sort unique buckets, densify to 1-based contiguous integers. Tranches
 * sharing a bucket share a rank.
 *
 * Single source of truth — both the resolver PPM-derived path and the two DB
 * write sites (`extraction/persist-ppm.ts`, `extraction/runner.ts`) consume
 * `assignDenseSeniorityRanks` so they cannot drift.
 */

// Word-boundary at start only (not end) so "Subordinated Notes" matches via
// the "sub" prefix. The pre-helper inline regex used substring `includes`
// for the same reason; tightening to `\b…\b` would silently mis-bucket any
// tranche named "Subordinated …" (or "Income Notes", etc.) at the alphabetic
// letter rank instead of the sub-bucket.
const SUB_PATTERN = /\b(sub|equity|income|residual)/i;

export function classOrderBucket(
  className: string | null | undefined,
  isSubordinated?: boolean | null,
): number {
  const name = (className ?? "").replace(/^class\s+/i, "").trim().toLowerCase();
  if (/^x$/.test(name)) return 0;
  if (isSubordinated || SUB_PATTERN.test(name)) return 100;
  const letter = name.match(/^([a-z])/)?.[1];
  if (letter) return letter.charCodeAt(0) - 96;
  return 50;
}

export function assignDenseSeniorityRanks(
  entries: ReadonlyArray<{ className: string | null | undefined; isSubordinated?: boolean | null }>,
): number[] {
  const buckets = entries.map((e) => classOrderBucket(e.className, e.isSubordinated));
  const uniqueSorted = Array.from(new Set(buckets)).sort((a, b) => a - b);
  const bucketToRank = new Map<number, number>();
  uniqueSorted.forEach((b, i) => bucketToRank.set(b, i + 1));
  return buckets.map((b) => bucketToRank.get(b)!);
}
