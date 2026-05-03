import type { ResolvedDealData, ResolutionWarning } from "./resolver-types";
import type { ProjectionInputs } from "./projection";
import type { IntexAssumptions } from "./intex/parse-past-cashflows";
import { CLO_DEFAULTS } from "./defaults";
import { DEFAULT_RATES_BY_RATING } from "./rating-mapping";

// Empty resolved data — used when no deal data has been loaded yet.
// Produces a ProjectionInputs that will fail validation (initialPar = 0)
// but won't crash. This eliminates the need for a separate safe-default
// code path in the UI component.
export const EMPTY_RESOLVED: ResolvedDealData = {
  tranches: [],
  poolSummary: {
    totalPar: 0, totalPrincipalBalance: 0, wacSpreadBps: 0, warf: 0, walYears: 0, diversityScore: 0, numberOfObligors: 0,
    numberOfAssets: null, totalMarketValue: null, waRecoveryRate: null,
    pctFixedRate: null, pctCovLite: null, pctPik: null, pctCccAndBelow: null,
    pctBonds: null, pctSeniorSecured: null, pctSecondLien: null, pctCurrentPay: null,
    top10ObligorsPct: null,
  },
  ocTriggers: [],
  icTriggers: [],
  qualityTests: [],
  concentrationTests: [],
  reinvestmentOcTrigger: null,
  eventOfDefaultTest: null,
  dates: { maturity: "", reinvestmentPeriodEnd: null, nonCallPeriodEnd: null, firstPaymentDate: null, currentDate: new Date().toISOString().slice(0, 10) },
  fees: { seniorFeePct: 0, subFeePct: 0, trusteeFeeBps: 0, incentiveFeePct: 0, incentiveFeeHurdleIrr: 0 },
  loans: [],
  metadata: { reportDate: null, dataSource: null, sdfFilesIngested: [], pdfExtracted: [] },
  principalAccountCash: 0,
  interestAccountCash: 0,
  interestSmoothingBalance: 0,
  supplementalReserveBalance: 0,
  expenseReserveBalance: 0,
  preExistingDefaultedPar: 0,
  preExistingDefaultRecovery: 0,
  unpricedDefaultedPar: 0,
  preExistingDefaultOcValue: 0,
  discountObligationHaircut: 0,
  longDatedObligationHaircut: 0,
  cccBucketLimitPct: null,
  cccMarketValuePct: null,
  targetParAmount: null,
  referenceWeightedAverageFixedCoupon: null,
  isMoodysRated: false,
  isFitchRated: false,
  impliedOcAdjustment: 0,
  quartersSinceReport: 0,
  ddtlUnfundedPar: 0,
  deferredInterestCompounds: true,
  interestNonPaymentGracePeriods: null,
  baseRateFloorPct: null,
  currency: null,
};

export interface UserAssumptions {
  baseRatePct: number;
  baseRateFloorPct: number;
  defaultRates: Record<string, number>;
  /** D2b — Rating buckets whose `defaultRates` slider the user has touched.
   *  These override per-position WARF hazard for every loan in the bucket.
   *  Buckets absent from this list keep per-position WARF (D2 default). */
  overriddenBuckets: string[];
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
  reinvestmentTenorYears: number;
  reinvestmentRating: string | null;
  cccBucketLimitPct: number;
  cccMarketValuePct: number;
  deferredInterestCompounds: boolean;
  postRpReinvestmentPct: number;
  hedgeCostBps: number;
  /** Q1 disposition of the Supplemental Reserve opening balance. Modeling
   *  assumption — PPM Condition 3(j)(vi) gives the Collateral Manager open-
   *  ended discretion across eight Permitted Uses, so this is exposed as a
   *  user choice rather than auto-routed. Default "principalCash" mirrors
   *  the existing `initialPrincipalCash` Q1 routing (RP→reinvestment,
   *  post-RP→senior paydown), the manager-incentive-aligned canonical case. */
  supplementalReserveDisposition: "principalCash" | "interest" | "hold";
  /** Manager-call gating (post-v6 plan §4.1). Default "none" so the engine
   *  projects to legal final unless the user explicitly chooses to model a
   *  call. The Phase A type union excludes "economic" mode (Phase D §7.4). */
  callMode: "none" | "optionalRedemption";
  callDate: string | null;
  callPricePct: number; // liquidation price % of par; only used when callPriceMode === "manual"
  /** Call-liquidation pricing (post-v6 plan §4.1):
   *   'par': every position sells at face value
   *   'market': every position sells at observed currentPrice; throws when missing
   *   'manual': every position sells at callPricePct (flat % of par)
   */
  callPriceMode: "par" | "market" | "manual";
  ddtlDrawAssumption: 'draw_at_deadline' | 'never_draw' | 'custom_quarter';
  ddtlDrawQuarter: number;
  ddtlDrawPercent: number;
  // Fee overrides — user can adjust these via sliders.
  // Pre-filled from resolved PPM data, but user has final say.
  seniorFeePct: number;
  subFeePct: number;
  /** PPM step (A)(i) Issuer taxes, in bps p.a. on collateral par.
   *  Deducted before trustee fees. Back-derived from Q1 waterfall step
   *  (A)(i) via `defaultsFromResolved`. Euro XV: ~0.50 bps (€6,133 quarterly). */
  taxesBps: number;
  /** PPM step (A)(ii) Issuer Profit Amount. Absolute € per period.
   *  €250 regular, €500 post-Frequency-Switch on Euro XV. Back-derived from
   *  Q1 waterfall step (A)(ii) via `defaultsFromResolved`. */
  issuerProfitAmount: number;
  /** C3 — Trustee fee bps on Collateral Principal Amount, per annum. Paid
   *  at PPM step (B). Jointly subject to Senior Expenses Cap with adminFeeBps;
   *  overflow routes to uncapped step (Y). */
  trusteeFeeBps: number;
  /** C3 — Administrative fee bps on Collateral Principal Amount, per annum.
   *  Paid at PPM step (C). Jointly capped with trustee fee at
   *  `seniorExpensesCapBps`; overflow routes to uncapped step (Z). */
  adminFeeBps: number;
  /** C3 — Senior Expenses Cap as bps on Collateral Principal Amount, per
   *  annum. Jointly bounds trustee + admin fee emission. Overflow (above
   *  the cap) routes to PPM steps (Y) and (Z). Default derived from Q1
   *  actuals via `defaultsFromResolved`; max(2× observed, 20 bps). */
  seniorExpensesCapBps: number;
  incentiveFeePct: number;
  incentiveFeeHurdleIrr: number; // as percentage (e.g. 12 for 12%), converted to decimal internally
  // Equity (sub note) entry price in cents of sub note par. Used for secondary-
  // market IRR calc. When set, buildFromResolved converts to an absolute €
  // cost basis = subNotePar × (equityEntryPriceCents / 100). Null = fall back
  // to engine default (bookValue).
  equityEntryPriceCents: number | null;
}

