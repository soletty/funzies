// Per-position recovery rate resolution. Single owner of the convention
// shared between two engine sites:
//
//   - resolver.ts pre-existing-defaulted reduction (T=0 OC numerator).
//   - projection.ts forward-default firing block (per-loan recovered cash).
//
// Lifting both sites to share one helper closes the parallel-implementation
// drift documented in KI-21: adding or changing the convention requires
// editing one file. A bijection unit test (`__tests__/recovery-rate.test.ts`)
// pins the contract; downstream consumers compose without re-implementing.
//
// Per-deal PPM language at the T=0 site (Adjusted CPA paragraph (e),
// `oc.txt:7120-7124` for Ares European CLO XV) reads "the lesser of (i) its
// Fitch Collateral Value and (ii) its Moody's Collateral Value", where each
// Collateral Value is `min(MarketValue, AgencyRecoveryRate) × PrincipalBalance`
// per agency that rates the deal. Two call sites pass the deal's Rating
// Agencies subset (extracted from tranche-row scan in the resolver); the
// helper takes the per-agency lesser-of-MV-and-RR before the cross-agency min.
//
// Forward-default cash recovery is a modeling convention rather than a PPM
// dictate. The helper accepts the same agencySubset (consistent treatment of
// the deal's Rating Agencies set) but no `mvFloor` — at default time the
// trustee-reported MV is a stale pre-default snapshot, not informative about
// post-default workout.
//
// Scale boundary contract (CLAUDE.md anti-pattern #5 — "boundaries assert
// sign and scale"). Inputs are PERCENT in [0, 100]. The two ingestion paths
// that populate `clo_holdings.recovery_rate_*` are both percent-shape: the
// SDF parser at `parse-collateral.ts:205-207` runs
// `validateMagnitude("recovery_rate_pct", ...)` with bound max=100, and the
// LLM-PDF prompt at `extraction/prompts.ts:192-193` instructs the model to
// emit values like "45.0" (percent). The helper does NOT accept fraction
// shape (0..1) — a `1.0` input unambiguously means 1%, not 100%.

const MAX_PERCENT = 100;

export type AgencyKey = "moodys" | "sp" | "fitch";

function validatePercent(r: number, label: string): void {
  if (Number.isNaN(r)) {
    throw new Error(
      `resolveAgencyRecovery: NaN ${label}. NaN through Math.min(...) propagates ` +
        `to every downstream cash-flow computation; refuse loud rather than poison ` +
        `the projection. Upstream parser must reject before this helper.`,
    );
  }
  if (r < 0) {
    throw new Error(
      `resolveAgencyRecovery: negative ${label} ${r}. Sign violation — recovery is ` +
        `non-negative by construction (par cannot recover into the lender).`,
    );
  }
  if (r > MAX_PERCENT) {
    throw new Error(
      `resolveAgencyRecovery: ${label} ${r} > 100. Magnitude violation — recovery ` +
        `cannot exceed full par. Inputs must be percent shape (0..100); a value ` +
        `above 100 indicates a parser failure (basis-point shape, absolute-vs-percent ` +
        `confusion, or 100× locale mis-parse).`,
    );
  }
}

function normalizePercentRate(r: number): number {
  validatePercent(r, "agency recovery rate");
  return r / MAX_PERCENT;
}

/**
 * Resolve a per-position recovery rate from a holding's agency-supplied
 * recovery rates, filtered against the deal's Rating Agencies subset.
 *
 * @param rates Per-agency recovery rates as PERCENT in [0, 100]. Null/undefined
 *              entries signal data gaps and are skipped.
 * @param agencySubset Agencies that rate the deal (the indenture's "Rating
 *              Agencies" definition). Rates for agencies outside the subset
 *              are dropped before the min — they are not the deal's rating
 *              agencies and therefore irrelevant to the OC numerator
 *              definition. Programmatic derivation in the resolver scans
 *              tranche-row rating columns; manual override per deal would
 *              live on `ResolvedDealData.ratingAgencies`.
 * @param opts.mvFloor Optional per-agency upper bound on the recovery rate,
 *              applied BEFORE the cross-agency min. Per Adjusted CPA paragraph
 *              (e) for a Defaulted Obligation: each Collateral Value is
 *              `min(MV, RR_agency)`. The T=0 OC-numerator site passes
 *              `currentPrice`; the forward-default cash-recovery site passes
 *              undefined (modeling convention; MV at default time is a stale
 *              pre-default snapshot).
 *
 * @returns Recovery rate as a fraction in [0, 1], or undefined when no
 *          subset-relevant rates are present (caller falls back to a global
 *          recovery convention).
 *
 * Throws on NaN, negative, or > 100 inputs (agency rates OR mvFloor) — see
 * file header for rationale.
 */
export function resolveAgencyRecovery(
  rates: { moodys?: number | null; sp?: number | null; fitch?: number | null },
  agencySubset: ReadonlyArray<AgencyKey>,
  opts?: { mvFloor?: number },
): number | undefined {
  if (opts?.mvFloor != null) validatePercent(opts.mvFloor, "mvFloor");

  const present: number[] = [];
  for (const key of agencySubset) {
    const v = rates[key];
    if (v != null) present.push(v);
  }
  if (present.length === 0) return undefined;

  // Per-agency MV floor BEFORE the cross-agency min — matches the PPM
  // structure where each Collateral Value definition independently does
  // `min(MV, RR_agency)`, then the Adjusted CPA paragraph takes the lesser
  // across agencies. Applying mvFloor inside the .map preserves this
  // ordering. (Equivalent to a post-min floor when mvFloor is the binding
  // constraint, but distinct when one agency's RR sits below mvFloor while
  // another's sits above — that's exactly the case the per-agency framing
  // is designed to handle.)
  const floored = opts?.mvFloor != null
    ? present.map((r) => Math.min(r, opts.mvFloor!))
    : present;
  const normalized = floored.map(normalizePercentRate);
  return Math.min(...normalized);
}
