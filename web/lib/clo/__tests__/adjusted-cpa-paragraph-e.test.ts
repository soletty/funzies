/**
 * Adjusted Collateral Principal Amount paragraph (e) PPM-compliance markers.
 *
 * Per Ares European XV Final Offering Circular (oc.txt):
 *
 *   - oc.txt:7120-7124 (Adjusted CPA paragraph (e)):
 *     "in relation to a Deferring Security or a Defaulted Obligation the
 *      lesser of (i) its Fitch Collateral Value and (ii) its Moody's
 *      Collateral Value; provided that, in the case of a Defaulted Obligation,
 *      the value determined under this paragraph (e) of a Defaulted Obligation
 *      that has been a Defaulted Obligation for more than three years … shall
 *      be zero"
 *
 *   - oc.txt:8765-8777 (Fitch Collateral Value):
 *     "(a) for each Defaulted Obligation … the lower of: (i) its prevailing
 *      Market Value; and (ii) the relevant Fitch Recovery Rate, multiplied
 *      by its Principal Balance, provided that if the Market Value cannot
 *      be determined for any reason, the Fitch Collateral Value shall be
 *      determined in accordance with paragraph (ii) above"
 *
 *   - oc.txt:9420-9434 (Moody's Collateral Value): same shape with Moody's RR
 *     (paragraph (b) fall-through covers MV-undeterminable + LMLs).
 *
 *   - oc.txt:368-369 (Rating Agencies):
 *     "Moody's Investors Service Limited ('Moody's', and together with Fitch,
 *      the 'Rating Agencies', and each, a 'Rating Agency')"
 *     — i.e., Euro XV's Rating Agencies set is {Moody's, Fitch}.
 *
 * Three sub-fixes covered:
 *
 *   - Sub-fix A: per-deal agency subset filtering (rates outside the deal's
 *     Rating Agencies set are dropped before the cross-agency min). Marker
 *     A2 = Euro XV tranche-derivation; A3 = degenerate-set warning. Helper-
 *     level subset filter is unit-tested in `recovery-rate.test.ts`.
 *
 *   - Sub-fix B: per-agency MV floor BEFORE the cross-agency min (PPM
 *     `min(MV, RR_agency)` per Collateral Value definition). Marker B is
 *     pinned to the Euro XV "Castle US Holding" pre-fire shape — the only
 *     position in the live portfolio (per DB query 2026-05-03) where
 *     `MV < min(present agency RRs)` for the deal's Rating Agencies subset.
 *
 *   - Sub-fix C: 3-year stale-default zero-out. Marker C1 = engine zero-out
 *     when defaultDate > 3y old. Marker C2 = lenient + warning when
 *     defaultDate is missing on a defaulted holding (CLAUDE.md anti-pattern
 *     #3 — error / non-blocking surface for a computational-input gap that
 *     does not need to refuse the projection).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");

interface RawFixture {
  raw: {
    constraints: any;
    complianceData: any;
    tranches: any[];
    trancheSnapshots: any[];
    holdings: any[];
    dealDates: any;
    accountBalances: any[];
    parValueAdjustments: any[];
  };
}

function loadRaw(): RawFixture["raw"] {
  return JSON.parse(JSON.stringify(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).raw));
}

function runResolver(raw: RawFixture["raw"]) {
  return resolveWaterfallInputs(
    raw.constraints,
    raw.complianceData,
    raw.tranches,
    raw.trancheSnapshots,
    raw.holdings,
    raw.dealDates,
    raw.accountBalances,
    raw.parValueAdjustments,
  );
}

/**
 * Build a synthetic defaulted-holding row by cloning a non-defaulted template
 * from the fixture and applying overrides. Tests pin the engine's response
 * to specific defaulted shapes without depending on the fixture carrying
 * defaulted positions (Euro XV today has zero — the bugs are LATENT, and
 * the markers fire when the bug shapes pre-fire on synthetic inputs).
 */
function makeDefaultedHolding(template: any, overrides: Record<string, unknown>) {
  return {
    ...template,
    isDefaulted: true,
    ...overrides,
  };
}

