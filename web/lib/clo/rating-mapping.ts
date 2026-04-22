export const RATING_BUCKETS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "NR"] as const;
export type RatingBucket = typeof RATING_BUCKETS[number];

// Moody's historical 1Y average default rates (values are percentages, e.g. 3.41 means 3.41%)
export const DEFAULT_RATES_BY_RATING: Record<RatingBucket, number> = {
  AAA: 0.00,
  AA: 0.02,
  A: 0.06,
  BBB: 0.18,
  BB: 1.06,
  B: 3.41,
  CCC: 10.28,
  NR: 2.00,
};

/** Moody's Rating Factor table. Each obligor's WARF contribution is
 *  parBalance × factor, summed and divided by total par.
 *  Source: Moody's Idealized Default Rates (10-year cumulative, ×10000).
 *  WR (withdrawn) / NR rows fall back to a non-investment-grade proxy. */
export const MOODYS_WARF_FACTORS: Record<string, number> = {
  aaa: 1,
  aa1: 10, aa2: 20, aa3: 40,
  a1: 70, a2: 120, a3: 180,
  baa1: 260, baa2: 360, baa3: 610,
  ba1: 940, ba2: 1350, ba3: 1766,
  b1: 2220, b2: 2720, b3: 3490,
  caa1: 4770, caa2: 6500, caa3: 8070,
  ca: 10000, c: 10000,
};

export function moodysWarfFactor(rating: string | null | undefined): number | null {
  if (!rating) return null;
  // Strip "(sf)" / "*-" / whitespace suffixes. "Ba2 (sf)" → "ba2".
  const key = rating.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/\*.*$/, "").trim();
  return MOODYS_WARF_FACTORS[key] ?? null;
}

const MOODYS_MAP: Record<string, RatingBucket> = {
  aaa: "AAA",
  aa1: "AA", aa2: "AA", aa3: "AA",
  a1: "A", a2: "A", a3: "A",
  baa1: "BBB", baa2: "BBB", baa3: "BBB",
  ba1: "BB", ba2: "BB", ba3: "BB",
  b1: "B", b2: "B", b3: "B",
  caa1: "CCC", caa2: "CCC", caa3: "CCC",
  ca: "CCC", c: "CCC",
};

const SP_FITCH_MAP: Record<string, RatingBucket> = {
  aaa: "AAA",
  "aa+": "AA", aa: "AA", "aa-": "AA",
  "a+": "A", a: "A", "a-": "A",
  "bbb+": "BBB", bbb: "BBB", "bbb-": "BBB",
  "bb+": "BB", bb: "BB", "bb-": "BB",
  "b+": "B", b: "B", "b-": "B",
  "ccc+": "CCC", ccc: "CCC", "ccc-": "CCC",
  "cc+": "CCC", cc: "CCC", "cc-": "CCC",
  c: "CCC",
};

function tryMap(rating: string | null, map: Record<string, RatingBucket>): RatingBucket | null {
  if (!rating || !rating.trim()) return null;
  return map[rating.trim().toLowerCase()] ?? null;
}

export function mapToRatingBucket(
  moodys: string | null,
  sp: string | null,
  fitch: string | null,
  composite: string | null
): RatingBucket {
  return (
    tryMap(moodys, MOODYS_MAP) ??
    tryMap(sp, SP_FITCH_MAP) ??
    tryMap(fitch, SP_FITCH_MAP) ??
    tryMap(composite, { ...MOODYS_MAP, ...SP_FITCH_MAP }) ??
    "NR"
  );
}
