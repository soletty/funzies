import { describe, it, expect } from "vitest";
import {
  mapToRatingBucket,
  DEFAULT_RATES_BY_RATING,
  RATING_BUCKETS,
  stripRatingSuffixes,
  moodysWarfFactor,
  isMoodysCaaOrBelow,
  isFitchCccOrBelow,
} from "../rating-mapping";

describe("mapToRatingBucket", () => {
  it("maps Moody's ratings to buckets", () => {
    expect(mapToRatingBucket("Aaa", null, null, null)).toBe("AAA");
    expect(mapToRatingBucket("Aa1", null, null, null)).toBe("AA");
    expect(mapToRatingBucket("Aa2", null, null, null)).toBe("AA");
    expect(mapToRatingBucket("Aa3", null, null, null)).toBe("AA");
    expect(mapToRatingBucket("A1", null, null, null)).toBe("A");
    expect(mapToRatingBucket("A2", null, null, null)).toBe("A");
    expect(mapToRatingBucket("A3", null, null, null)).toBe("A");
    expect(mapToRatingBucket("Baa1", null, null, null)).toBe("BBB");
    expect(mapToRatingBucket("Baa2", null, null, null)).toBe("BBB");
    expect(mapToRatingBucket("Baa3", null, null, null)).toBe("BBB");
    expect(mapToRatingBucket("Ba1", null, null, null)).toBe("BB");
    expect(mapToRatingBucket("Ba2", null, null, null)).toBe("BB");
    expect(mapToRatingBucket("Ba3", null, null, null)).toBe("BB");
    expect(mapToRatingBucket("B1", null, null, null)).toBe("B");
    expect(mapToRatingBucket("B2", null, null, null)).toBe("B");
    expect(mapToRatingBucket("B3", null, null, null)).toBe("B");
    expect(mapToRatingBucket("Caa1", null, null, null)).toBe("CCC");
    expect(mapToRatingBucket("Caa2", null, null, null)).toBe("CCC");
    expect(mapToRatingBucket("Caa3", null, null, null)).toBe("CCC");
    expect(mapToRatingBucket("Ca", null, null, null)).toBe("CCC");
    expect(mapToRatingBucket("C", null, null, null)).toBe("CCC");
  });

  it("maps S&P ratings to buckets", () => {
    expect(mapToRatingBucket(null, "AAA", null, null)).toBe("AAA");
    expect(mapToRatingBucket(null, "AA+", null, null)).toBe("AA");
    expect(mapToRatingBucket(null, "AA", null, null)).toBe("AA");
    expect(mapToRatingBucket(null, "AA-", null, null)).toBe("AA");
    expect(mapToRatingBucket(null, "A+", null, null)).toBe("A");
    expect(mapToRatingBucket(null, "BBB-", null, null)).toBe("BBB");
    expect(mapToRatingBucket(null, "BB+", null, null)).toBe("BB");
    expect(mapToRatingBucket(null, "B-", null, null)).toBe("B");
    expect(mapToRatingBucket(null, "CCC+", null, null)).toBe("CCC");
    expect(mapToRatingBucket(null, "CCC", null, null)).toBe("CCC");
    expect(mapToRatingBucket(null, "CC", null, null)).toBe("CCC");
    expect(mapToRatingBucket(null, "D", null, null)).toBe("NR");
  });

  it("maps Fitch ratings to buckets", () => {
    expect(mapToRatingBucket(null, null, "BBB-", null)).toBe("BBB");
    expect(mapToRatingBucket(null, null, "AA+", null)).toBe("AA");
    expect(mapToRatingBucket(null, null, "CCC", null)).toBe("CCC");
  });

  it("uses Moody's first, then S&P, then Fitch, then composite", () => {
    expect(mapToRatingBucket("B1", "BB+", "A+", "BBB")).toBe("B");
    expect(mapToRatingBucket(null, "BB+", "A+", "BBB")).toBe("BB");
    expect(mapToRatingBucket(null, null, "A+", "BBB")).toBe("A");
    expect(mapToRatingBucket(null, null, null, "BBB")).toBe("BBB");
    // Moody's-style string in composite slot
    expect(mapToRatingBucket(null, null, null, "Baa2")).toBe("BBB");
  });

  it("maps unrecognizable strings to NR", () => {
    expect(mapToRatingBucket("WR", null, null, null)).toBe("NR");
    expect(mapToRatingBucket("NR", null, null, null)).toBe("NR");
    expect(mapToRatingBucket(null, "NR", null, null)).toBe("NR");
    expect(mapToRatingBucket(null, null, null, null)).toBe("NR");
    expect(mapToRatingBucket("", "", "", "")).toBe("NR");
  });

  it("handles case-insensitive matching", () => {
    expect(mapToRatingBucket("baa1", null, null, null)).toBe("BBB");
    expect(mapToRatingBucket(null, "bbb+", null, null)).toBe("BBB");
  });
});