export const DEFAULT_ASSUMPTIONS: UserAssumptions = {
  baseRatePct: CLO_DEFAULTS.baseRatePct,
  baseRateFloorPct: CLO_DEFAULTS.baseRateFloorPct,
  defaultRates: { ...DEFAULT_RATES_BY_RATING },
  overriddenBuckets: [],
  cprPct: CLO_DEFAULTS.cprPct,
  recoveryPct: CLO_DEFAULTS.recoveryPct,
  recoveryLagMonths: CLO_DEFAULTS.recoveryLagMonths,
  reinvestmentSpreadBps: CLO_DEFAULTS.reinvestmentSpreadBps,
  reinvestmentTenorYears: CLO_DEFAULTS.reinvestmentTenorYears,
  reinvestmentRating: null,
  cccBucketLimitPct: CLO_DEFAULTS.cccBucketLimitPct,
  cccMarketValuePct: CLO_DEFAULTS.cccMarketValuePct,
  deferredInterestCompounds: true,
  postRpReinvestmentPct: 0,
  hedgeCostBps: 0,
  supplementalReserveDisposition: "principalCash",
  callMode: "none",
  callDate: null,
  callPricePct: 100,
  callPriceMode: "par",
  ddtlDrawAssumption: 'draw_at_deadline' as const,
  ddtlDrawQuarter: CLO_DEFAULTS.ddtlDrawQuarter,
  ddtlDrawPercent: CLO_DEFAULTS.ddtlDrawPercent,
  seniorFeePct: CLO_DEFAULTS.seniorFeePct,
  subFeePct: CLO_DEFAULTS.subFeePct,
  taxesBps: 0,
  issuerProfitAmount: 0,
  trusteeFeeBps: CLO_DEFAULTS.trusteeFeeBps,
  adminFeeBps: 0,
  // Conservative static default when Q1 actuals aren't available.
  // `defaultsFromResolved` computes max(2× observed, 20 bps) when it can.
  seniorExpensesCapBps: 20,
  incentiveFeePct: CLO_DEFAULTS.incentiveFeePct,
  incentiveFeeHurdleIrr: CLO_DEFAULTS.incentiveFeeHurdleIrr,
  equityEntryPriceCents: null,
};

/**
 * Shape of the `raw` data `defaultsFromResolved` needs. Intentionally narrow:
 * only the fields required to pre-fill observable assumptions. Accepts the full
 * context.json raw shape as well as the per-field subset the UI assembles.
 */
export interface DefaultsFromResolvedRaw {
  trancheSnapshots?: Array<{ currentIndexRate?: number | null } | null> | null;
  waterfallSteps?: Array<{
    description?: string | null;
    amountPaid?: number | null;
    waterfallType?: string | null;
  } | null> | null;
}

