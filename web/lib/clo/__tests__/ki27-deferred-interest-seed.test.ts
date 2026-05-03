/**
 * KI-27 marker test — T=0 Deferred Interest seeding for deferrable tranches.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Purpose: lock the engine seed semantics for `deferredBalances` against the
 * trustee-extracted `deferredInterestBalance` field, gated by the deal's
 * `deferredInterestCompounds` flag. The mapping is decided by PPM clause text:
 *
 *   - Compounding PPM (e.g. Ares CLO XV Condition 6(c) verbatim):
 *     "Deferred Interest [...] will be added to the principal amount of the
 *     [Class] Notes [...] and thereafter will accrue interest at the rate of
 *     interest applicable to that Class." Prior PIK is therefore in the
 *     trustee's `endingBalance`/`Current` column → `currentBalance` →
 *     `trancheBalances`. Seeding `deferredBalances` from the trustee field
 *     would double-count. Engine ignores the trustee value.
 *
 *   - Non-compounding PPM: deferred sits in a separate sub-account, NOT
 *     added to PAO. Trustee field carries the T=0 sub-account balance.
 *     Engine seeds `deferredBalances` from it.
 *
 * Six cases pin the design:
 *
 *   (1) Canonical seed (compounds=false + €5M Class E sub-account):
 *       seeded run's cumulative equity distributions are at least €4M lower
 *       than the null-seed baseline (and not more than €10M lower). The
 *       deferred bucket is debt the engine pays from interest before
 *       residual flows to equity. Correctness assertion — bounds are
 *       structural (seed magnitude ± cascade tolerance), not bug-magnitude.
 *
 *   (2) Compounding regression (compounds=true + €5M ≤ currentBalance):
 *       engine output IDENTICAL to null-seed run. Locks "engine ignores
 *       trustee field under compounding" against silent flips.
 *
 *   (3) Soft warning (compounds=true + 0 < value ≤ currentBalance):
 *       severity:"warn" warning with cause-tree text fires; projection
 *       still runs. Locks the warn-not-block decision against drift in
 *       either direction.
 *
 *   (4) Hard block (compounds=true + value > currentBalance):
 *       blocking warning + IncompleteDataError. Mathematically impossible
 *       under PPM 6(c) — Deferred Interest is a subset of PAO; a value
 *       exceeding currentBalance is extraction misalignment.
 *
 *   (5) Disjointness (non-deferrable tranche with non-null value):
 *       blocking warning + IncompleteDataError. Non-deferrables breach EoD
 *       on missed interest; they cannot accumulate to a deferred bucket.
 *
 *   (6) priorInterestShortfall migration (deferrable tranche with
 *       priorInterestShortfall populated): blocking warning +
 *       IncompleteDataError via `buildFromResolved` (was an engine throw at
 *       projection.ts before this PR). The user-facing UX is the standard
 *       DATA INCOMPLETE banner, not a stack trace. Engine retains a
 *       lightweight backstop assert for hand-constructed inputs that
 *       bypass the gate; not exercised by this test.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runProjection } from "@/lib/clo/projection";
import {
  buildFromResolved,
  composeBuildWarnings,
  DEFAULT_ASSUMPTIONS,
  IncompleteDataError,
} from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData, ResolvedTranche } from "@/lib/clo/resolver-types";
const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");

function loadResolved(): ResolvedDealData {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).resolved as ResolvedDealData;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function findTranche(
  resolved: ResolvedDealData,
  predicate: (t: ResolvedTranche) => boolean,
): ResolvedTranche {
  const t = resolved.tranches.find(predicate);
  if (!t) throw new Error("test setup: tranche not found");
  return t;
}

// Class E (deferrable, currentBalance ≈ €25.6M on Euro XV) is the standard
// load-bearing case for deferred-interest seeding tests — typical mezzanine
// position where prior PIK could plausibly accumulate.
const findClassE = (r: ResolvedDealData) =>
  findTranche(r, (t) => t.className.includes("Class E") && t.isDeferrable);

const findClassA = (r: ResolvedDealData) =>
  findTranche(r, (t) => t.className.includes("Class A") && !t.isDeferrable);

// Synthetic seed magnitude. Chosen at €5M because it's well-separated from
// fixture-baseline noise (~ tens of K from cascade markers) but not so large
// that it crashes the cap structure (Class E currentBalance ≈ €25M).
const SYNTHETIC_DEFERRED_SEED = 5_000_000;

// =============================================================================
// Case 1 — canonical seed under non-compounding PPM
// =============================================================================
//
// Correctness assertion: under non-compounding PPM, seeding the trustee
// `deferredInterestBalance` into `deferredBalances[E]` MUST cause Sub Notes
// distributions to DROP by approximately the seeded amount, because that
// bucket is paid from interest / principal before residual flows to equity.

describe("KI-27 case 1 — canonical seed under non-compounding PPM", () => {
  it("compounds=false + €5M Class E deferredInterestBalance → equity DOWN by ≥ ~€4M vs null baseline", () => {
    // Baseline: null seed, compounds=false. No T=0 deferred bucket.
    const baselineResolved = loadResolved();
    baselineResolved.deferredInterestCompounds = false;
    const baselineE = findClassE(baselineResolved);
    baselineE.deferredInterestBalance = null;
    const baselineInputs = buildFromResolved(baselineResolved, {
      ...DEFAULT_ASSUMPTIONS,
      deferredInterestCompounds: false,
    });
    const baseline = runProjection(baselineInputs);

    // Seeded: €5M trustee value on Class E, compounds=false. Engine seeds
    // deferredBalances[E] = €5M; that bucket is paid from interest /
    // principal before equity-residual flows to Sub Notes.
    const seededResolved = loadResolved();
    seededResolved.deferredInterestCompounds = false;
    const seededE = findClassE(seededResolved);
    seededE.deferredInterestBalance = SYNTHETIC_DEFERRED_SEED;
    const seededInputs = buildFromResolved(seededResolved, {
      ...DEFAULT_ASSUMPTIONS,
      deferredInterestCompounds: false,
    });
    const seeded = runProjection(seededInputs);

    const drift =
      seeded.totalEquityDistributions - baseline.totalEquityDistributions;

    // Drift must be negative — seeded equity strictly less than baseline.
    expect(drift).toBeLessThan(0);
    // Lower bound: |drift| ≥ €4M. A bound below the seed (€5M) accounts
    // for second-order cascade (OC denominator, cap mechanics, OC-cure
    // paydowns spreading the bucket); a fix that no-ops the seed would
    // produce drift ≈ 0 and fail this bound.
    expect(Math.abs(drift)).toBeGreaterThanOrEqual(4_000_000);
    // Upper bound: |drift| within ~2× the seed. Catches a regression
    // where the seed is mis-scaled (e.g. cents/euros mix-up) or where
    // upstream cascade shifts dramatically.
    expect(Math.abs(drift)).toBeLessThanOrEqual(10_000_000);
  });
});

// =============================================================================
// Case 2 — compounding regression: engine ignores trustee value
// =============================================================================

describe("KI-27 case 2 — compounding regression (engine ignores trustee field)", () => {
  it("compounds=true + €5M trustee value (≤ currentBalance) → identical engine output to null", () => {
    const baselineResolved = loadResolved(); // compounds=true is fixture default
    const baselineE = findClassE(baselineResolved);
    baselineE.deferredInterestBalance = null;
    const baselineInputs = buildFromResolved(baselineResolved, DEFAULT_ASSUMPTIONS);
    const baseline = runProjection(baselineInputs);

    const populatedResolved = loadResolved();
    const populatedE = findClassE(populatedResolved);
    // Soft warn fires under compounding — buildFromResolved emits the
    // cause-tree warning but does NOT block. The test passes the populated
    // value through to the engine via `buildFromResolved`. The engine seed
    // logic at projection.ts ignores the value under compounds=true.
    populatedE.deferredInterestBalance = SYNTHETIC_DEFERRED_SEED;
    expect(populatedE.deferredInterestBalance).toBeLessThanOrEqual(populatedE.currentBalance);
    const populatedInputs = buildFromResolved(populatedResolved, DEFAULT_ASSUMPTIONS);
    const populated = runProjection(populatedInputs);

    // Engine output IDENTICAL — the trustee field is silently ignored under
    // compounding because PIK is already in currentBalance. Locks against a
    // future PR that flips the seed to unconditional.
    expect(populated.totalEquityDistributions).toBeCloseTo(
      baseline.totalEquityDistributions,
      2,
    );
    expect(populated.equityIrr).toBeCloseTo(baseline.equityIrr!, 8);
  });
});

// =============================================================================
// Case 3 — soft warning under compounding (warn-not-block)
// =============================================================================

describe("KI-27 case 3 — soft warning under compounding (warn-not-block)", () => {
  it("compounds=true + 0 < value ≤ currentBalance → severity:'warn' cause-tree warning, projection still runs", () => {
    const resolved = loadResolved();
    const e = findClassE(resolved);
    e.deferredInterestBalance = SYNTHETIC_DEFERRED_SEED;
    expect(e.deferredInterestBalance).toBeGreaterThan(0);
    expect(e.deferredInterestBalance).toBeLessThanOrEqual(e.currentBalance);

    // (i) buildFromResolved must NOT throw — warn is not blocking.
    expect(() =>
      buildFromResolved(resolved, DEFAULT_ASSUMPTIONS),
    ).not.toThrow();

    // (ii) The composed warnings must include the soft cause-tree
    // warning. Pinned via the `composeBuildWarnings` helper which
    // exposes the full composed set (blocking AND non-blocking).
    // IncompleteDataError.errors only carries blocking warnings, so
    // this is the only path that reaches the soft warn.
    const composed = composeBuildWarnings(resolved, DEFAULT_ASSUMPTIONS);
    const w = composed.find(
      (x) => x.field === `tranches.${e.className}.deferredInterestBalance`,
    );
    expect(w, "soft warn must be emitted under compounds=true + populated value").toBeDefined();
    expect(w!.severity).toBe("warn");
    expect(w!.blocking).toBe(false);
    // Cause-tree text — assert each of the three plausible-cause hooks
    // is present. The partner-facing investigator reads this verbatim
    // when triaging; locking the text against silent erosion.
    expect(w!.message).toMatch(/informational disclosure/);
    expect(w!.message).toMatch(/extraction read the wrong column/);
    expect(w!.message).toMatch(/snapshot-timing/);
  });
});

// =============================================================================
// Case 4 — hard block (value > currentBalance under compounding)
// =============================================================================

/** Run buildFromResolved expecting it to throw IncompleteDataError; return
 *  the captured error. Single call site, single throw — used by every
 *  blocking-gate test below. */
