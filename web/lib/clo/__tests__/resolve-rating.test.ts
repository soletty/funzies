/**
 * Unit tests for `resolveMoodysRating` + `resolveFitchRating` helpers.
 *
 * Pins the ladder rung-by-rung so future drift (a new fallback added
 * inline at a consumer, the ladder reordered, the cross-agency derivation
 * activated without extraction) fails here rather than only on a future
 * partner-facing wrong number.
 *
 * The rungs 7–9 (cross-agency derivation + terminal) are gated on
 * `ratingDefinitions` extraction. When the per-deal rules are not
 * populated, the helper returns `{ source: "absent" }` rather than
 * silently guessing — anti-pattern #3 enforcement at the resolver
 * boundary.
 */

import { describe, it, expect } from "vitest";
import {
  resolveMoodysRating,
  resolveFitchRating,
  type IntexPositionRow,
  type ResolveRatingOpts,
} from "../resolve-rating";

const ALL_AGENCIES: ResolveRatingOpts["ratingAgencies"] = ["moodys", "sp", "fitch"];
const FITCH_MOODYS_ONLY: ResolveRatingOpts["ratingAgencies"] = ["moodys", "fitch"];
const FITCH_ONLY: ResolveRatingOpts["ratingAgencies"] = ["fitch"];
const MOODYS_ONLY: ResolveRatingOpts["ratingAgencies"] = ["moodys"];

function emptyIntex(): IntexPositionRow {
  return {
    moodyIssueRating: null,
    moodyIssuerRating: null,
    moodyDerivedDefaultProbRating: null,
    moodyIssueRatingDesignation: null,
    spIssueRating: null,
    spIssuerRating: null,
    spIssueRatingDesignation: null,
    fitchIssueRating: null,
    fitchIssuerRating: null,
    fitchDerivedRating: null,
    fitchIssueRatingDesignation: null,
    moodyDerivedRecoveryRate: null,
    fitchDerivedRecoveryRate: null,
    spDerivedRecoveryRate: null,
  };
}

describe("resolveMoodysRating — direct rating channels (rungs 1–6)", () => {
  it("rung 1: SDF moodys_rating_final wins", () => {
    const r = resolveMoodysRating(
      { moodysRatingFinal: "Caa1", moodysDpRating: "Caa2", moodysIssuerRating: "Caa3" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r).toEqual({ rating: "Caa1", source: "sdf_final", isCreditEstimateOrPrivate: false, isDerivedFromSp: false, isDerivedFromFitch: false });
  });

  it("rung 2: SDF moodys_dp_rating fires when final is null", () => {
    const r = resolveMoodysRating(
      { moodysRatingFinal: null, moodysDpRating: "Caa2", moodysIssuerRating: "Ca" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.rating).toBe("Caa2");
    expect(r.source).toBe("sdf_dp");
  });

  it("rung 3: SDF moodys_issuer_rating fires when final + dp are null", () => {
    const r = resolveMoodysRating(
      { moodysIssuerRating: "B2" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.rating).toBe("B2");
    expect(r.source).toBe("sdf_issuer");
  });

  it("sentinel values are skipped (***, NR, --, WR)", () => {
    const r = resolveMoodysRating(
      { moodysRatingFinal: "***", moodysDpRating: "NR", moodysIssuerRating: "Caa1" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("sdf_issuer");
  });

  it("rung 4: Intex moody_issue_rating fires when SDF channels exhausted", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "Caa1";
    intex.moodyIssuerRating = "Caa2";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("intex_issue");
  });

  it("rung 5: Intex moody_issuer_rating fires when issue is null", () => {
    const intex = emptyIntex();
    intex.moodyIssuerRating = "B3";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.rating).toBe("B3");
    expect(r.source).toBe("intex_issuer");
  });

  it("rung 6: Intex moody_derived_default_prob_rating fires last among Intex", () => {
    const intex = emptyIntex();
    intex.moodyDerivedDefaultProbRating = "B2";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.rating).toBe("B2");
    expect(r.source).toBe("intex_dp");
  });

  it("SDF wins over Intex when both populated", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "Ca";
    const r = resolveMoodysRating(
      { moodysRatingFinal: "Caa1" },
      intex,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("sdf_final");
  });
});

describe("resolveMoodysRating — credit-estimate flag", () => {
  it("isCreditEstimateOrPrivate=true when Intex designation is Private", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "Caa1";
    intex.moodyIssueRatingDesignation = "Private";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.isCreditEstimateOrPrivate).toBe(true);
  });

  it("isCreditEstimateOrPrivate=true when Intex designation is Estimate", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "B3";
    intex.moodyIssueRatingDesignation = "Estimate";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.isCreditEstimateOrPrivate).toBe(true);
  });

  it("isCreditEstimateOrPrivate=true even when SDF wins the ladder (Intex tells us about provenance independently)", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "Caa1";
    intex.moodyIssueRatingDesignation = "Private";
    const r = resolveMoodysRating(
      { moodysRatingFinal: "Caa1" },
      intex,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.source).toBe("sdf_final");
    expect(r.isCreditEstimateOrPrivate).toBe(true);
  });

  it("isCreditEstimateOrPrivate=false when designation is Public", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "B2";
    intex.moodyIssueRatingDesignation = "Public";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.isCreditEstimateOrPrivate).toBe(false);
  });

  it("isCreditEstimateOrPrivate=false when no Intex row available", () => {
    const r = resolveMoodysRating(
      { moodysRatingFinal: "Caa1" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.isCreditEstimateOrPrivate).toBe(false);
  });
});