/**
 * D3 pre-fill family — returns a `UserAssumptions` with observable values
 * pulled from resolver output and raw trustee data, falling back to
 * `DEFAULT_ASSUMPTIONS` per field when signal isn't available.
 *
 * Priority per field:
 *   - `baseRatePct` ← observed EURIBOR from `raw.trancheSnapshots[*].currentIndexRate`,
 *     else `DEFAULT_ASSUMPTIONS.baseRatePct` (2.1%).
 *   - `seniorFeePct` / `subFeePct` / `incentiveFeePct` / `incentiveFeeHurdleIrr`
 *     ← resolver's PPM extraction (`resolved.fees.*`), else default.
 *     (fee-rate plumbing; the ~€22.35M fee-BASE
 *     discrepancy is KI-12a's harness mismatch, not fixed here).
 *   - `trusteeFeeBps` ← if PPM gave a non-zero extraction use it; else
 *     back-derive from `raw.waterfallSteps` B + C annualized on beginning par.
 *     Partial-close of KI-08 (pre-fill only; Senior Expenses Cap + overflow
 *     at steps Y/Z remains Sprint 3 / C3).
 *   - `baseRateFloorPct` ← `resolved.baseRateFloorPct` if set.
 *
 * All other assumption fields inherit from `DEFAULT_ASSUMPTIONS`.
 */
export function defaultsFromResolved(
  resolved: ResolvedDealData,
  raw: DefaultsFromResolvedRaw | null | undefined,
): UserAssumptions {
  const base: UserAssumptions = { ...DEFAULT_ASSUMPTIONS };

  // baseRate ← observed EURIBOR from trancheSnapshots
  const observedBaseRate = raw?.trancheSnapshots?.find(
    (s) => s && s.currentIndexRate != null,
  )?.currentIndexRate;
  if (observedBaseRate != null) base.baseRatePct = observedBaseRate;

  // Floor from resolver if deal-specific
  if (resolved.baseRateFloorPct != null) base.baseRateFloorPct = resolved.baseRateFloorPct;

  // CCC haircut params from PPM. Null shouldn't reach here at runtime — the
  // buildFromResolved blocking-warning gate refuses first — but the conditional
  // matches the pattern used for every other resolved-derived override and
  // keeps the function decoupled from gate assumptions.
  if (resolved.cccBucketLimitPct != null) base.cccBucketLimitPct = resolved.cccBucketLimitPct;
  if (resolved.cccMarketValuePct != null) base.cccMarketValuePct = resolved.cccMarketValuePct;

  // Senior / sub mgmt fees + incentive fees ← resolver PPM extraction
  const f = resolved.fees;
  if (f.seniorFeePct > 0) base.seniorFeePct = f.seniorFeePct;
  if (f.subFeePct > 0) base.subFeePct = f.subFeePct;
  if (f.incentiveFeePct > 0) base.incentiveFeePct = f.incentiveFeePct;
  if (f.incentiveFeeHurdleIrr > 0) base.incentiveFeeHurdleIrr = f.incentiveFeeHurdleIrr * 100;

  // Trustee + admin fees + taxes: back-derive from Q1 waterfall steps.
  // C3 split trustee/admin separately; taxes (step A.i) added thereafter.
  const findStep = (code: string) =>
    raw?.waterfallSteps?.find(
      (s) =>
        s &&
        s.waterfallType === "INTEREST" &&
        s.description != null &&
        new RegExp(`^\\(?${code}\\)?\\b`, "i").test(s.description),
    );
  // Step (A)(i) for taxes — description format "(A)(i)" or "A.i" varies.
  const findAi = () =>
    raw?.waterfallSteps?.find(
      (s) =>
        s &&
        s.waterfallType === "INTEREST" &&
        s.description != null &&
        /^\(?a\)?\s*\(?i\)?\b|^a\.i\b/i.test(s.description),
    );
  // Step (A)(ii) for issuer profit — same format tolerance as (A)(i).
  const findAii = () =>
    raw?.waterfallSteps?.find(
      (s) =>
        s &&
        s.waterfallType === "INTEREST" &&
        s.description != null &&
        /^\(?a\)?\s*\(?ii\)?\b|^a\.ii\b/i.test(s.description),
    );
  const stepAi = findAi();
  const stepAii = findAii();
  const stepB = findStep("B");
  const stepC = findStep("C");
  const beginPar = resolved.poolSummary.totalPrincipalBalance;

  // Taxes back-derive.
  if (stepAi && beginPar > 0) {
    const bps = ((stepAi.amountPaid ?? 0) * 4 * 10000) / beginPar;
    // Sanity bound: 0 < bps < 10 is plausible for issuer taxes.
    if (bps > 0 && bps < 10) base.taxesBps = bps;
  }

  // Issuer profit back-derive. Fixed absolute € per period (€250
  // regular, €500 post-Frequency-Switch on Euro XV). Sanity bound: €0–€1000
  // covers both periodic amounts with generous headroom; caps pathological
  // extractions without rejecting real values.
  if (stepAii) {
    const amount = stepAii.amountPaid ?? 0;
    if (amount > 0 && amount < 1000) base.issuerProfitAmount = amount;
  }

  if (f.trusteeFeeBps > 0) {
    base.trusteeFeeBps = f.trusteeFeeBps;
  } else if (stepB && beginPar > 0) {
    const bps = ((stepB.amountPaid ?? 0) * 4 * 10000) / beginPar;
    if (bps > 0 && bps < 50) base.trusteeFeeBps = bps;
  }
  // Admin fee: resolver doesn't currently extract a dedicated field (PPM
  // typically lists "Administrative Expenses" as "per agreement"), so we
  // always back-derive from step C when raw waterfall is available.
  if (stepC && beginPar > 0) {
    const bps = ((stepC.amountPaid ?? 0) * 4 * 10000) / beginPar;
    if (bps > 0 && bps < 50) base.adminFeeBps = bps;
  }

  // C3 Senior Expenses Cap default: max(2× observed combined, 20 bps).
  // The PPM cap itself isn't in raw (deal-specific; trustee report doesn't
  // publish the cap number, only the actuals). Observed rate is a hard floor.
  if (stepB && stepC && beginPar > 0) {
    const observedRateBps = (((stepB.amountPaid ?? 0) + (stepC.amountPaid ?? 0)) * 4 * 10000) / beginPar;
    base.seniorExpensesCapBps = Math.max(observedRateBps * 2, 20);
  }

  return base;
}

