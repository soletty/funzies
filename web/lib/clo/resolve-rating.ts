/**
 * Per-position rating resolution helpers — single owner of the PPM
 * "Moody's Rating" / "Fitch Rating" definition's multi-step ladder.
 *
 * Ladder rungs (Moody's; Fitch is symmetric):
 *
 *   1. SDF moodys_rating_final
 *   2. SDF moodys_dp_rating
 *   3. SDF moodys_issuer_rating
 *   4. Intex moody_issue_rating
 *   5. Intex moody_issuer_rating
 *   6. Intex moody_derived_default_prob_rating
 *   7. Derive from S&P via per-deal mapping table — gated on extraction
 *   8. Derive from Fitch via per-deal mapping table — gated on extraction
 *   9. Terminal default — gated on extraction
 *
 * Rungs 1–6 are deal-agnostic data lookups. Rungs 7–9 require per-deal
 * methodology rules from the PPM extractor (`raw.constraints.ratingDefinitions`).
 * When extraction has not populated the rules, those rungs are skipped and
 * the helper returns `{ rating: null, source: "absent" }` — never silently
 * guesses (anti-pattern #3).
 *
 * The `source` field on the result tags which rung resolved the rating, so
 * consumers (pool-metrics, partner-facing concentration outputs, UI lineage)
 * can branch on data provenance without re-implementing the ladder.
 *
 * The `isCreditEstimateOrPrivate` flag is set whenever the Intex CSV's
 * designation column tags the position as Private or Estimate — regardless
 * of which rung ultimately won. Drives the engine's
 * `pctOnCreditEstimateOrPrivateRating` output (matches BNY trustee-report
 * page-3 disclosure shape).
 *
 * Single owner of the convention: every consumer that needs a Moody's or
 * Fitch rating per the PPM definition routes through these helpers. WARF,
 * Caa Obligations, Fitch CCC Obligations, diversity score etc. consume the
 * resolved string from `ResolvedLoan.moodysRatingFinal` (which the resolver
 * fills via this helper). Anti-pattern #1 (parallel-implementation drift)
 * is structurally prevented.
 */

import { stripRatingSuffixes } from "./rating-mapping";
import { isRatingSentinel } from "./sdf/csv-utils";

export type AgencyKey = "moodys" | "sp" | "fitch";

/** Subset of CloHolding rating columns the resolver consumes. Restricted
 *  to keep the helper's contract tight — adding a new SDF rating channel
 *  means extending this interface AND the ladder, in the same place. */
export interface SdfRatingFields {
  moodysRating?: string | null;
  moodysRatingFinal?: string | null;
  moodysDpRating?: string | null;
  moodysIssuerRating?: string | null;
  spRating?: string | null;
  spRatingFinal?: string | null;
  spIssuerRating?: string | null;
  fitchRating?: string | null;
  fitchRatingFinal?: string | null;
  fitchIssuerRating?: string | null;
  fitchSecurityRating?: string | null;
}

/** Per-position row from the Intex DealCF positions CSV. The CSV uses
 *  heterogeneous identifiers (lxid for loans, ISIN for bonds, occasionally
 *  CUSIP) — the parser splits those into separate nullable columns with a
 *  CHECK constraint at the DB layer. */
export interface IntexPositionRow {
  /** Moody's channels */
  moodyIssueRating: string | null;
  moodyIssuerRating: string | null;
  moodyDerivedDefaultProbRating: string | null;
  moodyIssueRatingDesignation: string | null;
  /** S&P channels */
  spIssueRating: string | null;
  spIssuerRating: string | null;
  spIssueRatingDesignation: string | null;
  /** Fitch channels */
  fitchIssueRating: string | null;
  fitchIssuerRating: string | null;
  fitchDerivedRating: string | null;
  fitchIssueRatingDesignation: string | null;
  /** Per-agency derived recovery rates as percent in [0, 100]. Intex
   *  publishes them as decimals; the layer-1 parser
   *  (`parse-positions.ts:parseRecoveryRate`) multiplies by 100 so the
   *  shape reaching the resolver matches the SDF `recovery_rate_*`
   *  columns and the percent contract `resolveAgencyRecovery` enforces.
   *  Competing source for the SDF columns — the resolver falls back to
   *  Intex when the SDF channel is null. */
  moodyDerivedRecoveryRate: number | null;
  fitchDerivedRecoveryRate: number | null;
  spDerivedRecoveryRate: number | null;
}