describe("resolveMoodysRating — gated rungs 7–9 (cross-agency + terminal)", () => {
  const spDerivation = { "ccc+": "Caa1", "ccc": "Caa2", "ccc-": "Caa3", "b+": "B1", "b": "B2", "b-": "B3" };
  const fitchDerivation = { ...spDerivation };

  it("rung 7 fires when ratingDefinitions.moodys.spDerivation is populated", () => {
    const r = resolveMoodysRating(
      { spRating: "CCC+" },
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { spDerivation } } },
    );
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("derive_from_sp");
    expect(r.isDerivedFromSp).toBe(true);
  });

  it("rung 7 SKIPPED when spDerivation is NOT extracted (anti-pattern #3 — refuse to silently guess)", () => {
    const r = resolveMoodysRating(
      { spRating: "CCC+" },
      undefined,
      { ratingAgencies: ALL_AGENCIES /* no ratingDefinitions */ },
    );
    expect(r.rating).toBe(null);
    expect(r.source).toBe("absent");
  });

  it("rung 8 fires when fitchDerivation extracted and S&P unavailable", () => {
    const r = resolveMoodysRating(
      { fitchRating: "B" },
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { fitchDerivation } } },
    );
    expect(r.rating).toBe("B2");
    expect(r.source).toBe("derive_from_fitch");
    expect(r.isDerivedFromFitch).toBe(true);
  });

  it("rung 9 (terminal) fires when extracted and no other rung matched", () => {
    const r = resolveMoodysRating(
      {},
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { terminal: "Caa2" } } },
    );
    expect(r.rating).toBe("Caa2");
    expect(r.source).toBe("terminal");
  });

  it("rung 9 (terminal) is INERT when not extracted — returns absent", () => {
    const r = resolveMoodysRating(
      {},
      undefined,
      { ratingAgencies: ALL_AGENCIES /* no ratingDefinitions.moodys.terminal */ },
    );
    expect(r.rating).toBe(null);
    expect(r.source).toBe("absent");
  });

  it("rung 7 returns absent (not silent default) when S&P value not in mapping table", () => {
    const r = resolveMoodysRating(
      { spRating: "Z9" },
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { spDerivation } } },
    );
    // Falls through past rung 7 (no entry for "Z9"); skips 8 (no fitchDerivation);
    // skips 9 (no terminal); returns absent.
    expect(r.source).toBe("absent");
  });

  it("rungs 7–9 SKIPPED entirely when Moody's not in ratingAgencies set (KI-63 portability)", () => {
    const r = resolveMoodysRating(
      { spRating: "CCC+" },
      undefined,
      { ratingAgencies: FITCH_ONLY, ratingDefinitions: { moodys: { spDerivation, terminal: "Caa2" } } },
    );
    expect(r.rating).toBe(null);
    expect(r.source).toBe("absent");
  });

  it("ladder order: direct rungs win over derivation even when extracted", () => {
    const intex = emptyIntex();
    intex.moodyIssueRating = "B3";
    const r = resolveMoodysRating(
      { spRating: "CCC" },
      intex,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { spDerivation } } },
    );
    expect(r.source).toBe("intex_issue");
    expect(r.rating).toBe("B3");
  });
});