/**
 * T4 — Apply Intex DealCF-MV+ scenario inputs as a higher-precedence overlay
 * on top of `defaultsFromResolved`. Intex publishes the exact CPR/CDR/Recovery/
 * reinvestment assumptions used to produce its past-cashflow projection, so
 * pre-filling the engine with these inputs lets engine output be compared
 * apples-to-apples against the Intex distributions.
 *
 * Coverage (only fields Intex publishes):
 *   cprPct, recoveryPct, recoveryLagMonths, reinvestmentSpreadBps,
 *   reinvestmentTenorYears, plus per-rating defaultRates flat-set to cdrPct
 *   when the user hasn't touched buckets (CDR is a pool aggregate; map flat).
 *
 * Returns the input assumptions unchanged when `intex` is null.
 */
export function defaultsFromIntex(
  base: UserAssumptions,
  intex: IntexAssumptions | null,
): UserAssumptions {
  if (!intex) return base;
  const next: UserAssumptions = { ...base };

  if (intex.cprPct != null) next.cprPct = intex.cprPct;
  if (intex.recoveryPct != null) next.recoveryPct = intex.recoveryPct;
  if (intex.recoveryLagMonths != null) next.recoveryLagMonths = intex.recoveryLagMonths;
  if (intex.reinvestSpreadPct != null) {
    next.reinvestmentSpreadBps = Math.round(intex.reinvestSpreadPct * 100);
  }
  if (intex.reinvestMaturityMonths != null) {
    next.reinvestmentTenorYears = intex.reinvestMaturityMonths / 12;
  }
  // Intex CDR is a pool-level aggregate; broadcast to every rating bucket
  // when the user hasn't customised them. Per-position WARF stays the
  // engine default for any bucket the user later touches.
  if (intex.cdrPct != null) {
    const rates: Record<string, number> = {};
    for (const k of Object.keys(next.defaultRates)) rates[k] = intex.cdrPct;
    next.defaultRates = rates;
  }

  return next;
}

/**
 * Emits partner-visible warnings when the fee pre-fill data is incomplete.
 * Separate from `defaultsFromResolved` so the test callers (12+ suites) keep
 * their simple signature, and production callers (ProjectionModel) can
 * surface the warnings in the UI's warnings panel rather than stderr.
 *
 * The only gate today catches "pre-fill found trustee step (B) but NOT admin
 * step (C)", which silently sets `adminFeeBps: 0`. Downstream this makes
 * the Senior Expenses Cap apply to only half the expense — partner-visible
 * wrong math on stress scenarios. Gate tests the actual data condition, not
 * a magnitude threshold: a threshold like "trusteeFeeBps > 10 bps" creates
 * a false-negative at Euro XV scale (combined ~5.24 bps, well under 10).
 * Sub-0.5 bps on trustee prevents false-fires on zero-fee deals where both
 * steps are legitimately absent.
 */
export function diagnoseFeePrefill(
  resolved: ResolvedDealData,
  raw: DefaultsFromResolvedRaw | null | undefined,
  assumptions: UserAssumptions,
): ResolutionWarning[] {
  const warnings: ResolutionWarning[] = [];

  const hasWaterfall = (raw?.waterfallSteps?.length ?? 0) > 0;
  if (!hasWaterfall) return warnings;

  const findStep = (code: string) =>
    raw?.waterfallSteps?.find(
      (s) =>
        s &&
        s.waterfallType === "INTEREST" &&
        s.description != null &&
        new RegExp(`^\\(?${code}\\)?\\b`, "i").test(s.description),
    );
  const stepB = findStep("B");
  const stepC = findStep("C");

  // The admin pre-fill source is missing: pre-fill found step (B) trustee
  // but no step (C) admin in raw.waterfallSteps. Trustee is present (not a
  // zero-fee deal), so the missing (C) is a data gap — adminFeeBps silently
  // stays 0 and the Senior Expenses Cap applies to only the trustee portion.
  if (stepB && !stepC && assumptions.trusteeFeeBps > 0.5) {
    warnings.push({
      field: "assumptions.adminFeeBps",
      message:
        `Fee pre-fill found PPM step (B) trustee but no step (C) admin in waterfall data — ` +
        `adminFeeBps defaulted to 0. Senior Expenses Cap will apply to only the trustee ` +
        `half of senior expenses. Verify raw.waterfallSteps contains a separate step (C) ` +
        `row for admin expenses, or set adminFeeBps manually to match the PPM "per ` +
        `agreement" rate.`,
      severity: "warn",
      blocking: false,
      resolvedFrom: `stepB present (${(stepB.amountPaid ?? 0).toFixed(0)}) / stepC missing`,
    });
  }

  return warnings;
}

