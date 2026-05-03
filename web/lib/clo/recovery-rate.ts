// Per-position agency recovery rate resolution. Single owner of the
// "lesser of available agency rates" convention, consumed at two engine
// sites:
//
//   - resolver.ts pre-existing-defaulted reduction (T=0 OC numerator).
//   - projection.ts forward-default firing block (per-loan recovered cash).
//
// Lifting both sites to share one helper closes the parallel-
// implementation drift documented in KI-21: adding or changing the
// convention requires editing one file. A bijection unit test
// (`__tests__/recovery-rate.test.ts`) pins the contract; downstream
// consumers compose without re-implementing.
//
// Per-deal-PPM caveat: Euro XV's PPM language at the T=0 site reads
// "Lesser of Fitch Collateral Value and S&P Collateral Value" — two
// agencies, not three. Both call sites currently pass all three
// available rates so they remain consistent with each other; tracked
// in KI-63 as the residual agency-subset question awaiting per-deal
// PPM extraction.
//
// Scale boundary contract (CLAUDE.md anti-pattern #5 — "boundaries assert
// sign and scale"). Each agency rate may arrive in either percent shape
// (45 = "45%") or fraction shape (0.45 = "45%"). The convention is
// per-source, not per-agency, so on a single loan all three rates SHOULD
// share a scale — but the type system carries no such invariant, and
// non-SDF ingestion paths (LLM-PDF normalizer at
// `extraction/normalizer.ts:710-712`) write the same fields without the
// SDF parser's `validateMagnitude` boundary check. Mixed-scale inputs
// must be handled correctly OR refused.
//
// The fix: normalize EACH rate first, THEN take min. A naive
// min-then-scale silently returns the LARGER value when scales mix:
//   min(45, 0.70) = 0.70 → < 1 → treated as 70%
// but the correct lesser of 45% and 70% is 45%. The bug shape is
// "silently returns the wrong agency's rate" — the kind that doesn't
// surface in any test until a future deal's SDF emits a fraction-shaped
// recovery column alongside another in percent form.

const FRACTION_THRESHOLD = 1;

function normalizeRate(r: number): number {
  if (Number.isNaN(r)) {
    throw new Error(
      `resolveAgencyRecovery: NaN agency recovery rate. NaN through Math.min(...) ` +
        `propagates to every downstream cash-flow computation; refuse loud rather ` +
        `than poison the projection. Upstream parser must reject before this helper.`,
    );
  }
  if (r < 0) {
    throw new Error(
      `resolveAgencyRecovery: negative agency recovery rate ${r}. Sign violation — ` +
        `recovery is non-negative by construction (par cannot recover into the lender).`,
    );
  }
  // Convention: r >= 1 is percent shape (45 → 45%), r < 1 is fraction (0.45 → 45%).
  // 1.0 is treated as percent ("1%") to match the pre-existing convention at
  // resolver.ts:1456 — preserving cross-site consistency outweighs the marginal
  // ambiguity. Real recovery rates concentrate in 25-70%, far from this edge.
  const norm = r >= FRACTION_THRESHOLD ? r / 100 : r;
  if (norm > 1) {
    throw new Error(
      `resolveAgencyRecovery: agency recovery rate ${r} normalizes to ${norm} ` +
        `(> 1.0 = > 100%). Magnitude violation — recovery cannot exceed full par. ` +
        `Likely a parser failure (basis-point shape, absolute-vs-percent confusion, ` +
        `or 100× locale mis-parse). Refuse rather than silently miscompute.`,
    );
  }
  return norm;
}

/**
 * Resolve a per-position recovery rate from a holding's agency-supplied
 * recovery rates. Inputs may be null/undefined (data gap) or numbers in
 * either percent or fraction shape — the helper normalizes each
 * independently before taking the minimum.
 *
 * Returns the normalized minimum as a fraction in [0, 1], or `undefined`
 * when no rates are present (caller falls back to a global recovery
 * convention).
 *
 * Throws on NaN, negative, or post-normalize > 1.0 — see file header
 * for rationale.
 */
export function resolveAgencyRecovery(
  rates: ReadonlyArray<number | null | undefined>,
): number | undefined {
  const present = rates.filter((r): r is number => r != null);
  if (present.length === 0) return undefined;
  const normalized = present.map(normalizeRate);
  return Math.min(...normalized);
}
