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
// Scale boundary contract (CLAUDE.md anti-pattern #5 — "boundaries
// assert sign and scale"). Inputs are PERCENT in [0, 100]. The two
// ingestion paths that populate `clo_holdings.recovery_rate_*` are
// both percent-shape: the SDF parser at `parse-collateral.ts:205-207`
// runs `validateMagnitude("recovery_rate_pct", ...)` with bound
// max=100, and the LLM-PDF prompt at `extraction/prompts.ts:192-193`
// instructs the model to emit values like "45.0" (percent). The
// helper does NOT accept fraction shape (0..1) — a `1.0` input
// unambiguously means 1%, not 100%. Pre-narrowing the helper carried
// a `r >= 1 ? r/100 : r` dual-shape branch; the `1.0` boundary
// silently mapped to 1% under that branch (correct under the actual
// percent convention, but a surprise if a caller assumed fraction
// input — silent 99pp error). The narrowed contract eliminates that
// ambiguity at the helper layer; the parser-side `validateMagnitude`
// is the canonical scale boundary.

const MAX_PERCENT = 100;

function normalizePercentRate(r: number): number {
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
  if (r > MAX_PERCENT) {
    throw new Error(
      `resolveAgencyRecovery: agency recovery rate ${r} > 100. Magnitude violation — ` +
        `recovery cannot exceed full par. Inputs must be percent shape (0..100); a ` +
        `value above 100 indicates a parser failure (basis-point shape, absolute-vs- ` +
        `percent confusion, or 100× locale mis-parse). Refuse rather than silently ` +
        `miscompute.`,
    );
  }
  return r / MAX_PERCENT;
}

/**
 * Resolve a per-position recovery rate from a holding's agency-supplied
 * recovery rates. Inputs are PERCENT in [0, 100]; null/undefined entries
 * signal data gaps and are skipped.
 *
 * Returns the minimum across present rates as a fraction in [0, 1], or
 * `undefined` when no rates are present (caller falls back to a global
 * recovery convention).
 *
 * Throws on NaN, negative, or > 100 — see file header for rationale.
 */
export function resolveAgencyRecovery(
  rates: ReadonlyArray<number | null | undefined>,
): number | undefined {
  const present = rates.filter((r): r is number => r != null);
  if (present.length === 0) return undefined;
  const normalized = present.map(normalizePercentRate);
  return Math.min(...normalized);
}