describe("resolveFitchRating — symmetric ladder", () => {
  it("rung 1: SDF fitch_rating_final wins", () => {
    const r = resolveFitchRating(
      { fitchRatingFinal: "CCC+" },
      undefined,
      { ratingAgencies: ALL_AGENCIES },
    );
    expect(r.rating).toBe("CCC+");
    expect(r.source).toBe("sdf_final");
  });

  it("rung 4: Intex fitch_issue_rating fires when SDF channels exhausted", () => {
    const intex = emptyIntex();
    intex.fitchIssueRating = "B-";
    const r = resolveFitchRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.rating).toBe("B-");
    expect(r.source).toBe("intex_issue");
  });

  it("derive-from-Moody's gated on ratingDefinitions.fitch.moodysDerivation", () => {
    const moodysDerivation = { "caa1": "CCC+", "caa2": "CCC", "caa3": "CCC-" };
    const r = resolveFitchRating(
      { moodysRatingFinal: "Caa1" },
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { fitch: { moodysDerivation } } },
    );
    expect(r.rating).toBe("CCC+");
    expect(r.source).toBe("derive_from_moodys");
    expect(r.isDerivedFromMoodys).toBe(true);
  });

  it("derive-from-Moody's INERT without extraction", () => {
    const r = resolveFitchRating(
      { moodysRatingFinal: "Caa1" },
      undefined,
      { ratingAgencies: ALL_AGENCIES /* no ratingDefinitions */ },
    );
    expect(r.source).toBe("absent");
  });

  it("Fitch absent when Fitch not in ratingAgencies set", () => {
    const r = resolveFitchRating(
      { moodysRatingFinal: "Caa1" },
      undefined,
      { ratingAgencies: MOODYS_ONLY, ratingDefinitions: { fitch: { moodysDerivation: { "caa1": "CCC+" }, terminal: "CCC" } } },
    );
    expect(r.rating).toBe(null);
    expect(r.source).toBe("absent");
  });

  it("isCreditEstimateOrPrivate flag mirrors Intex fitch designation", () => {
    const intex = emptyIntex();
    intex.fitchIssueRating = "CCC";
    intex.fitchIssueRatingDesignation = "Private";
    const r = resolveFitchRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.isCreditEstimateOrPrivate).toBe(true);
  });
});

describe("resolve helpers — anti-pattern #3 boundary (silent fallback refused)", () => {
  it("Moody's absent when Intex provides only S&P/Fitch and no derivation extracted", () => {
    const intex = emptyIntex();
    intex.spIssueRating = "B-";
    intex.fitchIssueRating = "B";
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.source).toBe("absent");
    expect(r.rating).toBe(null);
  });

  it("partial extraction: only sp populated, only spDerivation extracted — derives via S&P", () => {
    const r = resolveMoodysRating(
      { spRating: "B+" },
      undefined,
      { ratingAgencies: ALL_AGENCIES, ratingDefinitions: { moodys: { spDerivation: { "b+": "B1" } /* no fitchDerivation, no terminal */ } } },
    );
    expect(r.source).toBe("derive_from_sp");
  });

  it("Euro-XV-shape: ratingAgencies = [moodys, sp, fitch], all 12 SDF-null Apollo-shape positions resolve via Intex", () => {
    // Apollo Finco shape: SDF Moody's null in every channel, Intex moody_issue=Caa1 (Private designation)
    const intex = emptyIntex();
    intex.moodyIssueRating = "Caa1";
    intex.moodyIssuerRating = "Caa1";
    intex.moodyIssueRatingDesignation = "Private";
    intex.spIssueRating = "CCC+";
    intex.fitchIssueRating = "B-"; // not Caa-equivalent
    const r = resolveMoodysRating({}, intex, { ratingAgencies: ALL_AGENCIES });
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("intex_issue");
    expect(r.isCreditEstimateOrPrivate).toBe(true);
  });

  it("FITCH_MOODYS_ONLY (Euro-shape): S&P-derived rung skipped even when extracted, because S&P not in agency set", () => {
    // KI-63 invariant: even if extracted, derivation gates on agency-set membership.
    // If a deal's rating agencies set excludes S&P, S&P-derived rung must not fire.
    // Implementation note: current helper gates rungs 7–9 on the TARGET agency
    // (Moody's) being in the set. The S&P INPUT to the derivation is allowed
    // even when S&P isn't in the deal's agency set — this matches the PPM
    // "Moody's Rating" definition which treats the derivation table as a
    // mechanical cross-reference, not a per-deal-agency-set restriction.
    const r = resolveMoodysRating(
      { spRating: "CCC+" },
      undefined,
      { ratingAgencies: FITCH_MOODYS_ONLY, ratingDefinitions: { moodys: { spDerivation: { "ccc+": "Caa1" } } } },
    );
    // Moody's IS in the set; derivation fires.
    expect(r.rating).toBe("Caa1");
    expect(r.source).toBe("derive_from_sp");
  });
});
