/**
 * Unit tests for the canonical rank-assignment helper.
 *
 * The helper is consumed by the resolver (PPM-derived path) and both DB
 * write sites (`extraction/persist-ppm.ts`, `extraction/runner.ts`). A
 * regression here silently breaks pari-passu absorption in the engine on
 * any deal that flows through any of those layers — pinning the contract
 * directly is cheaper than waiting for the marker test to fail downstream.
 */

import { describe, it, expect } from "vitest";
import { classOrderBucket, assignDenseSeniorityRanks } from "../seniority-rank";

describe("classOrderBucket", () => {
  it("Class X amortising tranche → bucket 0 (most senior position)", () => {
    expect(classOrderBucket("Class X")).toBe(0);
    expect(classOrderBucket("X")).toBe(0);
    expect(classOrderBucket("class x")).toBe(0);
  });

  it("alphabetic class letters map A=1, B=2, ..., F=6", () => {
    expect(classOrderBucket("Class A")).toBe(1);
    expect(classOrderBucket("Class B")).toBe(2);
    expect(classOrderBucket("Class C")).toBe(3);
    expect(classOrderBucket("Class D")).toBe(4);
    expect(classOrderBucket("Class E")).toBe(5);
    expect(classOrderBucket("Class F")).toBe(6);
  });

  it("split tranches share their letter bucket (A-1, A-2 → 1; B-1, B-2 → 2)", () => {
    expect(classOrderBucket("Class A-1")).toBe(1);
    expect(classOrderBucket("Class A-2")).toBe(1);
    expect(classOrderBucket("Class B-1")).toBe(2);
    expect(classOrderBucket("Class B-2")).toBe(2);
  });

  it("subordinated detection — name-based (sub, equity, income, residual)", () => {
    expect(classOrderBucket("Subordinated Notes")).toBe(100);
    expect(classOrderBucket("Sub Notes")).toBe(100);
    expect(classOrderBucket("Income Notes")).toBe(100);
    expect(classOrderBucket("Equity")).toBe(100);
    expect(classOrderBucket("Residual")).toBe(100);
  });

  it("subordinated detection — flag overrides class-letter bucket", () => {
    // Pathological: a tranche named "Class A" but flagged as subordinated
    // (e.g. an unusual sub note labelled with a letter). Flag wins.
    expect(classOrderBucket("Class A", true)).toBe(100);
    expect(classOrderBucket("Class B", true)).toBe(100);
  });

  it("null / undefined / empty className → unknown bucket (50)", () => {
    expect(classOrderBucket(null)).toBe(50);
    expect(classOrderBucket(undefined)).toBe(50);
    expect(classOrderBucket("")).toBe(50);
  });

  it("non-alphabetic prefix → unknown bucket (50)", () => {
    expect(classOrderBucket("123")).toBe(50);
    expect(classOrderBucket("---")).toBe(50);
  });

  it("Class X variants — only bare 'X' hits the senior amort bucket; 'X-1' falls to letter bucket", () => {
    // The /^x$/ test matches lowercase bare 'x' (after normalization). A
    // hyphenated suffix like "X-1" falls through to the letter bucket and
    // gets bucket 24 (charCodeAt('x')-96 = 24). This is rare in real CLOs
    // (Class X is typically a single tranche, not split) but pinning the
    // current behavior so it doesn't drift unnoticed.
    expect(classOrderBucket("Class X")).toBe(0);
    expect(classOrderBucket("Class X-1")).toBe(24);
    expect(classOrderBucket("Class XYZ")).toBe(24);
  });
});

describe("assignDenseSeniorityRanks", () => {
  it("empty input → empty output", () => {
    expect(assignDenseSeniorityRanks([])).toEqual([]);
  });

  it("single tranche → [1]", () => {
    expect(assignDenseSeniorityRanks([{ className: "Class A" }])).toEqual([1]);
  });

  it("distinct buckets densify to 1-based contiguous integers", () => {
    const ranks = assignDenseSeniorityRanks([
      { className: "Class X" },
      { className: "Class A" },
      { className: "Class B" },
      { className: "Sub" },
    ]);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("pari-passu pair shares a rank — the load-bearing invariant", () => {
    // Three tranches: A-1, A-2 (pari-passu), B. The engine groups by equal
    // `seniorityRank` for pari-passu absorption; this rank assignment is the
    // upstream input that determines whether absorption fires.
    const ranks = assignDenseSeniorityRanks([
      { className: "Class A-1" },
      { className: "Class A-2" },
      { className: "Class B" },
    ]);
    expect(ranks).toEqual([1, 1, 2]);
  });

  it("multiple pari-passu groups within one stack", () => {
    // A-1 + A-2 share rank 1; B-1 + B-2 share rank 2; C is rank 3.
    const ranks = assignDenseSeniorityRanks([
      { className: "Class A-1" },
      { className: "Class A-2" },
      { className: "Class B-1" },
      { className: "Class B-2" },
      { className: "Class C" },
    ]);
    expect(ranks).toEqual([1, 1, 2, 2, 3]);
  });

  it("Euro XV-shaped stack with B-1+B-2 split", () => {
    // X=bucket 0, A=1, B-1+B-2=2, C=3, D=4, E=5, F=6, Sub=100. Densified to
    // 1..8 with B-1 and B-2 collapsed.
    const ranks = assignDenseSeniorityRanks([
      { className: "Class X" },
      { className: "Class A" },
      { className: "Class B-1" },
      { className: "Class B-2" },
      { className: "Class C" },
      { className: "Class D" },
      { className: "Class E" },
      { className: "Class F" },
      { className: "Subordinated Notes" },
    ]);
    expect(ranks).toEqual([1, 2, 3, 3, 4, 5, 6, 7, 8]);
  });

  it("input order independence — densification depends on bucket value, not array position", () => {
    // Same set, shuffled. Each tranche keeps its rank regardless of order.
    const sorted = assignDenseSeniorityRanks([
      { className: "Class A" },
      { className: "Class B" },
      { className: "Class C" },
    ]);
    const shuffled = assignDenseSeniorityRanks([
      { className: "Class C" },
      { className: "Class A" },
      { className: "Class B" },
    ]);
    expect(sorted).toEqual([1, 2, 3]);
    // Shuffled: C=bucket3, A=bucket1, B=bucket2 → densified C=3, A=1, B=2.
    expect(shuffled).toEqual([3, 1, 2]);
  });

  it("isSubordinated flag promotes a letter-named tranche to sub bucket", () => {
    // A "Class B"-named tranche flagged subordinated should rank below the
    // Class A tranche, not at bucket 2.
    const ranks = assignDenseSeniorityRanks([
      { className: "Class A" },
      { className: "Class B", isSubordinated: true },
    ]);
    expect(ranks).toEqual([1, 2]);
    // The flagged "Class B" landed in bucket 100, but densification gave it
    // rank 2 (the second position in the sorted unique buckets [1, 100]).
  });
});