/**
 * Single source of truth for "which warnings refuse the projection."
 * The buildFromResolved gate uses this; the UI's DATA INCOMPLETE banner
 * also uses this. Bijection-by-construction: the gate's input set IS the
 * banner's row set. Drift (one filters, the other doesn't) is impossible
 * because the predicate lives in one place. Enforced by the AST-scan
 * test in `incomplete-data-banner-bijection.test.ts`.
 */
export function selectBlockingWarnings(
  warnings: ResolutionWarning[],
): ResolutionWarning[] {
  return warnings.filter((w) => w.blocking === true);
}

/**
 * Thrown by `buildFromResolved` when any `ResolutionWarning` carries
 * `blocking: true` — i.e. an extraction-side gap whose downstream
 * arithmetic the engine cannot perform without a wrong number. Caller
 * (UI layer) catches this and renders a "DATA INCOMPLETE" banner
 * enumerating the blocking warnings rather than running the projection.
 */
export class IncompleteDataError extends Error {
  constructor(public readonly errors: ResolutionWarning[]) {
    super(
      `Projection refused: ${errors.length} blocking warning(s) — ${errors.map((e) => e.field).join(", ")}`,
    );
    this.name = "IncompleteDataError";
  }
}

/**
 * Returns caller-supplied warnings composed with per-tranche data-shape
 * gates evaluated against the resolved object. The full composed set
 * (blocking AND non-blocking) is observable via this function, since
 * `IncompleteDataError` carries only the blocking subset — partner-
 * facing UX surfaces (banner, advisory list) and tests that pin
 * non-blocking soft-warn emission read through here.
 *
 * Caller warnings appear first, then per-tranche checks in stable order.
 */