function expectIncompleteData(
  resolved: ResolvedDealData,
): IncompleteDataError {
  try {
    buildFromResolved(resolved, DEFAULT_ASSUMPTIONS);
  } catch (err) {
    if (err instanceof IncompleteDataError) return err;
    throw err;
  }
  throw new Error("expected IncompleteDataError to be thrown");
}

describe("KI-27 case 4 — hard block on impossible magnitude under compounding", () => {
  it("compounds=true + value > currentBalance → blocking warning + IncompleteDataError", () => {
    const resolved = loadResolved();
    const e = findClassE(resolved);
    // Mathematically impossible under PPM 6(c): Deferred Interest is a
    // subset of PAO under compounding (PIK is added to PAO, so PAO
    // includes it). A trustee value exceeding currentBalance is
    // extraction misalignment.
    e.deferredInterestBalance = e.currentBalance * 2;

    const ide = expectIncompleteData(resolved);
    const w = ide.errors.find(
      (x) => x.field === `tranches.${e.className}.deferredInterestBalance`,
    );
    expect(w, "blocking warning for hard-block case must enumerate the tranche").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/Mathematically impossible|exceeds currentBalance/);
  });
});

// =============================================================================
// Case 5 — disjointness (non-deferrable tranche carrying deferred value)
// =============================================================================