describe("Sub-fix A — per-deal agency subset filtering", () => {
  it("A2 — Euro XV tranche-derivation: ratingAgencies === ['moodys', 'fitch'] (no S&P)", () => {
    // Euro XV is rated by Moody's and Fitch only (oc.txt:368-369). The
    // tranche capital-structure rating columns reflect this — only fitch
    // and moodys sub-fields are populated; sp is absent everywhere. The
    // strict (capital-structure-only) derivation in the resolver's
    // ratingAgencies block must surface this exactly.
    const raw = loadRaw();
    const { resolved } = runResolver(raw);
    expect(resolved.ratingAgencies).toEqual(["moodys", "fitch"]);
  });

  it("A3b — empty derived set fires BLOCKING warn (anti-pattern #3 silent-fallback closure)", () => {
    // Capital structure carries no rating columns at all (extraction
    // failure on every rating sub-field). Pre-fix the warning was gated on
    // `anyTrancheRatingDataPresent`, so the empty-set case fired NO warning
    // at all and silently emitted `ratingAgencies = []`. The engine's
    // `resolveAgencyRecovery` then returned undefined for every loan and
    // the forward-default site fell back to the global recoveryPct.
    // Post-fix: blocking error, every CLO has ≥ 1 Rating Agency by design.
    const raw = loadRaw();
    for (const tr of raw.constraints.capitalStructure ?? []) {
      if (tr.rating) {
        delete tr.rating.moodys;
        delete tr.rating.sp;
        delete tr.rating.fitch;
      }
    }
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.ratingAgencies).toEqual([]);
    const w = warnings.find((w) => w.field === "ratingAgencies");
    expect(w, "Expected ratingAgencies empty-set blocking warning").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
  });

  it("A3 — degenerate-set warn fires when capital structure has < 2 agencies populated", () => {
    // Mutate the fixture so capital structure rating columns drop Moody's
    // (extraction-gap shape). Resolver's safety-net warning should fire:
    // anti-pattern #3 surface (severity:error, non-blocking) — single-
    // agency sets are uncommon for European CLOs and likely indicate an
    // extraction failure on one rating column.
    const raw = loadRaw();
    for (const tr of raw.constraints.capitalStructure ?? []) {
      if (tr.rating) {
        delete tr.rating.moodys;
      }
    }
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.ratingAgencies).toEqual(["fitch"]);
    const w = warnings.find((w) => w.field === "ratingAgencies");
    expect(w, "Expected ratingAgencies degenerate-set warning").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(false);
  });
});

describe("Sub-fix B — per-agency MV floor BEFORE cross-agency min", () => {
  // Closure-time correctness pin; this assertion replaces what would have
  // been a pre-fix
  // `failsWithMagnitude` marker). Castle US Holding fixture: par=2,606,665,
  // MV=41.4, M=45, F=null. Pre-fix engine credited 1,172,999.25
  // (par × min(M=45)/100); post-fix credits 1,079,159.31 (par ×
  // min(min(M=45, MV=41.4))/100). Latent magnitude on Euro XV at the
  // 2026-04-01 cycle: €93,840 single-position cap (only position where
  // MV < min(present agency RRs)).
  it("B — Castle US fixture: MV < min(present agency RRs) → MV becomes the floor (€1,079,159.31)", () => {
    const raw = loadRaw();
    const template = raw.holdings[0];
    raw.holdings.unshift(
      makeDefaultedHolding(template, {
        obligorName: "Castle US Holding Corporation",
        principalBalance: 2_606_665,
        parBalance: 2_606_665,
        currentPrice: 41.4,
        recoveryRateMoodys: 45,
        recoveryRateSp: null,
        recoveryRateFitch: null,
        defaultDate: "2025-12-01",
      }),
    );
    const { resolved } = runResolver(raw);
    // PPM-correct: par × min(min(MV=41.4, M=45)) / 100 = 2,606,665 × 0.414 = 1,079,159.31
    expect(resolved.preExistingDefaultOcValue).toBeCloseTo(1_079_159.31, 1);
    // Pre-fix shape would have credited 2,606,665 × 0.45 = 1,172,999.25 — the
    // €93,840 delta IS the latent overstatement sub-fix B closes.
  });

  it("B — MV-not-binding case: MV > min(agency RRs) → cross-agency min unchanged", () => {
    // Tele Columbus shape: M=35, F=60, MV=58.5. min(M=35) is below MV;
    // the floor doesn't bite. Pre-fix and post-fix both credit
    // par × 0.35. This pins the floor's directionality (only when
    // MV is binding does the credit change).
    const raw = loadRaw();
    const template = raw.holdings[0];
    raw.holdings.unshift(
      makeDefaultedHolding(template, {
        obligorName: "Tele Columbus AG (synthetic defaulted)",
        principalBalance: 1_000_000,
        parBalance: 1_000_000,
        currentPrice: 58.5,
        recoveryRateMoodys: 35,
        recoveryRateSp: null,
        recoveryRateFitch: 60,
        defaultDate: "2025-12-01",
      }),
    );
    const { resolved } = runResolver(raw);
    // par × min(min(MV=58.5, M=35), min(MV=58.5, F=60)) / 100 =
    // 1,000,000 × min(35, 58.5) / 100 = 350,000.
    expect(resolved.preExistingDefaultOcValue).toBeCloseTo(350_000, 1);
  });
});