export function composeBuildWarnings(
  resolved: ResolvedDealData,
  userAssumptions: UserAssumptions,
  callerWarnings: ResolutionWarning[] = [],
): ResolutionWarning[] {
  const composedWarnings: ResolutionWarning[] = [...callerWarnings];

  // Per-tranche data-shape gates. Each emits a ResolutionWarning rather
  // than throwing — partner-facing UX is the DATA INCOMPLETE banner via
  // `selectBlockingWarnings` → `IncompleteDataError`, never a stack
  // trace. The engine carries lightweight backstop asserts on the same
  // invariants for code paths that bypass this gate.
  //
  //   (a)  DISJOINTNESS — `deferredInterestBalance != null` only on
  //        deferrable tranches. Non-deferrables breach EoD on missed
  //        interest per PPM § 10(a)(i); they cannot accumulate to a
  //        deferred bucket.
  //   (a') BOUNDARY INVARIANT — `dib >= 0` (claims are non-negative);
  //        `dib > 0 → currentBalance > 0` (extinct on paid-off tranches).
  //   (b)  THRESHOLD under compounding — `dib <= currentBalance` is
  //        mathematical when PPM 6(c) adds Deferred Interest to PAO,
  //        because PAO includes the deferred amount. A value above
  //        currentBalance is impossible under any benign reading;
  //        cause is extraction misalignment.
  //   (b') SOFT CAUSE-TREE — populated value under compounding is
  //        benign-or-suspicious depending on cause. Engine ignores
  //        the value (PIK is already in currentBalance under
  //        compounding); banner enumerates the three plausible causes
  //        so the partner-facing investigator doesn't re-derive them.
  //   (c)  SHORTFALL-SEED MISUSE — `priorInterestShortfall` /
  //        `priorShortfallCount` are non-deferrable-senior-only state
  //        per PPM § 10(a)(i). On a deferrable / amortising / income-
  //        note tranche the seeds either silently produce wrong post-
  //        accel handoff claims or feed deferred state via the wrong
  //        path; refuse the projection.
  const compounds =
    userAssumptions.deferredInterestCompounds ?? resolved.deferredInterestCompounds;
  for (const t of resolved.tranches) {
    const dib = t.deferredInterestBalance;

    // (a) and (a') are INDEPENDENT — a non-deferrable tranche with a
    // negative dib violates two invariants (wrong tranche assignment AND
    // sign-convention error); both warnings fire so the partner sees
    // every root cause, not just the first to trip the gate.

    // (a) Disjointness — deferred bucket on a non-deferrable tranche.
    if (dib != null && !t.isDeferrable) {
      composedWarnings.push({
        field: `tranches.${t.className}.deferredInterestBalance`,
        message:
          `Tranche "${t.className}" is non-deferrable but carries ` +
          `deferredInterestBalance=${dib}. Non-deferrables breach EoD on missed ` +
          `interest per PPM § 10(a)(i); they cannot accumulate to a deferred ` +
          `bucket. Likely cause: extraction misalignment (LLM read the wrong ` +
          `column or the snapshot was attached to the wrong tranche). Fix the ` +
          `extraction or set the field to null.`,
        severity: "error",
        blocking: true,
      });
    }

    // (a') Sign-convention boundary invariant — fires regardless of
    // tranche type. A negative trustee value would silently reduce
    // claims; the boundary refuses regardless of whether the value is
    // also misplaced on a non-deferrable tranche.
    if (dib != null && dib < 0) {
      composedWarnings.push({
        field: `tranches.${t.className}.deferredInterestBalance`,
        message:
          `Tranche "${t.className}": deferredInterestBalance=${dib} is negative. ` +
          `Deferred Interest is a non-negative claim against the Issuer; a ` +
          `negative value would silently reduce the amount owed to noteholders. ` +
          `Likely cause: extraction sign-convention error (some trustees report ` +
          `claims as negative; the boundary should canonicalize to non-negative). ` +
          `Fix the extraction.`,
        severity: "error",
        blocking: true,
      });
    }

    // The remaining dib-related gates (a''), (b), (b') are scoped to
    // deferrable tranches with a non-null value — under that scope
    // (a''), (b), (b') are mutually exclusive structural conditions on
    // the same field, so they share an if/else if ladder.
    if (t.isDeferrable && dib != null) {
      // (a'') Paid-off — positive value on a tranche with no remaining
      // principal. Deferred claim is extinguished once PAO reaches zero.
      if (dib > 0 && t.currentBalance <= 0) {
        composedWarnings.push({
          field: `tranches.${t.className}.deferredInterestBalance`,
          message:
            `Tranche "${t.className}": deferredInterestBalance=${dib} on a paid-off ` +
            `tranche (currentBalance=${t.currentBalance}). A deferred-interest claim ` +
            `cannot exist on a tranche whose principal has been fully repaid — ` +
            `Deferred Interest is paid via the priority of payments and subtracted ` +
            `from PAO; once PAO reaches zero the deferred claim is extinguished. ` +
            `Likely cause: stale snapshot, extraction misalignment, or the ` +
            `snapshot was attached to the wrong tranche. Fix the extraction.`,
          severity: "error",
          blocking: true,
        });
      }
      // (b) Threshold — value above currentBalance is mathematically
      // impossible under compounding PPM (PIK is a subset of PAO). Only
      // checked on tranches with positive currentBalance (the (a'')
      // branch above handles the paid-off case with a more specific
      // message).
      else if (compounds && dib > t.currentBalance && t.currentBalance > 0) {
        composedWarnings.push({
          field: `tranches.${t.className}.deferredInterestBalance`,
          message:
            `Tranche "${t.className}": trustee deferredInterestBalance=${dib} ` +
            `exceeds currentBalance=${t.currentBalance} under deferredInterestCompounds=true. ` +
            `Mathematically impossible — under PPM compounding semantics (e.g. Ares ` +
            `Condition 6(c)), Deferred Interest is "added to the principal amount" ` +
            `and is therefore a subset of currentBalance. Likely cause: extraction ` +
            `misalignment (LLM read currentBalance into deferredInterestBalance). ` +
            `Fix the extraction.`,
          severity: "error",
          blocking: true,
        });
      }
      // (b') Soft cause-tree — populated value within threshold under
      // compounding. Benign (informational disclosure on an actually-
      // deferring deal) OR suspicious (extraction misalignment /
      // non-Ares snapshot-timing wrinkle). Engine ignores the value.
      else if (compounds && dib > 0 && t.currentBalance > 0) {
        composedWarnings.push({
          field: `tranches.${t.className}.deferredInterestBalance`,
          message:
            `Tranche "${t.className}": trustee deferredInterestBalance=${dib} ` +
            `under deferredInterestCompounds=true. Engine ignores the trustee ` +
            `value (under compounding PPM, PIK is already in currentBalance; ` +
            `seeding from the trustee field would double-count). Plausible causes: ` +
            `(1) trustee informational disclosure on a compounding deal — benign, ` +
            `no action required; (2) LLM extraction read the wrong column — fix ` +
            `prompt or schema; (3) deal's PPM holds deferred in a transient ` +
            `sub-account with snapshot-timing wrinkle (not present in Ares family) ` +
            `— file new KI, engine ignore is incorrect for that case.`,
          severity: "warn",
          blocking: false,
        });
      }
    }

    // (c) priorInterestShortfall / priorShortfallCount × non-senior-debt.
    // Independent of dib: a tranche can violate both invariants
    // simultaneously, and the partner-facing banner should enumerate
    // every gate that fires on this tranche.
    const hasShortfallSeed =
      (t.priorInterestShortfall ?? null) !== null ||
      (t.priorShortfallCount ?? null) !== null;
    if (hasShortfallSeed && (t.isDeferrable || t.isAmortising || t.isIncomeNote)) {
      composedWarnings.push({
        field: `tranches.${t.className}.priorInterestShortfall`,
        message:
          `Tranche "${t.className}" carries priorInterestShortfall / ` +
          `priorShortfallCount but is deferrable / amortising / income-note. ` +
          `These seeds apply only to non-deferrable senior debt tranches per ` +
          `PPM § 10(a)(i). Deferrables track shortfall via a separate state ` +
          `(deferredInterestBalance). Fix the resolver / extraction so the ` +
          `seed lands on the correct tranche.`,
        severity: "error",
        blocking: true,
      });
    }
  }

  return composedWarnings;
}