describe("KI-27 case 5 — disjointness gate (deferred bucket on non-deferrable)", () => {
  it("non-deferrable tranche with deferredInterestBalance != null → blocking + IncompleteDataError", () => {
    const resolved = loadResolved();
    const a = findClassA(resolved);
    expect(a.isDeferrable).toBe(false);
    a.deferredInterestBalance = 1; // any non-null value triggers the gate

    const ide = expectIncompleteData(resolved);
    const w = ide.errors.find(
      (x) => x.field === `tranches.${a.className}.deferredInterestBalance`,
    );
    expect(w, "blocking warning for disjointness must enumerate the tranche").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/non-deferrable/);
  });
});

// =============================================================================
// Case 6 — priorInterestShortfall migration to blocking-warning plumbing
// =============================================================================

describe("KI-27 case 6 — priorInterestShortfall × deferrable produces a banner, not an engine throw", () => {
  it("deferrable tranche with priorInterestShortfall != null → blocking + IncompleteDataError", () => {
    const resolved = loadResolved();
    const e = findClassE(resolved);
    expect(e.isDeferrable).toBe(true);
    e.priorInterestShortfall = 1000;

    const ide = expectIncompleteData(resolved);
    const w = ide.errors.find(
      (x) => x.field === `tranches.${e.className}.priorInterestShortfall`,
    );
    expect(
      w,
      "blocking warning for priorInterestShortfall × deferrable must enumerate the tranche",
    ).toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/non-deferrable senior debt|deferrable.*amortising.*income-note/);
  });
});