describe("Sub-fix C — 3-year stale-default zero-out", () => {
  it("C1 — defaulted >3 years → preExistingDefaultOcValue contribution is 0", () => {
    // Determination date is 2026-04-01 per the fixture's reportDate.
    // Set defaultDate to 2022-01-01 (> 3 years prior) and assert the
    // holding contributes 0 to the OC numerator regardless of agency
    // rates and MV.
    const raw = loadRaw();
    const template = raw.holdings[0];
    raw.holdings.unshift(
      makeDefaultedHolding(template, {
        obligorName: "Stale Default Co",
        principalBalance: 5_000_000,
        parBalance: 5_000_000,
        currentPrice: 50,
        recoveryRateMoodys: 60,
        recoveryRateSp: null,
        recoveryRateFitch: 65,
        defaultDate: "2022-01-01", // 4y+ before reportDate=2026-04-01
      }),
    );
    const { resolved } = runResolver(raw);
    // The stale-defaulted holding contributes 0 — total OC value is 0.
    expect(resolved.preExistingDefaultOcValue).toBe(0);
    // Defaulted par still counts (the holding is still defaulted; only
    // its OC numerator credit is zeroed).
    expect(resolved.preExistingDefaultedPar).toBeCloseTo(5_000_000, 0);
  });

  it("C2 — defaultDate missing → lenient (full RR applies) AND error/non-blocking warn fires", () => {
    // CLAUDE.md anti-pattern #3 + sub-fix C: a defaulted holding
    // with no defaultDate is a computational-input gap (the 3-year
    // stale-default predicate cannot evaluate). Lenient default applies
    // (treat as not-stale, full agency/MV credit); resolver emits
    // severity:error, blocking:false so the gap is loud without refusing
    // the projection.
    const raw = loadRaw();
    const template = raw.holdings[0];
    raw.holdings.unshift(
      makeDefaultedHolding(template, {
        obligorName: "Missing-DefaultDate Co",
        principalBalance: 1_000_000,
        parBalance: 1_000_000,
        currentPrice: 50,
        recoveryRateMoodys: 60,
        recoveryRateSp: null,
        recoveryRateFitch: 65,
        defaultDate: null,
      }),
    );
    const { resolved, warnings } = runResolver(raw);
    // Lenient: par × min(min(MV=50, M=60), min(MV=50, F=65)) / 100 =
    // 1,000,000 × 50 / 100 = 500,000. The MV floor is binding here;
    // sub-fix B applies even when staleness can't be evaluated.
    expect(resolved.preExistingDefaultOcValue).toBeCloseTo(500_000, 1);
    const w = warnings.find(
      (w) =>
        w.field === "holdings.defaultDate" &&
        /Missing-DefaultDate Co/.test(w.message),
    );
    expect(w, "Expected defaultDate missing warning").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(false);
  });

  it("C — same-PR cleanup: all-signals-missing on defaulted holding emits error/non-blocking warn", () => {
    // The fallback cascade's all-missing branch (resolver.ts) — pre-fix
    // this silently credited 0 with no warning, an anti-pattern #3 sibling
    // violation in the same reducer block. Now emits severity:error,
    // non-blocking so the partner sees the data gap loudly while the
    // projection runs (the position is just absent from the OC numerator).
    const raw = loadRaw();
    const template = raw.holdings[0];
    raw.holdings.unshift(
      makeDefaultedHolding(template, {
        obligorName: "All-Signals-Missing Co",
        principalBalance: 1_000_000,
        parBalance: 1_000_000,
        currentPrice: null,
        recoveryRateMoodys: null,
        recoveryRateSp: null,
        recoveryRateFitch: null,
        defaultDate: "2025-12-01",
      }),
    );
    const { resolved, warnings } = runResolver(raw);
    // No agency rates AND no MV → 0 contribution. Same numeric outcome as
    // pre-fix (silent zero); the marker is the warning's existence.
    expect(resolved.preExistingDefaultOcValue).toBe(0);
    const w = warnings.find(
      (w) =>
        w.field === "holdings.recoveryAndMV" &&
        /All-Signals-Missing Co/.test(w.message),
    );
    expect(w, "Expected all-signals-missing warning").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(false);
  });
});