describe("DEFAULT_RATES_BY_RATING", () => {
  it("has an entry for every bucket", () => {
    for (const bucket of RATING_BUCKETS) {
      expect(DEFAULT_RATES_BY_RATING[bucket]).toBeDefined();
      expect(typeof DEFAULT_RATES_BY_RATING[bucket]).toBe("number");
    }
  });
});

describe("stripRatingSuffixes", () => {
  it("lowercases and trims", () => {
    expect(stripRatingSuffixes("  Caa1  ")).toBe("caa1");
    expect(stripRatingSuffixes("BB+")).toBe("bb+");
  });

  it("strips trailing parentheticals", () => {
    expect(stripRatingSuffixes("Ba2 (sf)")).toBe("ba2");
    expect(stripRatingSuffixes("B1(p)")).toBe("b1");
    expect(stripRatingSuffixes("BBB- (sf)")).toBe("bbb-");
  });

  it("strips rating-watch flags", () => {
    expect(stripRatingSuffixes("Caa1 *-")).toBe("caa1");
    expect(stripRatingSuffixes("Ba3*+")).toBe("ba3");
    expect(stripRatingSuffixes("B+ * watch")).toBe("b+");
  });

  it("strips both parenthetical and watch flag", () => {
    expect(stripRatingSuffixes("Caa1 (sf) *-")).toBe("caa1");
  });

  it("returns empty string on empty input", () => {
    expect(stripRatingSuffixes("")).toBe("");
    expect(stripRatingSuffixes("  ")).toBe("");
  });
});

describe("rating-string consumer consistency post-suffix-strip", () => {
  // Closes the latent divergence between moodysWarfFactor (which previously
  // stripped suffixes inline) and tryMap-driven helpers (which previously
  // did not). Both now route through stripRatingSuffixes; same input must
  // produce coherent answers across consumers.
  it("moodysWarfFactor agrees with isMoodysCaaOrBelow on rating-watch suffix", () => {
    // Pre-fix: moodysWarfFactor("Caa1 *-") = 4770; isMoodysCaaOrBelow("Caa1 *-") = false.
    // Post-fix: both strip the *- and read "caa1".
    expect(moodysWarfFactor("Caa1 *-")).toBe(4770);
    expect(isMoodysCaaOrBelow("Caa1 *-")).toBe(true);
  });

  it("moodysWarfFactor agrees with isMoodysCaaOrBelow on (sf) suffix", () => {
    expect(moodysWarfFactor("Caa2 (sf)")).toBe(6500);
    expect(isMoodysCaaOrBelow("Caa2 (sf)")).toBe(true);
  });

  it("Fitch CCC predicate handles suffixes consistently", () => {
    expect(isFitchCccOrBelow("CCC+ *-")).toBe(true);
    expect(isFitchCccOrBelow("CCC (sf)")).toBe(true);
  });

  it("non-CCC ratings with suffixes do not flip into CCC bucket", () => {
    expect(isMoodysCaaOrBelow("B2 *-")).toBe(false);
    expect(isFitchCccOrBelow("B+ (sf)")).toBe(false);
  });

  it("mapToRatingBucket handles suffixes (was a latent divergence)", () => {
    // Pre-fix: mapToRatingBucket("Caa1 *-", null, null, null) returned "NR"
    // because tryMap didn't strip "*-". Post-fix: returns "CCC".
    expect(mapToRatingBucket("Caa1 *-", null, null, null)).toBe("CCC");
    expect(mapToRatingBucket(null, "CCC+ *-", null, null)).toBe("CCC");
    expect(mapToRatingBucket(null, null, "B+ (sf)", null)).toBe("B");
  });
});