// =============================================================================
// Case 7 — boundary invariant: negative value
// =============================================================================

describe("KI-27 case 7 — negative deferredInterestBalance is refused (boundary invariant)", () => {
  it("deferrable tranche with dib < 0 → blocking + IncompleteDataError", () => {
    const resolved = loadResolved();
    const e = findClassE(resolved);
    expect(e.isDeferrable).toBe(true);
    e.deferredInterestBalance = -1; // any negative value triggers the gate

    const ide = expectIncompleteData(resolved);
    const w = ide.errors.find(
      (x) => x.field === `tranches.${e.className}.deferredInterestBalance`,
    );
    expect(w, "blocking warning for negative-value case must enumerate the tranche").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/negative/);
  });
});

// =============================================================================
// Case 8 — boundary invariant: positive value on a paid-off tranche
// =============================================================================

describe("KI-27 case 8 — positive deferredInterestBalance on paid-off tranche is refused", () => {
  it("deferrable tranche with dib > 0 + currentBalance == 0 → blocking + IncompleteDataError", () => {
    const resolved = loadResolved();
    const e = findClassE(resolved);
    expect(e.isDeferrable).toBe(true);
    e.currentBalance = 0; // simulate paid-off tranche
    e.deferredInterestBalance = 1; // residual deferred claim is invalid here

    const ide = expectIncompleteData(resolved);
    const w = ide.errors.find(
      (x) => x.field === `tranches.${e.className}.deferredInterestBalance`,
    );
    expect(w, "blocking warning for paid-off-tranche case must enumerate the tranche").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/paid-off|currentBalance=0/);
  });
});

// =============================================================================
// Case 9 — gate independence: non-deferrable tranche with NEGATIVE dib
// =============================================================================
//
// Locks the round-2 review finding: gates (a) [disjointness] and (a')
// [negative-value] must fire INDEPENDENTLY. A non-deferrable tranche that
// also carries a negative dib is two distinct invariant violations; both
// must surface so the data fixer sees both signals and doesn't fix one and
// re-extract only to discover the other on the next run.

describe("KI-27 case 9 — gate independence: non-deferrable + negative dib raises both gates", () => {
  it("non-deferrable tranche with dib < 0 → both disjointness AND negative warnings fire", () => {
    const resolved = loadResolved();
    const a = findClassA(resolved);
    expect(a.isDeferrable).toBe(false);
    a.deferredInterestBalance = -1; // both gate (a) AND gate (a') apply

    const ide = expectIncompleteData(resolved);
    const matching = ide.errors.filter(
      (x) => x.field === `tranches.${a.className}.deferredInterestBalance`,
    );
    // Both invariants surface simultaneously: a single warning that
    // collapses the two would mask one of them under the other on
    // partial fixes.
    expect(
      matching.length,
      "both disjointness and negative-value warnings must fire on the same tranche",
    ).toBeGreaterThanOrEqual(2);
    const messages = matching.map((m) => m.message).join("\n");
    expect(messages).toMatch(/non-deferrable/);
    expect(messages).toMatch(/negative/);
  });
});