describe("S&P-rated deal — any-tagged compliance gate (KI-65 closure marker)", () => {
  it("zero S&P-tagged tests fires BLOCKING spTriggers warning when capital structure carries S&P rating", () => {
    // Mutate the fixture so capital structure carries an S&P rating but no
    // compliance test row mentions S&P. The C1 gate refuses to project
    // rather than silently running with no S&P-specific enforcement.
    // Per-canonical-trigger granularity (sp_recovery, sp_ccc_concentration,
    // etc.) waits on a US CLO PPM in scope; the any-tagged gate closes the
    // silent-projection shape today.
    const raw = loadRaw();
    for (const tr of raw.constraints.capitalStructure ?? []) {
      if (tr.rating) {
        tr.rating.sp = "AAA";
      }
    }
    const { warnings } = runResolver(raw);
    const w = warnings.find((w) => w.field === "spComplianceTests");
    expect(w, "Expected spTriggers blocking warning on S&P-rated deal with zero S&P-tagged tests").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
  });

  it("cross-reference exclusion — 'derived from S&P' in a Moody's test name does NOT misclassify as S&P-rated", () => {
    // The fixture has no S&P in capital structure. The only path to
    // `isSpRated = true` is via test-name matching. The exclusion regex
    // covers cross-reference shapes (derived from / based on / vs / etc.)
    // so a Moody's test that mentions S&P as a cross-reference does NOT
    // make the deal "S&P-rated." Without the exclusion, every Fitch+Moody's
    // deal whose Moody's compliance row references S&P would block at runtime.
    const raw = loadRaw();
    // Inject the cross-reference shape into a quality test row (testType
    // among WARF/WAL/WAS/DIVERSITY/RECOVERY → flows into qualityTests).
    const qt = raw.complianceData?.complianceTests?.find((t: { testType?: string }) =>
      t.testType && ["WARF", "WAL", "WAS", "DIVERSITY", "RECOVERY"].includes(t.testType),
    );
    if (qt) qt.testName = "Moody's Rating derived from S&P";
    const { warnings } = runResolver(raw);
    const wSp = warnings.find((w) => w.field === "spComplianceTests");
    expect(wSp, "spComplianceTests warning should NOT fire on cross-reference shape").toBeUndefined();
    const wAsym = warnings.find((w) => w.field === "ratingAgencies.asymmetry");
    expect(wAsym, "asymmetry warning should NOT fire on cross-reference shape").toBeUndefined();
  });
});

describe("Permissive-vs-strict rating-agency asymmetry — silent-fallback closure", () => {
  it("isSpRated true via compliance test but cap structure missing S&P → BLOCKING asymmetry warning", () => {
    // Failure shape: capital structure tranche extraction missed the S&P
    // rating column (so `ratingAgencies` excludes "sp"), but a compliance
    // test row clearly identifies the deal as S&P-rated (so `isSpRated`
    // is true via the test-name path). The C1 gate would pass (S&P-tagged
    // test exists), and the OC numerator would silently drop S&P recovery
    // rates from the per-agency min on every defaulted holding — wrong
    // number, no loud signal. The asymmetry guard catches this.
    const raw = loadRaw();
    // Strip S&P from cap structure (already absent on Euro XV) — confirm the
    // baseline stays clean before injecting the asymmetric signal.
    for (const tr of raw.constraints.capitalStructure ?? []) {
      if (tr.rating) delete tr.rating.sp;
    }
    // Inject a clear S&P-tagged compliance test row in the quality-test set
    // (testType WARF/WAL/WAS/DIVERSITY/RECOVERY flows into qualityTests).
    const qt = raw.complianceData?.complianceTests?.find((t: { testType?: string }) =>
      t.testType && ["WARF", "WAL", "WAS", "DIVERSITY", "RECOVERY"].includes(t.testType),
    );
    if (qt) qt.testName = "S&P CDO Monitor Test";
    const { resolved, warnings } = runResolver(raw);
    expect(resolved.ratingAgencies).not.toContain("sp");
    const w = warnings.find((w) => w.field === "ratingAgencies.asymmetry");
    expect(w, "Expected asymmetry blocking warning on isSpRated/ratingAgencies divergence").toBeDefined();
    expect(w!.severity).toBe("error");
    expect(w!.blocking).toBe(true);
    expect(w!.message).toMatch(/sp/);
  });
});