export function buildFromResolved(
  resolved: ResolvedDealData,
  userAssumptions: UserAssumptions,
  warnings: ResolutionWarning[] = [],
): ProjectionInputs {
  // Compose caller-supplied warnings with per-tranche data-shape gates.
  // Engine-internal `throw new Error(...)` for a data-shape invariant
  // bypasses the DATA INCOMPLETE banner and produces a stack trace,
  // which is the failure mode the blocking-warning + IncompleteDataError
  // plumbing exists to prevent — see selectBlockingWarnings above.
  const composedWarnings = composeBuildWarnings(resolved, userAssumptions, warnings);

  // Any warning marked `blocking: true` refuses to construct
  // ProjectionInputs. The engine never receives an inputs object built
  // from a fallback / sentinel value where extraction missed a load-
  // bearing field, or from a data-shape invariant violation.
  const blocking = selectBlockingWarnings(composedWarnings);
  if (blocking.length > 0) {
    throw new IncompleteDataError(blocking);
  }

  // Resolve DDTL draw quarter from user assumption
  const ddtlDrawQuarter = userAssumptions.ddtlDrawAssumption === 'never_draw'
    ? 0
    : userAssumptions.ddtlDrawAssumption === 'custom_quarter'
      ? userAssumptions.ddtlDrawQuarter
      : CLO_DEFAULTS.ddtlDrawQuarter; // draw_at_deadline default

  // Set drawQuarter on DDTL loans
  const loans = resolved.loans.map(l => l.isDelayedDraw
    ? { ...l, drawQuarter: ddtlDrawQuarter }
    : l
  );

  // Equity entry price: if user assumption is set in cents, resolve against
  // sub note ORIGINAL par (face at issuance). The buyer's cost basis is a
  // one-time invariant set at the purchase event — using currentBalance
  // would silently drift once the sub note amortizes (post-RP or any
  // principal redemption), producing a lower cost basis than the buyer
  // actually paid and overstating forward IRR.
  // The engine's `ProjectionInputs.equityEntryPrice` field is an absolute €.
  const subNote = resolved.tranches.find(t => t.isIncomeNote);
  const subNoteFaceAtPurchase = subNote?.originalBalance ?? 0;
  const equityEntryPrice =
    userAssumptions.equityEntryPriceCents != null && subNoteFaceAtPurchase > 0
      ? subNoteFaceAtPurchase * (userAssumptions.equityEntryPriceCents / 100)
      : undefined;

  return {
    initialPar: resolved.poolSummary.totalPar,
    wacSpreadBps: resolved.poolSummary.wacSpreadBps,
    baseRatePct: userAssumptions.baseRatePct,
    baseRateFloorPct: userAssumptions.baseRateFloorPct,
    seniorFeePct: userAssumptions.seniorFeePct,
    subFeePct: userAssumptions.subFeePct,
    taxesBps: userAssumptions.taxesBps,
    issuerProfitAmount: userAssumptions.issuerProfitAmount,
    trusteeFeeBps: userAssumptions.trusteeFeeBps,
    adminFeeBps: userAssumptions.adminFeeBps,
    seniorExpensesCapBps: userAssumptions.seniorExpensesCapBps,
    hedgeCostBps: userAssumptions.hedgeCostBps,
    incentiveFeePct: userAssumptions.incentiveFeePct,
    incentiveFeeHurdleIrr: userAssumptions.incentiveFeeHurdleIrr / 100, // convert from % to decimal
    postRpReinvestmentPct: userAssumptions.postRpReinvestmentPct,
    callMode: userAssumptions.callMode,
    callDate: userAssumptions.callDate,
    nonCallPeriodEnd: resolved.dates.nonCallPeriodEnd,
    callPricePct: userAssumptions.callPricePct,
    callPriceMode: userAssumptions.callPriceMode,
    reinvestmentOcTrigger: resolved.reinvestmentOcTrigger,
    eventOfDefaultTest: resolved.eventOfDefaultTest,
    tranches: resolved.tranches.map(t => ({
      className: t.className,
      currentBalance: t.currentBalance,
      spreadBps: t.spreadBps,
      seniorityRank: t.seniorityRank,
      isFloating: t.isFloating,
      isIncomeNote: t.isIncomeNote,
      isDeferrable: t.isDeferrable,
      isAmortising: t.isAmortising,
      amortisationPerPeriod: t.amortisationPerPeriod,
      amortStartDate: t.amortStartDate,
      priorInterestShortfall: t.priorInterestShortfall,
      priorShortfallCount: t.priorShortfallCount,
      deferredInterestBalance: t.deferredInterestBalance,
      dayCountConvention: t.dayCountConvention,
    })),
    ocTriggers: resolved.ocTriggers.map(t => ({
      className: t.className,
      triggerLevel: t.triggerLevel,
      rank: t.rank,
    })),
    icTriggers: resolved.icTriggers.map(t => ({
      className: t.className,
      triggerLevel: t.triggerLevel,
      rank: t.rank,
    })),
    maturityDate: resolved.dates.maturity,
    reinvestmentPeriodEnd: resolved.dates.reinvestmentPeriodEnd,
    currentDate: resolved.dates.currentDate,
    loans,
    defaultRatesByRating: userAssumptions.defaultRates,
    overriddenBuckets: userAssumptions.overriddenBuckets,
    cprPct: userAssumptions.cprPct,
    recoveryPct: userAssumptions.recoveryPct,
    recoveryLagMonths: userAssumptions.recoveryLagMonths,
    reinvestmentSpreadBps: userAssumptions.reinvestmentSpreadBps,
    reinvestmentTenorQuarters: userAssumptions.reinvestmentTenorYears * 4,
    reinvestmentRating: userAssumptions.reinvestmentRating,
    cccBucketLimitPct: userAssumptions.cccBucketLimitPct,
    cccMarketValuePct: userAssumptions.cccMarketValuePct,
    deferredInterestCompounds: userAssumptions.deferredInterestCompounds ?? resolved.deferredInterestCompounds,
    interestNonPaymentGracePeriods: resolved.interestNonPaymentGracePeriods,
    initialPrincipalCash: resolved.principalAccountCash,
    initialInterestAccountCash: resolved.interestAccountCash,
    initialInterestSmoothingBalance: resolved.interestSmoothingBalance,
    initialExpenseReserveBalance: resolved.expenseReserveBalance,
    initialSupplementalReserveBalance: resolved.supplementalReserveBalance,
    supplementalReserveDisposition: userAssumptions.supplementalReserveDisposition,
    preExistingDefaultedPar: resolved.preExistingDefaultedPar,
    preExistingDefaultRecovery: resolved.preExistingDefaultRecovery,
    unpricedDefaultedPar: resolved.unpricedDefaultedPar,
    preExistingDefaultOcValue: resolved.preExistingDefaultOcValue,
    discountObligationHaircut: resolved.discountObligationHaircut,
    longDatedObligationHaircut: resolved.longDatedObligationHaircut,
    impliedOcAdjustment: resolved.impliedOcAdjustment,
    quartersSinceReport: resolved.quartersSinceReport,
    ddtlDrawPercent: userAssumptions.ddtlDrawPercent,
    ...(equityEntryPrice != null ? { equityEntryPrice } : {}),
    // C1 — pull compliance triggers from resolved qualityTests/concentrationTests
    // (when present) so the engine can enforce reinvestment compliance.
    // Match by `canonicalType` populated at the resolver normalization point —
    // the trustee-name regex lives in one place (resolver.ts:classifyComplianceTest)
    // so consumers cannot drift apart. Null on this side means the trigger
    // wasn't in the source data; the resolver's silent-skip blocking gate
    // already refused for any case where extraction-failure-on-a-rated-deal
    // would silently disable enforcement, so reaching here with null is
    // genuinely "test does not apply to this deal" (e.g., Moody's-only deal
    // has no Fitch test).
    moodysWarfTriggerLevel:
      resolved.qualityTests.find((t) => t.canonicalType === "moodys_max_warf")
        ?.triggerLevel ?? null,
    minWasBps: (() => {
      // Trustee reports the Min WAS trigger in pct (e.g. 3.65 → 365 bps).
      const t = resolved.qualityTests.find((q) => q.canonicalType === "min_was");
      return t?.triggerLevel != null ? t.triggerLevel * 100 : null;
    })(),
    moodysCaaLimitPct:
      resolved.concentrationTests.find((c) => c.canonicalType === "moodys_caa_concentration")
        ?.triggerLevel ?? null,
    fitchCccLimitPct:
      resolved.concentrationTests.find((c) => c.canonicalType === "fitch_ccc_concentration")
        ?.triggerLevel ?? null,
    // C2 — Floating WAS / Excess WAC methodology inputs (PPM PDF p. 305).
    // Threaded so `computePoolQualityMetrics` uses the per-deal reference
    // anchor and the deal currency for the Non-Euro Obligation filter.
    // Both are optional on the engine side and default to (4.0%, no filter)
    // when null — matches the Euro XV reference. Resolver fills these from
    // PPM extraction; null on a deal where the resolver could not extract
    // would block via the silent-skip gate before reaching this code.
    referenceWafcPct: resolved.referenceWeightedAverageFixedCoupon,
    dealCurrency: resolved.currency,
  };
}