/** Per-deal PPM-extracted rating-resolution rules. All fields optional —
 *  when absent, the corresponding ladder rung is skipped and unresolved
 *  positions return `{ source: "absent" }` (blocking at consumer-side). */
export interface RatingDefinitions {
  moodys?: {
    terminal?: string;
    spDerivation?: Record<string, string>;
    fitchDerivation?: Record<string, string>;
  };
  fitch?: {
    terminal?: string;
    moodysDerivation?: Record<string, string>;
    spDerivation?: Record<string, string>;
  };
}

export interface ResolveRatingOpts {
  /** Per-deal Rating Agencies set (KI-63). Cross-agency derivation +
   *  terminal default fire only when the target agency is in this set. */
  ratingAgencies: ReadonlyArray<AgencyKey>;
  ratingDefinitions?: RatingDefinitions;
}

export type MoodysRatingSource =
  | "sdf_final"
  | "sdf_dp"
  | "sdf_issuer"
  | "intex_issue"
  | "intex_issuer"
  | "intex_dp"
  | "derive_from_sp"
  | "derive_from_fitch"
  | "terminal"
  | "absent";

export type FitchRatingSource =
  | "sdf_final"
  | "sdf_security"
  | "sdf_issuer"
  | "intex_issue"
  | "intex_issuer"
  | "intex_derived"
  | "derive_from_moodys"
  | "derive_from_sp"
  | "terminal"
  | "absent";

export interface ResolveMoodysRatingResult {
  rating: string | null;
  source: MoodysRatingSource;
  /** Set when Intex designation tags the position as Private or Estimate.
   *  Independent of which rung resolved the rating — drives partner-facing
   *  `pctOnCreditEstimateOrPrivateRating` output. */
  isCreditEstimateOrPrivate: boolean;
  isDerivedFromSp: boolean;
  isDerivedFromFitch: boolean;
}

export interface ResolveFitchRatingResult {
  rating: string | null;
  source: FitchRatingSource;
  isCreditEstimateOrPrivate: boolean;
  isDerivedFromMoodys: boolean;
  isDerivedFromSp: boolean;
}

function clean(r: string | null | undefined): string | null {
  if (r == null) return null;
  const t = r.trim();
  if (t === "") return null;
  return isRatingSentinel(t) ? null : t;
}

function isCreditEstimateOrPrivateDesignation(d: string | null | undefined): boolean {
  if (!d) return false;
  const v = d.trim().toLowerCase();
  return v === "private" || v === "estimate";
}

export function resolveMoodysRating(
  holding: SdfRatingFields,
  intex: IntexPositionRow | undefined,
  opts: ResolveRatingOpts,
): ResolveMoodysRatingResult {
  const moodysInSet = opts.ratingAgencies.includes("moodys");
  const isCEP =
    isCreditEstimateOrPrivateDesignation(intex?.moodyIssueRatingDesignation);

  const make = (
    rating: string | null,
    source: MoodysRatingSource,
    isDerivedFromSp = false,
    isDerivedFromFitch = false,
  ): ResolveMoodysRatingResult => ({
    rating,
    source,
    isCreditEstimateOrPrivate: isCEP,
    isDerivedFromSp,
    isDerivedFromFitch,
  });

  // Rungs 1–3: SDF channels
  const sdfFinal = clean(holding.moodysRatingFinal);
  if (sdfFinal) return make(sdfFinal, "sdf_final");
  const sdfDp = clean(holding.moodysDpRating);
  if (sdfDp) return make(sdfDp, "sdf_dp");
  const sdfIssuer = clean(holding.moodysIssuerRating);
  if (sdfIssuer) return make(sdfIssuer, "sdf_issuer");

  // Rungs 4–6: Intex channels
  if (intex) {
    const intexIssue = clean(intex.moodyIssueRating);
    if (intexIssue) return make(intexIssue, "intex_issue");
    const intexIssuer = clean(intex.moodyIssuerRating);
    if (intexIssuer) return make(intexIssuer, "intex_issuer");
    const intexDp = clean(intex.moodyDerivedDefaultProbRating);
    if (intexDp) return make(intexDp, "intex_dp");
  }

  // Rungs 7–9 fire only when Moody's is in the deal's agency set.
  if (!moodysInSet) return make(null, "absent");

  // Rung 7: derive from S&P (gated on per-deal extraction).
  const spDerivation = opts.ratingDefinitions?.moodys?.spDerivation;
  if (spDerivation) {
    const spAny =
      clean(holding.spRatingFinal) ??
      clean(holding.spRating) ??
      clean(holding.spIssuerRating) ??
      clean(intex?.spIssueRating) ??
      clean(intex?.spIssuerRating);
    if (spAny) {
      const derived = spDerivation[stripRatingSuffixes(spAny)];
      if (derived) return make(derived, "derive_from_sp", true, false);
    }
  }

  // Rung 8: derive from Fitch (gated on per-deal extraction).
  const fitchDerivation = opts.ratingDefinitions?.moodys?.fitchDerivation;
  if (fitchDerivation) {
    const fitchAny =
      clean(holding.fitchRatingFinal) ??
      clean(holding.fitchRating) ??
      clean(holding.fitchSecurityRating) ??
      clean(holding.fitchIssuerRating) ??
      clean(intex?.fitchIssueRating) ??
      clean(intex?.fitchIssuerRating) ??
      clean(intex?.fitchDerivedRating);
    if (fitchAny) {
      const derived = fitchDerivation[stripRatingSuffixes(fitchAny)];
      if (derived) return make(derived, "derive_from_fitch", false, true);
    }
  }

  // Rung 9: terminal default (gated on per-deal extraction).
  const terminal = opts.ratingDefinitions?.moodys?.terminal;
  if (terminal) return make(terminal, "terminal");

  // Absent — consumer-side gate (pool-metrics) escalates to blocking when
  // the position would count in a Caa-test denominator.
  return make(null, "absent");
}

