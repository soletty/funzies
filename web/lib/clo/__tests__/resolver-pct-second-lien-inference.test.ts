/**
 * Resolver — pctSecondLien inference from pctSeniorSecured (Sprint 4).
 *
 * Rule under test: when the resolver observes `pctSeniorSecured === 100`,
 * it infers `pctSecondLien === 0` (mutually exclusive lien categories in
 * standard CLO taxonomy — all par senior-secured ⇒ none second-lien).
 * When `pctSeniorSecured < 100`, the complement is NOT asserted — there's
 * ambiguity (unsecured, HY, mezz, etc. also contribute), so resolver
 * leaves `pctSecondLien: null` unless the source carries it directly.
 *
 * Why this matters: without this pin, a future "simplify the inference"
 * refactor could introduce the anti-rule `pctSecondLien = 100 −
 * pctSeniorSecured`, which over-claims on deals with any mixed lien types.
 * The inference is specifically "100 → 0", not "complement".
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints, CloTranche, CloHolding, CloPoolSummary } from "@/lib/clo/types";

// Minimal synthetic inputs — only the fields the resolver reads for
// poolSummary derivation. Other fields left empty / default to isolate
// pctSecondLien inference logic.
function makeResolverInputs(pctSeniorSecured: number | null, pctSecondLienOverride?: number | null) {
  const poolSummary: Partial<CloPoolSummary> = {
    totalPar: 500_000_000,
    totalPrincipalBalance: 500_000_000,
    wacSpread: 3.68,
    warf: 3000,
    walYears: 4.0,
    diversityScore: 60,
    numberOfObligors: 200,
    pctSeniorSecured,
    pctSecondLien: pctSecondLienOverride ?? undefined,
  };
  const constraints: ExtractedConstraints = {
    deal: null,
    keyDates: null,
    payFreqMonths: null,
    feeSchedule: { fees: [] },
    ocTests: { tests: [] },
    icTests: { tests: [] },
    concentrations: { limits: [] },
    waterfall: { clauses: [] },
    ccc: {
      bucketLimitPct: null,
      valuationPct: null,
      valuationMode: null,
    },
    waterfallType: null,
  } as unknown as ExtractedConstraints;
  const tranches: CloTranche[] = [];
  const holdings: CloHolding[] = [];
  return { constraints, complianceData: { poolSummary: poolSummary as CloPoolSummary, complianceTests: [], concentrations: [] }, tranches, holdings };
}

describe("resolver — pctSecondLien inference from pctSeniorSecured", () => {
  it("pctSeniorSecured === 100 → pctSecondLien === 0 (mutually exclusive inference)", () => {
    const inp = makeResolverInputs(100);
    const { resolved } = resolveWaterfallInputs(
      inp.constraints,
      inp.complianceData,
      inp.tranches,
      [],
      inp.holdings,
    );
    expect(resolved.poolSummary.pctSeniorSecured).toBe(100);
    expect(resolved.poolSummary.pctSecondLien).toBe(0);
  });

  it("pctSeniorSecured === 80 → pctSecondLien stays null (complement is NOT asserted)", () => {
    // This is the anti-regression guard. A future "simplify the inference"
    // that treats `pctSecondLien = 100 − pctSeniorSecured` would FAIL this
    // test (it would emit 20 for pctSecondLien). The inference is
    // specifically "100 → 0", not complement arithmetic.
    const inp = makeResolverInputs(80);
    const { resolved } = resolveWaterfallInputs(
      inp.constraints,
      inp.complianceData,
      inp.tranches,
      [],
      inp.holdings,
    );
    expect(resolved.poolSummary.pctSeniorSecured).toBe(80);
    expect(resolved.poolSummary.pctSecondLien).toBeNull();
  });

  it("direct pctSecondLien override (source-provided) takes precedence over inference", () => {
    // If the compliance source carries a dedicated pctSecondLien column,
    // use it as-is. Don't overwrite with the 100→0 inference.
    const inp = makeResolverInputs(100, 5);
    const { resolved } = resolveWaterfallInputs(
      inp.constraints,
      inp.complianceData,
      inp.tranches,
      [],
      inp.holdings,
    );
    expect(resolved.poolSummary.pctSeniorSecured).toBe(100);
    expect(resolved.poolSummary.pctSecondLien).toBe(5);
  });
});