export function resolveFitchRating(
  holding: SdfRatingFields,
  intex: IntexPositionRow | undefined,
  opts: ResolveRatingOpts,
): ResolveFitchRatingResult {
  const fitchInSet = opts.ratingAgencies.includes("fitch");
  const isCEP =
    isCreditEstimateOrPrivateDesignation(intex?.fitchIssueRatingDesignation);

  const make = (
    rating: string | null,
    source: FitchRatingSource,
    isDerivedFromMoodys = false,
    isDerivedFromSp = false,
  ): ResolveFitchRatingResult => ({
    rating,
    source,
    isCreditEstimateOrPrivate: isCEP,
    isDerivedFromMoodys,
    isDerivedFromSp,
  });

  // Rungs 1–3: SDF channels
  const sdfFinal = clean(holding.fitchRatingFinal);
  if (sdfFinal) return make(sdfFinal, "sdf_final");
  const sdfSecurity = clean(holding.fitchSecurityRating);
  if (sdfSecurity) return make(sdfSecurity, "sdf_security");
  const sdfIssuer = clean(holding.fitchIssuerRating);
  if (sdfIssuer) return make(sdfIssuer, "sdf_issuer");

  // Rungs 4–6: Intex channels
  if (intex) {
    const intexIssue = clean(intex.fitchIssueRating);
    if (intexIssue) return make(intexIssue, "intex_issue");
    const intexIssuer = clean(intex.fitchIssuerRating);
    if (intexIssuer) return make(intexIssuer, "intex_issuer");
    const intexDerived = clean(intex.fitchDerivedRating);
    if (intexDerived) return make(intexDerived, "intex_derived");
  }

  if (!fitchInSet) return make(null, "absent");

  // Rung 7: derive from Moody's
  const moodysDerivation = opts.ratingDefinitions?.fitch?.moodysDerivation;
  if (moodysDerivation) {
    const moodysAny =
      clean(holding.moodysRatingFinal) ??
      clean(holding.moodysRating) ??
      clean(holding.moodysDpRating) ??
      clean(holding.moodysIssuerRating) ??
      clean(intex?.moodyIssueRating) ??
      clean(intex?.moodyIssuerRating);
    if (moodysAny) {
      const derived = moodysDerivation[stripRatingSuffixes(moodysAny)];
      if (derived) return make(derived, "derive_from_moodys", true, false);
    }
  }

  // Rung 8: derive from S&P
  const spDerivation = opts.ratingDefinitions?.fitch?.spDerivation;
  if (spDerivation) {
    const spAny =
      clean(holding.spRatingFinal) ??
      clean(holding.spRating) ??
      clean(holding.spIssuerRating) ??
      clean(intex?.spIssueRating) ??
      clean(intex?.spIssuerRating);
    if (spAny) {
      const derived = spDerivation[stripRatingSuffixes(spAny)];
      if (derived) return make(derived, "derive_from_sp", false, true);
    }
  }

  // Rung 9: terminal
  const terminal = opts.ratingDefinitions?.fitch?.terminal;
  if (terminal) return make(terminal, "terminal");

  return make(null, "absent");
}
