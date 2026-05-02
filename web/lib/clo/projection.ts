// Pure deterministic CLO waterfall projection engine — no React, no DOM.
// Runs entirely client-side for instant recalculation.

import { CLO_DEFAULTS } from "./defaults";
import { POST_ACCEL_SEQUENCE } from "./waterfall-schema";
import { warfFactorToQuarterlyHazard } from "./rating-mapping";
import {
  BUCKET_WARF_FALLBACK,
  aggregateQualityMetrics,
  computePoolQualityMetrics,
  type PoolQualityMetrics,
  type QualityMetricLoan,
} from "./pool-metrics";
import {
  applySeniorExpensesToAvailable,
  sumSeniorExpensesPreOverflow,
  type SeniorExpenseBreakdown,
} from "./senior-expense-breakdown";

export interface LoanInput {
  parBalance: number;
  maturityDate: string;
  ratingBucket: string;
  spreadBps: number;
  isFixedRate?: boolean;
  fixedCouponPct?: number;
  isDelayedDraw?: boolean;
  ddtlSpreadBps?: number;
  drawQuarter?: number;
  /** Current market price as percentage of par (e.g. 98.5 = 98.5c on the euro).
   *  Used for A3 call-at-MtM liquidation. Null/undefined = fall back to par (100). */
  currentPrice?: number | null;
  /** C2 — Moody's WARF factor for this position (Aaa=1, Ca/C=10000). Used for
   *  forward-projection WARF. When absent the engine derives from ratingBucket
   *  via `BUCKET_WARF_FALLBACK` (coarse-bucket midpoint — less accurate than
   *  per-position sub-bucket rating but acceptable for reinvestment paths). */
  warfFactor?: number | null;
  /** Per PPM "Deferring Security" — excluded from Floating Par denominator
   *  in `computePoolQualityMetrics`. Optional; defaults to undefined (treated
   *  as not deferring). */
  isDeferring?: boolean;
  /** Per PPM "Loss Mitigation Loan" — excluded from Floating Par AND from
   *  Caa/CCC concentration denominators. Optional; defaults to undefined. */
  isLossMitigationLoan?: boolean;
  /** ISO 4217 currency code. Used by `computePoolQualityMetrics` to flag
   *  Non-Euro Obligations (excluded from Floating Par when the deal currency
   *  differs). Optional; treated as deal-currency-denominated when absent. */
  currency?: string;
  /** Per-agency Moody's sub-bucket rating (e.g. "Caa2") for the per-agency
   *  Caa/CCC concentration tests. Optional; falls back to `ratingBucket`
   *  when both per-agency ratings are absent. */
  moodysRatingFinal?: string;
  /** Per-agency Fitch sub-bucket rating (e.g. "CCC+"). Same role as
   *  `moodysRatingFinal`. */
  fitchRatingFinal?: string;
}

// C2 — Coarse RatingBucket → Moody's WARF factor. Imported from pool-metrics.ts
// to share the convention between the projection engine (D2 per-position hazard
// fallback; reinvested-loan factor) and the switch simulator (D4 post-switch
// pool recomputation). NR → Caa2 (6500) per Moody's CLO methodology; see KI-19.

export type DefaultDrawFn = (survivingPar: number, hazardRate: number) => number;

export interface ProjectionInputs {
  initialPar: number;
  wacSpreadBps: number;
  baseRatePct: number;
  baseRateFloorPct: number; // floor on reference rate (e.g. 0 for EURIBOR floored at 0%)
  seniorFeePct: number;
  subFeePct: number;
  /** PPM step (A)(i) Issuer taxes, in bps p.a. on collateral par. Deducted
   *  before trustee fees. Default 0 when no Q1 actuals available.
   *  Back-derived by `defaultsFromResolved` from Q1 waterfall step (A)(i). */
  taxesBps?: number;
  /** PPM step (A)(ii) Issuer Profit Amount. Absolute € per period (not bps,
   *  not annualized). Per PPM Condition 1 definitions: €250 per regular
   *  period, €500 per period post-Frequency-Switch Event. Deducted between
   *  taxes (A.i) and trustee fees (B). Default 0 when no Q1 actuals
   *  available. Back-derived by `defaultsFromResolved` from Q1 step (A)(ii). */
  issuerProfitAmount?: number;
  trusteeFeeBps: number; // PPM step (B) trustee, in bps p.a. on collateral par
  /** C3 — PPM step (C) administrative expenses, in bps p.a. on collateral par.
   *  Jointly capped with trusteeFeeBps under Senior Expenses Cap; overflow
   *  routes to step (Z). Optional field (undefined on legacy test inputs). */
  adminFeeBps?: number;
  /** C3 — Senior Expenses Cap in bps p.a. on Collateral Principal Amount.
   *  Jointly bounds (trusteeFeeBps + adminFeeBps) expense emission; overflow
   *  above the cap routes to PPM steps (Y) trustee overflow and (Z) admin
   *  overflow, paid from residual interest after tranche interest + sub
   *  mgmt fee. Optional (defaults to effectively unbounded when undefined). */
  seniorExpensesCapBps?: number;
  hedgeCostBps: number; // Scheduled hedge payments (PPM Step F), in bps p.a. on collateral par
  incentiveFeePct: number; // % of residual above IRR hurdle (PPM Steps BB/U), e.g. 20
  incentiveFeeHurdleIrr: number; // annualized IRR hurdle, e.g. 0.12 for 12%
  postRpReinvestmentPct: number; // % of principal proceeds reinvested post-RP (0-100, typically 0-50)
  /** Manager call gating (post-v6 plan §4.1). When "none", `callDate` is
   *  ignored and the projection runs to maturity. When "optionalRedemption",
   *  the engine liquidates at `callDate` per `callPriceMode`. The Phase A
   *  type union deliberately excludes `"economic"` — that mode requires a
   *  threshold-design pre-commit (Phase D §7.4). */
  callMode: "none" | "optionalRedemption";
  /** Stub-period engine (post-v6 plan §4.2). When true (and
   *  `firstPeriodEndDate` is set), period 1 runs from `currentDate` to
   *  `firstPeriodEndDate` (intra-period stub) instead of a full quarter; CDR
   *  and CPR are prorated by the actual day-count fraction. Subsequent
   *  periods are full quarters from `firstPeriodEndDate`. Default
   *  undefined/false preserves byte-identical engine output on existing
   *  fixtures (period 1 = currentDate → currentDate + 1 quarter, no
   *  hazard proration). Caller computes `firstPeriodEndDate` from the deal's
   *  payment-cadence anchor (typically `dates.firstPaymentDate` walked
   *  forward by quarters until the first scheduled date strictly after
   *  `currentDate`). */
  stubPeriod?: boolean;
  firstPeriodEndDate?: string | null;
  /** Reinvestment-period extension (post-v6 plan §4.5). When set, the engine
   *  uses `max(reinvestmentPeriodEnd, reinvestmentPeriodExtension)` as the
   *  effective RP end — the user's extension can extend, but cannot
   *  inadvertently shorten, an already-late extracted RP end. Null means no
   *  extension; the extracted RP end is used as-is. */
  reinvestmentPeriodExtension?: string | null;
  callDate: string | null; // optional redemption date — when callMode === "optionalRedemption", projection stops here and liquidates
  callPricePct: number; // liquidation price as % of par; only used when callPriceMode === "manual"
  /** Call liquidation price semantics (A3):
   *  - 'par': every position sells at face value (callPricePct ignored).
   *  - 'market': every position sells at its observed currentPrice; throws if
   *    holdings-level prices aren't available (post-v6 plan §4.1 — no silent
   *    par fallback; that would manufacture optimism on healthy deals).
   *  - 'manual': every position sells at `callPricePct` (flat percentage of par,
   *    regardless of market).
   *    Legacy behavior; useful for quick stress ("assume everything sells at 98c"). */
  callPriceMode: "par" | "market" | "manual";
  reinvestmentOcTrigger: { triggerLevel: number; rank: number; diversionPct: number } | null; // Reinvestment OC test — diversionPct % of remaining interest diverted during RP
  /** B1 — Event of Default Par Value Test (PPM 10(a)(iv)). Distinct from
   *  class-level OC; uses compositional numerator + Class-A-only denominator.
   *  Null/undefined = deal has no separately-tracked EoD test (legacy test
   *  fixtures pre-B1; synthetic inputs that don't need EoD). Engine emits
   *  `initialState.eodTest = null` when absent. */
  eventOfDefaultTest?: { triggerLevel: number } | null;
  tranches: {
    className: string;
    currentBalance: number;
    spreadBps: number;
    seniorityRank: number;
    isFloating: boolean;
    isIncomeNote: boolean;
    isDeferrable: boolean;
    isAmortising?: boolean; // principal paid from interest waterfall on fixed schedule (e.g. Class X)
    amortisationPerPeriod?: number | null; // fixed amount per quarter (null = pay full remaining balance)
    amortStartDate?: string | null; // date when amort begins (e.g. second payment date). If null or past, amort active immediately.
    /** PPM § 10(a)(i) — prior-period cumulative unpaid base interest carried
     *  into the projection (€). Seeds the engine's running `interestShortfall`
     *  state at T=0. Null/undefined → 0 (no carry). On a deal whose trustee
     *  report shows mid-grace shortfall on a non-deferrable senior tranche,
     *  populating this from the resolver makes EoD-on-shortfall fire at the
     *  PPM-correct period. Today the resolver returns null pending PPM
     *  extraction; the type and engine path are wired so a future extraction
     *  fix is a one-line resolver change. */
    priorInterestShortfall?: number | null;
    /** PPM § 10(a)(i) — consecutive-period shortfall counter at T=0. Pairs
     *  with `priorInterestShortfall`: if the trustee report shows N periods
     *  of consecutive non-payment, seed counter to N so the engine fires EoD
     *  at the correct boundary rather than re-deriving from scratch. Same
     *  null/undefined → 0 default + same TODO as `priorInterestShortfall`. */
    priorShortfallCount?: number | null;
  }[];
  ocTriggers: { className: string; triggerLevel: number; rank: number }[];
  icTriggers: { className: string; triggerLevel: number; rank: number }[];
  reinvestmentPeriodEnd: string | null;
  maturityDate: string | null;
  currentDate: string;
  loans: LoanInput[];
  defaultRatesByRating: Record<string, number>;
  /** §7.5 — Optional time-varying CDR path. When present, called once per
   *  quarter (1-indexed) to obtain that period's `defaultRatesByRating`
   *  map. When absent, the engine uses the constant `defaultRatesByRating`
   *  for every quarter (current behavior).
   *
   *  Semantics under each hazard branch:
   *
   *  1. **Legacy bucket-hazard branch** (`useLegacyBucketHazard: true`,
   *     used in tests and legacy callers): the returned map *replaces*
   *     `defaultRatesByRating` for that quarter outright. A bucket
   *     reading 5% means "this quarter's annualized CDR for that bucket
   *     is 5%."
   *
   *  2. **Per-position WARF branch** (`useLegacyBucketHazard: false`,
   *     production default): the returned map is converted to a per-
   *     bucket *multiplier* against `defaultRatesByRating`. If the
   *     returned bucket is `5%` and the constant baseline is `2%`, the
   *     multiplier is `5/2 = 2.5×`, which scales each loan's WARF-
   *     derived hazard by 2.5× for that quarter. When the constant
   *     baseline for a bucket is zero, the multiplier is undefined and
   *     the engine falls back to the bucket-map hazard for that loan
   *     (matches the legacy branch's semantic for the zero-baseline
   *     edge case). See `cdr-path-fn.test.ts` "production-config" suite
   *     and decision R for why both branches must be exercised.
   *
   *  The function form is the breakage-free alternative to the original
   *  `Record<bucket, pct[]>` proposal — same modeling power, no fixture
   *  migration cost. Monte Carlo callers supply a path that draws each
   *  quarter from a calibrated distribution; deterministic callers can
   *  hard-code a stress curve.
   *
   *  Naming note: previously `cdrPathFn`. The `Multiplier` infix in the
   *  current name signals the production-branch semantics — the dominant
   *  use site (per-position WARF) treats the path values as a scaling
   *  factor, not an absolute override. */
  cdrMultiplierPathFn?: (q: number) => Record<string, number>;
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
  reinvestmentTenorQuarters: number;
  reinvestmentRating: string | null; // null = use portfolio modal
  cccBucketLimitPct: number; // CCC excess above this % of par is haircut in OC test
  cccMarketValuePct: number; // market value assumption for CCC excess haircut (% of par)
  deferredInterestCompounds: boolean; // whether PIK'd interest itself earns interest
  initialPrincipalCash?: number; // uninvested principal in accounts at projection start (flows through waterfall Q1)
  preExistingDefaultedPar?: number; // par of pre-existing defaulted loans
  preExistingDefaultRecovery?: number; // market-price recovery for priced defaulted holdings
  unpricedDefaultedPar?: number; // par of defaulted holdings without market price (model applies recoveryPct)
  preExistingDefaultOcValue?: number; // recovery value for OC numerator (agency rate — typically higher than market)
  discountObligationHaircut?: number; // net OC deduction for discount obligations (from trustee report)
  longDatedObligationHaircut?: number; // net OC deduction for long-dated obligations (from trustee report)
  impliedOcAdjustment?: number; // derived residual between trustee's Adjusted CPA and identified components
  quartersSinceReport?: number; // quarters between compliance report and projection start (adjusts default recovery timing)
  ddtlDrawPercent?: number; // % of DDTL par actually funded on draw (default 100)
  equityEntryPrice?: number; // user-specified entry price for equity IRR (overrides balance-sheet implied value)
  /** PPM § 10(a)(i) — number of consecutive *payment-date* interest
   *  shortfalls on a non-deferrable senior tranche before an Event of
   *  Default fires. Null/undefined defaults to 0 — the PPM-correct
   *  semantic for the standard cure window. PPM § 10(a)(i) typically
   *  cures EoD if the missed payment is made within ~5 business days
   *  of the payment date, which is sub-period in a quarterly model:
   *  if the payment is still unpaid at the *next* checkpoint (this
   *  engine's period boundary), the cure window has lapsed. Set
   *  explicitly only when modelling a deal whose PPM grants a multi-
   *  period grace (rare; provided as an input for completeness). */
  interestNonPaymentGracePeriods?: number | null;
  /** C1 — Moody's Maximum WARF trigger (e.g. 3148 on Euro XV). When set, the
   *  engine scales down reinvestment if the purchase at `reinvestmentRating`
   *  would cause post-buy WARF to breach the trigger (and WARF wasn't already
   *  breaching). Excess principal flows to senior paydown instead. Null =
   *  no enforcement. */
  moodysWarfTriggerLevel?: number | null;
  /** C1 — Minimum Weighted Average Floating Spread trigger in bps (e.g. 365
   *  on Euro XV). When set, engine scales down reinvestment that would push
   *  post-buy `floatingWAS + ExcessWAC` below the trigger. Null = no
   *  enforcement (deal not rated by Moody's or no Min WAS test extracted). */
  minWasBps?: number | null;
  /** C1 — Moody's Caa Obligations concentration limit in pct (e.g. 7.5 on
   *  Euro XV). Engine blocks reinvestment that would push post-buy
   *  `pctMoodysCaa` above the limit. Null = no enforcement. */
  moodysCaaLimitPct?: number | null;
  /** C1 — Fitch CCC Obligations concentration limit in pct (e.g. 7.5 on
   *  Euro XV). Engine blocks reinvestment that would push post-buy
   *  `pctFitchCcc` above the limit. Null = no enforcement. */
  fitchCccLimitPct?: number | null;
  /** C2 — PPM Reference Weighted Average Fixed Coupon (%); PDF p. 305.
   *  Anchor for the Excess WAC adjustment in `computePoolQualityMetrics`.
   *  When omitted the helper defaults to 4.0% (Euro XV value). */
  referenceWafcPct?: number | null;
  /** C2 — Deal currency (ISO 4217). Loans whose `currency` differs are
   *  excluded from the Floating Par denominator as Non-Euro Obligations.
   *  When null/omitted, no currency filter applies. */
  dealCurrency?: string | null;
  /** D2 — Legacy escape-hatch: when true, defaults fall back to the coarse
   *  `defaultRatesByRating[bucket]` hazard path (the pre-D2 approximation).
   *
   *  **Default: false** (per-position WARF hazard is active — the
   *  institutionally-correct behavior matching Moody's CLO methodology).
   *  Caa1 (factor 4770 ≈ 6.3% annual) and Caa3 (8070 ≈ 15.2% annual) get
   *  distinct hazards instead of both averaging to the CCC bucket's 10.28%.
   *
   *  Flag exists for (a) legacy test pinning that predates D2 and hasn't
   *  been re-baselined yet (six test factories in `__tests__/`, see
   *  `test-helpers.ts`), (b) A/B validation when rolling forward, (c)
   *  deterministic regressions against known pre-D2 fixtures.
   *
   *  Tracked for deprecation under **KI-20**. When set to true, the engine
   *  emits a one-shot `console.warn` in dev builds so stale legacy pins
   *  surface during test output rather than silently. The flag is expected
   *  to be removed entirely once all legacy-pinned tests re-baseline. */
  useLegacyBucketHazard?: boolean;
  /** D2b — Per-bucket override hook. When a rating bucket appears in this
   *  list, the engine uses the user's `defaultRatesByRating[bucket]` hazard
   *  for every loan in that bucket, overriding the per-position WARF hazard.
   *  Buckets absent from the list keep per-position WARF (the D2 default).
   *  Wired to the UI bucket-CDR sliders: a slider that the user has touched
   *  reports its bucket here, so the slider value actually takes effect. */
  overriddenBuckets?: readonly string[];
}

/** Per-step waterfall emission for N1 harness comparison against trustee
 *  realized waterfall rows. All values here are already computed as local
 *  variables inside the period loop — this sub-object just exposes them
 *  on the output so the harness can tie out trustee vs engine step-by-step.
 *
 *  Trustee-step mapping (see web/lib/clo/ppm-step-map.ts):
 *    - taxes                  → PPM step (A)(i) (issuer taxes Sprint 3)
 *    - trusteeFeesPaid        → PPM step (B) ONLY (trustee fee; split from admin in Sprint 3 / C3)
 *    - adminFeesPaid          → PPM step (C) (admin expenses; split from trustee in Sprint 3 / C3)
 *    - trusteeOverflowPaid    → PPM step (Y) (trustee-fee overflow past cap, residual-interest funded)
 *    - adminOverflowPaid      → PPM step (Z) (admin-expense overflow past cap)
 *    - seniorMgmtFeePaid      → PPM step (E) (current + past-due bundled)
 *    - hedgePaymentPaid       → PPM step (F) (non-defaulted hedge only)
 *    - subMgmtFeePaid         → PPM step (X)
 *    - incentiveFeeFromInterest → PPM step (CC) (interest waterfall)
 *    - incentiveFeeFromPrincipal → PPM step (U) (principal waterfall)
 *    - ocCureDiversions       → PPM steps (I)/(L)/(O)/(R)/(U) keyed by tranche rank
 *    - reinvOcDiversion       → PPM step (W) (Reinvestment OC Test diversion)
 *    - equityFromInterest     → PPM step (DD) (interest residual to sub notes)
 *    - equityFromPrincipal    → Principal waterfall residual to sub notes
 *    - classXAmortFromInterest → PPM step (G) (Class X amort paid from interest pool, pari-passu with Class A interest)
 *    - deferredAccrualByTranche → PPM steps (K)/(N)/(Q)/(T) PIK additions this period
 */
export interface PeriodStepTrace {
  /** PPM step (A)(i) Issuer taxes. Engine emits zero pre-fix; post-fix
   *  populated via `taxesBps` input. Euro XV Q1 2026 observed: €6,133/quarter. */
  taxes: number;
  /** PPM step (A)(ii) Issuer Profit Amount. Fixed absolute deduction
   *  per period (€250 regular, €500 post-Frequency-Switch on Euro XV). Engine
   *  emits zero pre-fix; post-fix populated via `issuerProfitAmount` input. */
  issuerProfit: number;
  /** PPM step (B) — trustee fee, capped portion actually paid. Split from
   *  `adminFeesPaid` in Sprint 3 / C3 so the N1 harness can distinguish
   *  trustee vs admin drift. Pre-C3 this field bundled steps (B)+(C)+(Y)+(Z). */
  trusteeFeesPaid: number;
  /** PPM step (C) — admin expenses, capped portion actually paid. */
  adminFeesPaid: number;
  seniorMgmtFeePaid: number;
  hedgePaymentPaid: number;
  /** Interest residual after PPM steps (A.i)→(F): `interestCollected` minus
   *  taxes, issuerProfit, trustee+admin (capped portions only), seniorMgmt,
   *  hedge. The amount entering the tranche-interest pari-passu loop (PPM
   *  step (G) onward).
   *
   *  NULL under acceleration mode (PPM 10(b)): senior expenses cap is removed
   *  and interest+principal pool together for sequential P+I distribution by
   *  seniority; "available for tranches" doesn't have a coherent meaning. UI
   *  must hide the row when null AND render an explanatory header.
   *
   *  See CLAUDE.md § Engine ↔ UI separation: the UI MUST consume this field
   *  directly rather than recomputing `interestCollected − fees`. The
   *  original PeriodTrace incident did exactly that and silently dropped
   *  clauses A.i, A.ii, C. */
  availableForTranches: number | null;
  subMgmtFeePaid: number;
  incentiveFeeFromInterest: number;
  incentiveFeeFromPrincipal: number;
  ocCureDiversions: Array<{ rank: number; mode: "reinvest" | "paydown"; amount: number }>;
  reinvOcDiversion: number;
  /** PPM step (Y) — trustee-fee overflow paid from residual interest after
   *  tranche interest + sub mgmt fee. Zero when trustee + admin fees were
   *  fully accommodated under the Senior Expenses Cap, and zero under
   *  acceleration (cap disappears per PPM 10(b)). */
  trusteeOverflowPaid: number;
  /** PPM step (Z) — admin-expense overflow. Same mechanics as trustee. */
  adminOverflowPaid: number;
  equityFromInterest: number;
  equityFromPrincipal: number;
  /** PPM step (G) — Class X (or other amortising-tranche) scheduled
   *  amortization paid from the interest pool, pari-passu with Class A
   *  interest. The engine consumes this amount from `availableInterest`
   *  at the step G site; partner-visible aggregators must include it
   *  when reconciling interest-side flows against `interestCollected`,
   *  or `Σ stepTrace.*(interest waterfall) ≤ interestCollected` is
   *  unsound. Zero on deals with no `isAmortising: true` tranche. */
  classXAmortFromInterest: number;
  deferredAccrualByTranche: Record<string, number>;
  /** C1 — Reinvestment amount blocked this period because the purchase would
   *  have caused the Moody's WARF trigger to breach. Zero when no enforcement
   *  is active (no trigger set) or the purchase fit within the trigger.
   *  Blocked principal flows to senior paydown instead of reinvestment. */
  reinvestmentBlockedCompliance: number;
}

/** C2 — Forward-projected portfolio quality + concentration metrics.
 *  Computed from `loanStates` at period END (post-defaults, post-prepayments,
 *  post-reinvestment) so the metrics reflect what the portfolio actually looks
 *  like exiting the period. `periods[N].qualityMetrics` = state entering
 *  period N+1, matching trustee determination-date methodology. These mirror
 *  the T=0 metrics on `resolved.poolSummary` (warf / walYears / wacSpreadBps
 *  / pctCccAndBelow) so partner comparisons are apples-to-apples.
 *
 *  C1 reinvestment enforcement covers all four reinvestment-period triggers
 *  (Moody's WARF, Min Weighted Average Floating Spread, Moody's Caa
 *  concentration, Fitch CCC concentration) per PPM Section 8 + Condition 1
 *  definitions (PDF pp. 287, 302-305, 127, 138). NR positions proxy as Caa2
 *  (WARF=6500) per Moody's CLO methodology — see KI-19. */
/** Per-period alias of the shared `PoolQualityMetrics` shape. Engine emits
 *  this at each period end; switch simulator uses the same shape for
 *  pre/post-trade comparison. See `pool-metrics.ts` for the compute helper +
 *  methodology documentation. */
export type PeriodQualityMetrics = PoolQualityMetrics;

export interface PeriodResult {
  periodNum: number;
  date: string;
  beginningPar: number;
  defaults: number;
  prepayments: number;
  scheduledMaturities: number;
  recoveries: number;
  /** Aggregate principal proceeds for the period: prepayments + scheduledMaturities
   *  + recoveries. Emitted from the engine so the UI never sums these three fields
   *  itself. See CLAUDE.md § Engine ↔ UI separation. */
  principalProceeds: number;
  reinvestment: number;
  endingPar: number;
  /** Per-period balance instrumentation (post-v6 plan §4.3). Conservation
   *  invariant: `endingPerformingPar[N] === beginningPerformingPar[N+1]`. */
  endingPerformingPar: number;
  beginningPerformingPar: number;
  /** Sum of `defaultedParPending` across all loans at period end (loan-level mode);
   *  zero in aggregate mode. Conservation: `endingDefaultedPar[N+1] - endingDefaultedPar[N]`
   *  matches new defaults this period − recovered defaults this period. */
  endingDefaultedPar: number;
  beginningDefaultedPar: number;
  /** Principal POP account balance at start/end of period. The engine fully
   *  distributes collections each period, so these are typically 0 — non-zero
   *  only in the q=1 case where `initialPrincipalCash` is non-zero (the
   *  determination-date overdraft / surplus carried into the period). Emitted
   *  for trustee tie-out comparison. */
  beginningPrincipalAccount: number;
  endingPrincipalAccount: number;
  /** Interest POP account balance at start/end. Same fully-distribute model;
   *  always 0 in the current engine. Emitted for tie-out symmetry. */
  beginningInterestAccount: number;
  endingInterestAccount: number;
  interestCollected: number;
  beginningLiabilities: number;
  endingLiabilities: number;
  trancheInterest: { className: string; due: number; paid: number }[];
  /** Per-tranche **cumulative** running interest-shortfall balance at end-
   *  of-period. Tracks unpaid base interest on non-deferrable, non-amortising
   *  senior tranches (rank-protected per PPM § 10(a)(i)) ACCUMULATED across
   *  all pre-acceleration periods up to and including this one. The `due`
   *  field above is the period's pure base coupon — it does NOT include
   *  carried shortfall (non-deferrable means non-deferrable; soft-deferrable
   *  carry-forward into next period's pre-accel demand would silently
   *  diverge from trustee data on stress). The cumulative carry is consumed
   *  by:
   *    (a) the EoD-on-shortfall detector — fires when consecutive shortfall
   *        periods exceed `interestNonPaymentGracePeriods`, and
   *    (b) the post-acceleration handoff — folds the carry into
   *        `interestDueByTranche` so the accelerated claim is whole, then
   *        resets the cumulative to 0.
   *  Deferrable tranches use `deferredBalances` (PIK) instead and stay at
   *  zero here. Empty / all-zero in healthy scenarios. **Always cumulative
   *  pre-accel; always empty under post-accel** (the carry has been folded
   *  and reset by the handoff). Under acceleration the per-period unpaid
   *  amount lives on `perPeriodInterestShortfall` — distinct semantic, do
   *  not confuse the two when summing across periods.
   *
   *  **Non-display field by current intent.** Per CLAUDE.md principle 4,
   *  every engine output is potentially partner-facing; this field is
   *  emitted for engine observability (EoD trigger introspection in tests,
   *  N1-harness diagnostics, post-accel claim audit) but is NOT surfaced
   *  in any UI row today. The sibling `stepTrace.deferredAccrualByTranche`
   *  has the same shape (engine-internal observability for the deferrable-
   *  PIK flow) and the same non-display status. If a partner-facing
   *  surface needs to display "senior interest shortfall: €X,XXX", the
   *  rule is: read FROM this field — never re-derive from `due − paid`
   *  in the UI (that breaks the "display equals engine output" invariant
   *  exactly as the April 2026 incident did for `equityFromInterest`). */
  interestShortfall: Record<string, number>;
  /** Per-tranche **per-period** unpaid-interest amount from the accelerated
   *  waterfall — distinct semantic from `interestShortfall` (cumulative
   *  pre-accel carry). Empty / absent in pre-accel periods; populated only
   *  under acceleration with the single-period shortfall the post-accel
   *  executor could not pay. Summing this across post-accel periods gives
   *  total unpaid since acceleration; summing it with `interestShortfall`
   *  is meaningless (different units of time aggregation). */
  perPeriodInterestShortfall: Record<string, number>;
  /** Per-tranche consecutive-shortfall counter feeding the PPM § 10(a)(i)
   *  EoD trigger. Increments each pre-acceleration period the rank-protected
   *  tranche accrues new shortfall (`interestShortfall[c] − bopShortfall[c] >
   *  0.01`); resets to 0 on a fully-paid period. EoD fires when count exceeds
   *  `interestNonPaymentGracePeriods`. Frozen under post-acceleration (counter
   *  is no longer mutated once `isAccelerated` is set). Emitted so a partner-
   *  facing surface can show "Class A — 2 of 3 grace periods consumed" or
   *  similar countdown without re-deriving from interestShortfall deltas. */
  interestShortfallCount: Record<string, number>;
  /** Per-tranche principal-side state. `paid` is the TOTAL paid to the
   *  tranche this period (sum of amort-from-interest at step G + principal-
   *  pool paydowns post-step-G). `paidFromInterest` is the portion sourced
   *  from the interest pool at step G — non-zero only for amortising
   *  tranches in periods where amort fires. Partner-visible UIs that
   *  organize the trace by source pool (interest vs principal sections)
   *  must subtract `paidFromInterest` from `paid` to avoid double-rendering
   *  the same dollars in both sections. Aggregate sum across tranches:
   *  `Σ paidFromInterest === stepTrace.classXAmortFromInterest`. */
  tranchePrincipal: { className: string; paid: number; paidFromInterest: number; endBalance: number }[];
  ocTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  icTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  /** B1 — EoD test per period (null if deal has no separately-tracked EoD). */
  eodTest: EventOfDefaultTestResult | null;
  /** B2 — whether this period ran under the post-acceleration waterfall.
   *  Flipped by an EoD breach in a prior period (or at T=0); irreversible. */
  isAccelerated: boolean;
  /** B1 Tier 2 — per-loan default events that fired in this period. Each
   *  entry is `(loanIndex, defaultedPar, scheduledRecoveryQuarter)`. The
   *  existing aggregate `defaults` field is the sum of these entries'
   *  `defaultedPar`, and `scheduledRecoveryQuarter` MUST match the
   *  recoveryPipeline schedule for the same period — the test suite asserts
   *  this identity directly so the dual-accounting paths (per-loan
   *  `defaultEvents` vs aggregate `recoveryPipeline`) cannot silently
   *  diverge. Empty array on zero-default periods. */
  loanDefaultEvents: Array<{
    loanIndex: number;
    defaultedPar: number;
    scheduledRecoveryQuarter: number;
  }>;
  equityDistribution: number;
  defaultsByRating: Record<string, number>;
  /** Per-step trace for N1 waterfall-replay harness. */
  stepTrace: PeriodStepTrace;
  /** C2 — End-of-period portfolio quality/concentration metrics. Matches the
   *  shape of `resolved.poolSummary.{warf,walYears,wacSpreadBps,pctCccAndBelow}`
   *  so T=0 vs forward comparisons are apples-to-apples. */
  qualityMetrics: PeriodQualityMetrics;
}

/** Beginning-of-period-1 snapshot — "as of the determination date" state
 *  BEFORE any forward-projection mutations (defaults, prepayments, paydowns,
 *  reinvestment). This is what trustee reports measure; the N6 harness ties
 *  these out against `raw.complianceData.complianceTests` at T=0.
 *  Expose as a separate field rather than periods[0] because periods[0] is
 *  post-Q1 end-state. */
export interface ProjectionInitialState {
  /** Pool par at period start (funded loans, excludes unfunded DDTL). */
  poolPar: number;
  /** OC numerator at period start (APB + principal cash − haircuts + adjustments). */
  ocNumerator: number;
  /** Per-class OC test actuals at T=0, matching trustee determination-date values. */
  ocTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  /** Per-class IC test actuals at T=0. */
  icTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  /** B1 — Event of Default Par Value Test at T=0. Null if deal has no
   *  separately-tracked EoD test (legacy fixture / test scenario). */
  eodTest: EventOfDefaultTestResult | null;
  /** Total non-DDTL non-defaulted loan par + signed principalAccountCash −
   *  non-equity tranche balance, floored at 0. THE canonical "what equity
   *  is worth right now" value — same number used internally as the equity
   *  cost basis for forward IRR (line ~1014: `equityCashFlows.push(-equityInvestment)`)
   *  and externally as the partner-facing book-value card and the inception-IRR
   *  terminal. Single source of truth; UI must read this field, not recompute it.
   *
   *  See CLAUDE.md § Engine ↔ UI separation. */
  equityBookValue: number;
  /** True iff totalAssets ≤ totalDebtOutstanding at t=0 — i.e., the line-995
   *  floor fired and equityCashFlows[0] = -0. The deal is balance-sheet
   *  insolvent; calculateIrr() returns null on the all-non-negative series.
   *  UI must label this state ("Deal is balance-sheet insolvent; IRR not
   *  meaningful") rather than show "N/A". */
  equityWipedOut: boolean;
}

export interface ProjectionResult {
  periods: PeriodResult[];
  equityIrr: number | null;
  totalEquityDistributions: number;
  tranchePayoffQuarter: Record<string, number | null>;
  /** T=0 snapshot for N6 compliance parity harness. */
  initialState: ProjectionInitialState;
}

export function validateInputs(inputs: ProjectionInputs): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (!inputs.tranches || inputs.tranches.length === 0) {
    errors.push({ field: "tranches", message: "Capital structure is required" });
  }
  if (!inputs.initialPar || inputs.initialPar <= 0) {
    errors.push({ field: "initialPar", message: "Current portfolio par amount is required" });
  }
  if (!inputs.maturityDate) {
    errors.push({ field: "maturityDate", message: "Deal maturity date is required for projection timeline" });
  }
  const missingSpread = inputs.tranches?.some(
    (t) => !t.isIncomeNote && (t.spreadBps === null || t.spreadBps === undefined)
  );
  if (missingSpread) {
    errors.push({ field: "trancheSpreads", message: "Tranche spread/coupon data needed for interest calculations" });
  }
  return errors;
}

export function quartersBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  return Math.ceil(months / 3);
}

/**
 * Reinvestment OC Test diversion amount per PPM:
 *   `raw.constraints.reinvestmentOcTest.diversionAmount` specifies "Interest
 *   diversion (LESSER OF 50% of residual Interest Proceeds or cure amount)
 *   during Reinvestment Period".
 *
 * During RP, diversion buys collateral → raises numerator. Cure amount solves:
 *   (numerator + x) / debt ≥ trigger → x = trigger × debt − numerator.
 *
 * Returns 0 when (a) no interest to divert, (b) no rated debt, (c) test passes.
 *
 * Known approximation: assumes €1 diverted buys €1 of par (par-purchase). Real
 * reinvestments happen at market prices (typically 95–100%), so €1 of diversion
 * buys €1/price of par; cure-exact math would be `cureAmount × price`. Tracked
 * under C1 (reinvestment compliance) for modelling at purchase price.
 */
export function computeReinvOcDiversion(
  availableInterest: number,
  ocNumerator: number,
  reinvOcDebt: number,
  triggerLevelPct: number,
  diversionPct: number,
): number {
  if (availableInterest <= 0) return 0;
  if (reinvOcDebt <= 0) return 0;
  const actualPct = (ocNumerator / reinvOcDebt) * 100;
  if (actualPct >= triggerLevelPct) return 0;
  const cureAmount = Math.max(0, (triggerLevelPct / 100) * reinvOcDebt - ocNumerator);
  const maxDiversion = availableInterest * (diversionPct / 100);
  return Math.min(maxDiversion, cureAmount);
}

/**
 * B1 — Event of Default Par Value Test (PPM OC Condition 10(a)(iv)).
 *
 * Compositional numerator, distinct from the class-level OC_PAR test family:
 *   component (1) — Aggregate Principal Balance of NON-defaulted Collateral Obligations (at par)
 *   component (2) — For each Defaulted Obligation: Market Value × Principal Balance
 *   component (3) — Principal Proceeds standing on the Principal Account (Measurement Date)
 *
 * Denominator is Class A Principal Amount Outstanding ONLY (NOT all tranches).
 *
 * Previously implemented as a rank-99 OC trigger running against the class-level
 * loop, which made the denominator include all tranches (sub notes + everything)
 * — driving the ratio ~5-10× higher than spec and making the test essentially
 * impossible to breach. B1 fixes this structurally.
 *
 * Defaulted loan pricing: uses `currentPrice` (cents of par) when available.
 * Reinvested / newly-originated loans that default before acquiring a market
 * price fall back to `defaultedPriceFallbackPct` (default 100 = par) — this is
 * conservative because using par for a defaulted position overstates the
 * numerator. Prefer to always have a market price on defaulted positions.
 */
export interface EventOfDefaultTestResult {
  numeratorComponents: {
    nonDefaultedApb: number;
    defaultedMvPb: number;
    principalCash: number;
  };
  numeratorTotal: number;
  denominator: number;
  actualPct: number;
  triggerLevel: number;
  passing: boolean;
}

export function computeEventOfDefaultTest(
  loanStates: Array<{
    survivingPar: number;
    isDefaulted?: boolean;
    currentPrice?: number | null;
    isDelayedDraw?: boolean;
  }>,
  principalCash: number,
  classAPrincipalOutstanding: number,
  triggerLevel: number,
  defaultedPriceFallbackPct = 100,
): EventOfDefaultTestResult {
  let nonDefaultedApb = 0;
  let defaultedMvPb = 0;
  for (const l of loanStates) {
    if (l.isDelayedDraw) continue; // unfunded DDTLs don't count
    if (l.survivingPar <= 0) continue;
    if (l.isDefaulted) {
      const price = l.currentPrice != null ? l.currentPrice : defaultedPriceFallbackPct;
      defaultedMvPb += l.survivingPar * (price / 100);
    } else {
      nonDefaultedApb += l.survivingPar;
    }
  }
  const numeratorTotal = nonDefaultedApb + defaultedMvPb + principalCash;
  const actualPct = classAPrincipalOutstanding > 0
    ? (numeratorTotal / classAPrincipalOutstanding) * 100
    : 999;
  return {
    numeratorComponents: { nonDefaultedApb, defaultedMvPb, principalCash },
    numeratorTotal,
    denominator: classAPrincipalOutstanding,
    actualPct,
    triggerLevel,
    passing: actualPct >= triggerLevel,
  };
}

/**
 * Senior-tranche Principal Amount Outstanding — the EoD test denominator.
 *
 * The senior tranche is the rated debt tranche(s) at the lowest seniorityRank
 * (rank 1 by convention). Identification is rank-based, NOT name-based: real
 * CLOs name this tranche variously ("Class A", "Class A-1", "A-1A", "A"), and
 * a pari-passu split (A-1 + A-2 sharing rank 1) sums BOTH balances. Income
 * notes (sub notes) are excluded even when mis-ranked at rank 1 in malformed
 * inputs.
 *
 * Principal-only — PPM Condition 10(a)(iv) defines the denominator as the
 * Principal Amount Outstanding of the senior tranche, NOT principal plus
 * deferred interest. The D1 guard at the head of `runProjection` throws on
 * any tranche whose name starts with "A" or "B" carrying isDeferrable=true,
 * which covers the standard naming convention but is itself name-based
 * (would miss a senior tranche named e.g. "K-1" or "X-1" marked deferrable);
 * if such an input ever reaches this helper, including deferred interest
 * here would inflate the denominator and silently SUPPRESS EoD breaches,
 * which is why the helper takes principal only and not the deferred map.
 *
 * Returns 0 only when there are no debt tranches at all (degenerate input).
 *
 * Single source of truth for the T=0 initialState EoD test and the forward-
 * period EoD test. Keeping both sites bound to this helper prevents the
 * recurrence of the "string match Class A" overfit pattern that the forward
 * site silently re-introduced post-T=0 closure.
 */
export function computeSeniorTranchePao(
  tranches: Array<{ className: string; seniorityRank: number; isIncomeNote: boolean }>,
  trancheBalances: Record<string, number>,
): number {
  const debtTranches = tranches.filter((t) => !t.isIncomeNote);
  if (debtTranches.length === 0) return 0;
  const minRank = Math.min(...debtTranches.map((t) => t.seniorityRank));
  return debtTranches
    .filter((t) => t.seniorityRank === minRank)
    .reduce((s, t) => {
      // Throw on missing-key — a tranche present in `tranches` but absent
      // from the balance map is a data-shape bug. Silent `?? 0` would
      // collapse the EoD denominator and resurrect the exact "always
      // passing" failure shape this helper exists to prevent. Per CLAUDE.md
      // principle 5 (boundaries assert sign and scale).
      const cur = trancheBalances[t.className];
      if (cur === undefined) {
        throw new Error(
          `computeSeniorTranchePao: tranche "${t.className}" missing from trancheBalances ` +
            `(cur=${cur}). Caller must construct the map from the same tranches array.`,
        );
      }
      return s + cur;
    }, 0);
}

/**
 * B2 — Post-acceleration waterfall executor (Stage 1 implementation).
 *
 * Distributes a single pool of cash (interest + principal combined, per
 * PPM Condition 10(a)) through `POST_ACCEL_SEQUENCE`:
 *   1. Senior expenses (taxes, trustee, admin, senior mgmt, hedge) — uncapped
 *   2. Rated tranches in seniority order: Class A P+I fully sequential →
 *      Class B pari passu pro-rata (B-1 + B-2) → Class C/D/E/F each sequential
 *   3. Sub-ordinated fees (sub mgmt, defaulted hedge, incentive if hurdle met)
 *   4. Residual to Sub Noteholders
 *
 * For each tranche, interest due is paid before principal; principal then
 * absorbs remaining capacity until the tranche is retired, at which point
 * excess cash flows to the next tranche. Under acceleration, deferred
 * interest no longer PIKs — unpaid interest is a shortfall against the
 * residual (Sub Notes bucket).
 *
 * Inputs are already-computed period-level quantities; the executor doesn't
 * recompute interest accruals or day-count. Caller supplies:
 *   - totalCash: pooled interest + principal available for distribution
 *   - tranches: input tranche definitions (for sequencing + pari passu groups)
 *   - trancheBalances, deferredBalances: current-period balances (mutable;
 *     executor writes post-paydown balances back)
 *   - senior expense amounts pre-computed to match normal-mode fee semantics
 *     (day-count, rate) so partner-visible fee numbers are consistent
 *   - tranche interest due amounts per tranche
 *   - Class B pari passu group is detected via `isB1B2Group` heuristic.
 */
export interface PostAccelExecutorInput {
  totalCash: number;
  tranches: ProjectionInputs["tranches"];
  trancheBalances: Record<string, number>;
  deferredBalances: Record<string, number>;
  /** Senior expenses in PPM order (A.i taxes, A.ii issuer profit, B trustee,
   *  C admin, E senior mgmt, F hedge). Caller constructs these so values
   *  tie to PPM day-count + rates for the period. Issuer profit is a fixed
   *  absolute amount per PPM Condition 1; still paid under acceleration
   *  (priority order preserved by PPM 10(b)). */
  seniorExpenses: {
    taxes: number;
    issuerProfit: number;
    trusteeFees: number;
    adminExpenses: number;
    seniorMgmtFee: number;
    hedgePayments: number;
  };
  /** Interest due per tranche this period (from trancheCouponRate × balance
   *  × dayFrac). Residual interest not paid is a shortfall (not PIKed). */
  interestDueByTranche: Record<string, number>;
  /** Sub-ordinated fees — paid only if rated notes are fully retired and
   *  cash remains. */
  subMgmtFee: number;
  /** Whether the incentive-fee IRR hurdle is currently met. Simplified flag;
   *  caller can pass false to disable under distress. */
  incentiveFeeActive: boolean;
  incentiveFeePct: number;
}

export interface PostAccelExecutorResult {
  /** Per-tranche distribution: how much interest vs principal was paid. */
  trancheDistributions: Array<{
    className: string;
    interestDue: number;
    interestPaid: number;
    principalPaid: number;
    endBalance: number;
  }>;
  seniorExpensesPaid: {
    taxes: number;
    issuerProfit: number;
    trusteeFees: number;
    adminExpenses: number;
    seniorMgmtFee: number;
    hedgePayments: number;
  };
  subMgmtFeePaid: number;
  incentiveFeePaid: number;
  residualToSub: number;
  /** Per-period unpaid-interest shortfall on any tranche under acceleration —
   *  difference between `interestDueByTranche` (which already includes the
   *  pre-accel carry folded by the projection at the handoff) and what the
   *  accelerated waterfall actually paid. Not PIKed (acceleration discharges
   *  PIK semantics). Distinct semantic from `PeriodResult.interestShortfall`,
   *  which is a cumulative pre-accel running balance — this field is single-
   *  period. */
  perPeriodInterestShortfall: Record<string, number>;
}

export function runPostAccelerationWaterfall(input: PostAccelExecutorInput): PostAccelExecutorResult {
  let remaining = input.totalCash;

  // ── 1. Senior expenses (steps A–E). Uncapped under acceleration. ──
  const pay = (amount: number): number => {
    const paid = Math.min(amount, Math.max(0, remaining));
    remaining -= paid;
    return paid;
  };
  const seniorPaid = {
    taxes: pay(input.seniorExpenses.taxes),
    issuerProfit: pay(input.seniorExpenses.issuerProfit),
    trusteeFees: pay(input.seniorExpenses.trusteeFees),
    adminExpenses: pay(input.seniorExpenses.adminExpenses),
    seniorMgmtFee: pay(input.seniorExpenses.seniorMgmtFee),
    hedgePayments: pay(input.seniorExpenses.hedgePayments),
  };

  // ── 2. Rated tranches: P+I combined, sequential except Class B pari passu. ──
  const trancheDistributions: PostAccelExecutorResult["trancheDistributions"] = [];
  const perPeriodInterestShortfall: Record<string, number> = {};

  // Sort rated tranches (exclude sub notes + amortising Class X) by seniority.
  const ratedTranches = input.tranches
    .filter((t) => !t.isIncomeNote && !t.isAmortising)
    .sort((a, b) => a.seniorityRank - b.seniorityRank);

  // Group by seniorityRank so pari passu classes (e.g., B-1 + B-2) absorb together.
  const processedRanks = new Set<number>();
  for (const t of ratedTranches) {
    if (processedRanks.has(t.seniorityRank)) continue;
    processedRanks.add(t.seniorityRank);
    const group = ratedTranches.filter((g) => g.seniorityRank === t.seniorityRank);

    // Sum interest due + principal outstanding for the group.
    const totalInterestDue = group.reduce(
      (s, g) => s + (input.interestDueByTranche[g.className] ?? 0),
      0,
    );
    const totalPrincipal = group.reduce(
      (s, g) => s + input.trancheBalances[g.className] + input.deferredBalances[g.className],
      0,
    );

    // Pay group's interest (pro rata across members by interest due).
    const interestPaid = Math.min(totalInterestDue, Math.max(0, remaining));
    remaining -= interestPaid;

    // Pay group's principal (pro rata by outstanding balance).
    const principalPaid = Math.min(totalPrincipal, Math.max(0, remaining));
    remaining -= principalPaid;

    for (const g of group) {
      const gInterestDue = input.interestDueByTranche[g.className] ?? 0;
      const gPrincipal = input.trancheBalances[g.className] + input.deferredBalances[g.className];

      // Pro-rate this group's interest and principal by the member's share.
      const gInterestShare = totalInterestDue > 0 ? gInterestDue / totalInterestDue : 0;
      const gPrincipalShare = totalPrincipal > 0 ? gPrincipal / totalPrincipal : 0;
      const gInterestPaid = interestPaid * gInterestShare;
      const gPrincipalPaid = principalPaid * gPrincipalShare;

      // Shortfall: unpaid interest is NOT PIKed under acceleration.
      const shortfall = gInterestDue - gInterestPaid;
      if (shortfall > 0.01) perPeriodInterestShortfall[g.className] = shortfall;

      // Post-paydown balance.
      const endBalance = Math.max(0, gPrincipal - gPrincipalPaid);
      trancheDistributions.push({
        className: g.className,
        interestDue: gInterestDue,
        interestPaid: gInterestPaid,
        principalPaid: gPrincipalPaid,
        endBalance,
      });
    }

    if (remaining <= 0) break;
  }

  // ── 3. Sub-ordinated steps (Q, T, V). Only if rated notes exhausted. ──
  const subMgmtFeePaid = pay(input.subMgmtFee);
  // Incentive fee: only if hurdle met AND cash remains. Flat percentage of
  // remaining cash before residual (simplified — proper model would use IRR
  // threshold waterfall). Under distress, hurdle rarely met.
  const incentiveFeePaid = input.incentiveFeeActive
    ? pay(Math.max(0, remaining) * (input.incentiveFeePct / 100))
    : 0;

  // ── 4. Residual to Sub Noteholders. ──
  const residualToSub = Math.max(0, remaining);

  return {
    trancheDistributions,
    seniorExpensesPaid: seniorPaid,
    subMgmtFeePaid,
    incentiveFeePaid,
    residualToSub,
    perPeriodInterestShortfall,
  };
}

/**
 * Call-liquidation proceeds per PPM. Three modes (post-v6 plan §4.1):
 *   - 'par': every position sells at face value. `callPricePct` ignored.
 *   - 'market': every position sells at its observed `currentPrice`. Throws
 *     when `currentPrice` is null/undefined on any non-delayed-draw funded
 *     position — the engine refuses a silent par fallback because that would
 *     bias the displayed IRR upward on healthy deals (par-call IRR is generally
 *     better than market-call IRR for deals trading above par). Callers must
 *     choose 'par' or 'manual' for deals without holdings-level prices.
 *   - 'manual': every position sells at `callPricePct` (flat percentage of par,
 *     regardless of market). Useful for "assume 95c liquidation" stress runs.
 *
 * Unfunded DDTLs are excluded — no deployed collateral to liquidate.
 *
 * Throws `MarketPriceMissingError` (a plain `Error` subclass with discriminator)
 * when 'market' is selected but data is missing, so the UI can catch and
 * prompt the user to switch modes.
 */
export class MarketPriceMissingError extends Error {
  readonly kind = "market_price_missing";
  constructor(message: string) {
    super(message);
    this.name = "MarketPriceMissingError";
  }
}

export function computeCallLiquidation(
  loanStates: Array<{ survivingPar: number; currentPrice?: number | null; isDelayedDraw?: boolean }>,
  callPricePct: number,
  mode: "par" | "market" | "manual",
): number {
  let total = 0;
  let missingMarketPriceCount = 0;
  for (const l of loanStates) {
    if (l.isDelayedDraw) continue;
    if (l.survivingPar <= 0) continue;
    let effectivePrice: number;
    switch (mode) {
      case "par":
        effectivePrice = 100;
        break;
      case "market":
        if (l.currentPrice == null) {
          missingMarketPriceCount++;
          continue;
        }
        effectivePrice = l.currentPrice;
        break;
      case "manual":
        effectivePrice = callPricePct;
        break;
    }
    total += l.survivingPar * (effectivePrice / 100);
  }
  if (mode === "market" && missingMarketPriceCount > 0) {
    throw new MarketPriceMissingError(
      `Market call price requires loan-level market values; ${missingMarketPriceCount} ` +
        `position(s) lack currentPrice. Set callPriceMode to 'par' or 'manual'.`,
    );
  }
  return total;
}

/**
 * Day-count fraction between two ISO dates per a named convention.
 *
 * Consumers (B3):
 *   - `runProjection` inner period loop — all interest/fee/coupon accrual.
 *   - `b3-day-count.test.ts` — first-principles correctness tests (PPM worked
 *     example, leap year, 30/360 invariance).
 *   - Several legacy test files (`projection-fixed-rate-ddtl`, `projection-
 *     systematic-edge-cases`, `projection-waterfall-audit`) — use this to
 *     compute expected values instead of the old `/ 4` shortcut.
 *
 * Conventions supported (per Ares XV PPM Condition 1 "Day count"):
 *   - 'actual_360': actual days between dates / 360. Used for floating-rate
 *     tranches, loans, and all management / trustee / hedge fees.
 *   - '30_360': 30-day-month convention. Used for fixed-rate tranches
 *     (Class B-2 in Euro XV). Leap-year-neutral and quarter-uniform.
 *
 * ISO date inputs must be YYYY-MM-DD. End date is exclusive (standard CLO
 * convention): Jan 15 → Apr 15 counts as 90 actual days, not 91.
 *
 * 30/360 variant: US (Bond Basis) rule. Day-of-month clamps to 30 if the end
 * date's day > 30 and the start date's day ≥ 30. For the common case (all
 * mid-month payment dates), every quarter comes out to exactly 90/360 = 0.25.
 */
export function dayCountFraction(
  convention: "actual_360" | "30_360",
  startIso: string,
  endIso: string,
): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  if (convention === "30_360") {
    // US 30/360: clamp days. Ref: 2006 ISDA Definitions §4.16(f).
    const d1 = sd === 31 ? 30 : sd;
    const d2 = (ed === 31 && d1 >= 30) ? 30 : ed;
    const days = (ey - sy) * 360 + (em - sm) * 30 + (d2 - d1);
    return days / 360;
  }
  // actual_360
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const days = Math.round((end - start) / 86_400_000);
  return days / 360;
}

export function addQuarters(dateIso: string, quarters: number): string {
  const d = new Date(dateIso);
  const origDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + quarters * 3);
  // If the day rolled forward (e.g. Jan 31 + 3mo → May 1), clamp to last day of target month
  if (d.getUTCDate() !== origDay) {
    d.setUTCDate(0); // last day of previous month
  }
  return d.toISOString().slice(0, 10);
}

// Helper: compute tranche coupon rate as a decimal
function trancheCouponRate(t: ProjectionInputs["tranches"][number], baseRatePct: number, baseRateFloorPct: number): number {
  // Floating: base rate (floored per deal terms) + spread. Fixed: spread represents the full coupon.
  return t.isFloating
    ? (Math.max(baseRateFloorPct, baseRatePct) + t.spreadBps / 100) / 100
    : t.spreadBps / 10000;
}

export function runProjection(inputs: ProjectionInputs, defaultDrawFn?: DefaultDrawFn): ProjectionResult {
  const {
    initialPar, wacSpreadBps, baseRatePct, baseRateFloorPct, seniorFeePct, subFeePct,
    taxesBps = 0, issuerProfitAmount = 0, trusteeFeeBps, adminFeeBps = 0, seniorExpensesCapBps, hedgeCostBps, incentiveFeePct, incentiveFeeHurdleIrr,
    postRpReinvestmentPct, callMode, callDate, callPricePct, callPriceMode, reinvestmentOcTrigger, eventOfDefaultTest,
    stubPeriod, firstPeriodEndDate,
    reinvestmentPeriodExtension,
    tranches, ocTriggers, icTriggers,
    reinvestmentPeriodEnd, maturityDate, currentDate,
    loans, defaultRatesByRating, cdrMultiplierPathFn, cprPct, recoveryPct, recoveryLagMonths,
    reinvestmentSpreadBps, reinvestmentTenorQuarters, reinvestmentRating: reinvestmentRatingOverride,
    cccBucketLimitPct, cccMarketValuePct, deferredInterestCompounds,
    initialPrincipalCash = 0, preExistingDefaultedPar = 0, preExistingDefaultRecovery = 0, unpricedDefaultedPar = 0, preExistingDefaultOcValue = 0,
    discountObligationHaircut = 0, longDatedObligationHaircut = 0, impliedOcAdjustment = 0, quartersSinceReport = 0,
    ddtlDrawPercent = 100,
    moodysWarfTriggerLevel = null,
    minWasBps: minWasBpsTrigger = null,
    moodysCaaLimitPct: moodysCaaLimitPctTrigger = null,
    fitchCccLimitPct: fitchCccLimitPctTrigger = null,
    referenceWafcPct = null,
    dealCurrency = null,
    useLegacyBucketHazard = false,
    overriddenBuckets,
    interestNonPaymentGracePeriods,
  } = inputs;
  // PPM § 10(a)(i) grace period for non-deferrable senior interest
  // shortfall before EoD fires. Default 0 (conservative — any shortfall
  // fires immediately) when the resolver hasn't extracted a per-deal
  // value. See ProjectionInputs docstring.
  const eodGrace = interestNonPaymentGracePeriods ?? 0;
  const overriddenBucketSet = overriddenBuckets && overriddenBuckets.length > 0
    ? new Set<string>(overriddenBuckets)
    : null;

  // D2 — Warn when the legacy escape-hatch is active so stale pins in test
  // output don't silently perpetuate. Forces deprecation awareness per KI-20.
  // Fires once per runProjection call; tests pinning the flag see this in
  // their stderr as a reminder to re-baseline. Gated on `typeof console` so
  // non-browser environments without console don't throw.
  if (useLegacyBucketHazard && typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[D2] Legacy bucket-hazard path active (useLegacyBucketHazard=true). " +
      "This test or caller is pinned to the pre-D2 default-hazard computation. " +
      "Re-baseline to per-position WARF hazard and remove the flag. See KI-20.",
    );
  }

  // D1: the two most-senior debt tranches (structurally Class A and Class B,
  // regardless of label) are non-deferrable per PPM — if they don't receive
  // full interest, the deal hits an Event of Default (not PIK). A tranche
  // incorrectly marked deferrable here would silently compound deferred
  // interest onto a non-deferrable balance and over-report equity — very
  // wrong. Fail fast so the resolver or user input is caught before it
  // poisons the projection.
  //
  // Predicate is rank-based, not name-based: protected = the lowest two
  // distinct seniorityRank values among non-income, non-amortising tranches.
  // This handles Class X-bearing structures (X amortising at rank 1 → A=2,
  // B=3 protected), pari-passu splits (B-1/B-2 sharing rank 2 both
  // protected), and non-canonical labels (a senior tranche named e.g.
  // "K-1" still trips the guard because rank, not name, decides).
  // Amortising tranches (Class X) are also non-deferrable per PPM and trip
  // a separate guard.
  const nonAmortDebtRanks = Array.from(
    new Set(
      tranches.filter((t) => !t.isIncomeNote && !t.isAmortising).map((t) => t.seniorityRank),
    ),
  ).sort((a, b) => a - b);
  const seniorProtectedRanks = new Set(nonAmortDebtRanks.slice(0, 2));
  for (const t of tranches) {
    if (t.isIncomeNote) continue;
    if (t.isAmortising && t.isDeferrable) {
      throw new Error(
        `Tranche "${t.className}" is amortising AND marked isDeferrable=true, ` +
          `but amortising tranches (e.g. Class X) cannot defer interest per PPM. ` +
          `Check resolver output or tranche input.`,
      );
    }
    if (seniorProtectedRanks.has(t.seniorityRank) && t.isDeferrable) {
      throw new Error(
        `Tranche "${t.className}" (seniorityRank=${t.seniorityRank}) is marked ` +
          `isDeferrable=true, but the two most-senior debt ranks (structurally ` +
          `Class A/B) are non-deferrable per PPM — non-payment of interest is ` +
          `an Event of Default, not deferral. Check resolver output or tranche input.`,
      );
    }
    // PPM § 10(a)(i) seed validation: priorInterestShortfall and
    // priorShortfallCount are non-deferrable-only state. Misuse on a
    // deferrable tranche silently produces wrong post-accel handoff
    // claims (deferred-interest seeding for deferrable tranches uses
    // separate state — see KI-27's deferredInterestBalance scope).
    // Misuse on income notes / amortising tranches is undefined.
    const hasShortfallSeed =
      (t.priorInterestShortfall ?? null) !== null ||
      (t.priorShortfallCount ?? null) !== null;
    if (hasShortfallSeed && (t.isDeferrable || t.isAmortising || t.isIncomeNote)) {
      throw new Error(
        `Tranche "${t.className}" carries priorInterestShortfall / ` +
          `priorShortfallCount but is deferrable / amortising / income-note. ` +
          `These seeds apply only to non-deferrable senior debt tranches per ` +
          `PPM § 10(a)(i). Check resolver output.`,
      );
    }
  }

  // Stub-period anchor (post-v6 plan §4.2). When `stubPeriod === true` and
  // `firstPeriodEndDate` is supplied, period 1 ends at the supplied date and
  // is shorter than a full quarter. Subsequent periods are full quarters
  // starting from that date. When `stubPeriod` is absent/false, the anchor
  // is `addQuarters(currentDate, 1)` — preserves pre-§4.2 behavior exactly.
  const useStub = stubPeriod === true && firstPeriodEndDate != null;
  const stubAnchor = useStub ? firstPeriodEndDate! : addQuarters(currentDate, 1);
  // periodEnd(q): end of period q. q=1 → stubAnchor; q>=2 → stubAnchor + (q-1) quarters.
  const periodEndDate = (q: number): string =>
    q === 1 ? stubAnchor : addQuarters(stubAnchor, q - 1);
  const periodStartDate = (q: number): string =>
    q === 1 ? currentDate : periodEndDate(q - 1);

  const maturityQuarters = maturityDate
    ? useStub
      ? 1 + Math.max(0, quartersBetween(stubAnchor, maturityDate))
      : Math.max(1, quartersBetween(currentDate, maturityDate))
    : CLO_DEFAULTS.defaultMaxTenorYears * 4;
  // Manager call gate (post-v6 plan §4.1): the call only fires when callMode is
  // "optionalRedemption" AND callDate is set. callMode === "none" is the
  // conservative baseline (project to legal final). Either condition false →
  // ignore callDate.
  const callActive = callMode === "optionalRedemption" && callDate != null;
  const callQuarters = callActive && callDate
    ? useStub
      ? 1 + Math.max(0, quartersBetween(stubAnchor, callDate))
      : Math.max(1, quartersBetween(currentDate, callDate))
    : null;
  const totalQuarters = callQuarters ? Math.min(callQuarters, maturityQuarters) : maturityQuarters;
  const recoveryLagQ = Math.max(0, Math.round(recoveryLagMonths / 3));

  // Pre-compute quarterly hazard rates per rating bucket. Used as a legacy
  // fallback when the D2 per-position path is explicitly opted out via
  // `useLegacyBucketHazard`, and for positions without a per-position
  // `warfFactor` when the flag is absent. See the default-draw loop below.
  // §7.5: when `cdrMultiplierPathFn` is supplied the engine recomputes
  // hazard per quarter from the path; the constant-path (`quarterlyHazard`)
  // is the q=undefined / fallback case used everywhere
  // `cdrMultiplierPathFn` is absent.
  const cdrToHazard = (annualCDR: number): number => {
    const clamped = Math.max(0, Math.min(annualCDR, 99.99));
    return 1 - Math.pow(1 - clamped / 100, 0.25);
  };
  const computeQuarterlyHazard = (cdrMap: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [rating, annualCDR] of Object.entries(cdrMap)) {
      out[rating] = cdrToHazard(annualCDR);
    }
    return out;
  };
  const quarterlyHazardConstant = computeQuarterlyHazard(defaultRatesByRating);

  // Quarterly prepay rate
  const clampedCpr = Math.max(0, Math.min(cprPct, 99.99));
  const qPrepayRate = 1 - Math.pow(1 - clampedCpr / 100, 0.25);

  // Internal per-loan state
  interface LoanState {
    survivingPar: number;
    maturityQuarter: number;
    ratingBucket: string;
    spreadBps: number;
    /** C2 — Moody's WARF factor for this position. Set from LoanInput.warfFactor
     *  when present (per-position rating), else fallback to coarse-bucket midpoint
     *  via BUCKET_WARF_FALLBACK. Reinvested loans use the bucket fallback on
     *  `reinvestmentRating`. */
    warfFactor: number;
    isFixedRate?: boolean;
    fixedCouponPct?: number;
    isDeferring?: boolean;
    isLossMitigationLoan?: boolean;
    currency?: string;
    moodysRatingFinal?: string;
    fitchRatingFinal?: string;
    isDelayedDraw?: boolean;
    ddtlSpreadBps?: number;
    drawQuarter?: number;
    /** Per-position market price as % of par. Set from LoanInput.currentPrice on
     *  initial construction. Reinvested positions default to 100 (just-originated
     *  at par). Used for A3 call-at-MtM liquidation AND B1 EoD MV × PB. */
    currentPrice?: number | null;
    /** B1 Tier 2 — per-position defaulted par awaiting recovery. Populated by
     *  the Monte Carlo default loop; drained when the corresponding recovery
     *  event arrives (quarter q + recoveryLagQ). While > 0, the loan
     *  contributes to the EoD Σ(MV × PB) component at currentPrice. */
    defaultedParPending: number;
    /** Scheduled per-position recovery events. Each entry drains
     *  `defaultedParPending` by its `defaultedPar` when its `quarter` arrives.
     *  Cash flow is captured separately via the aggregate `recoveryPipeline`
     *  so existing downstream cash accounting is unchanged. */
    defaultEvents: Array<{ quarter: number; defaultedPar: number }>;
  }

  const loanStates: LoanState[] = loans.map((l) => ({
    survivingPar: l.parBalance,
    // Don't clamp to totalQuarters — loans with maturity beyond the call/maturity date
    // should NOT be treated as maturing at par. Instead, they remain as surviving par
    // that gets liquidated at callPricePct on the final period.
    maturityQuarter: Math.max(1, quartersBetween(currentDate, l.maturityDate)),
    ratingBucket: l.ratingBucket,
    spreadBps: l.spreadBps,
    warfFactor: l.warfFactor ?? BUCKET_WARF_FALLBACK[l.ratingBucket] ?? BUCKET_WARF_FALLBACK.NR,
    isFixedRate: l.isFixedRate,
    fixedCouponPct: l.fixedCouponPct,
    isDeferring: l.isDeferring,
    isLossMitigationLoan: l.isLossMitigationLoan,
    currency: l.currency,
    moodysRatingFinal: l.moodysRatingFinal,
    fitchRatingFinal: l.fitchRatingFinal,
    isDelayedDraw: l.isDelayedDraw,
    ddtlSpreadBps: l.ddtlSpreadBps,
    drawQuarter: l.drawQuarter,
    currentPrice: l.currentPrice,
    defaultedParPending: 0,
    defaultEvents: [],
  }));

  // Remove never_draw DDTLs (drawQuarter <= 0) — they never fund and shouldn't appear in the portfolio
  for (let i = loanStates.length - 1; i >= 0; i--) {
    if (loanStates[i].isDelayedDraw && (loanStates[i].drawQuarter ?? 0) <= 0) {
      loanStates.splice(i, 1);
    }
  }

  const hasLoans = loanStates.length > 0;
  // Average loan size — used to chunk reinvestment into realistic individual loans for Monte Carlo.
  // Excludes unfunded DDTLs (already spliced for never_draw, still present for draw_at_deadline).
  const fundedLoans = loanStates.filter(l => !l.isDelayedDraw);
  const avgLoanSize = fundedLoans.length > 0
    ? fundedLoans.reduce((s, l) => s + l.survivingPar, 0) / fundedLoans.length
    : 0;

  // Reinvestment rating: user override or portfolio's par-weighted modal bucket (funded loans only)
  const reinvestmentRating = reinvestmentRatingOverride ?? (() => {
    const parByRating: Record<string, number> = {};
    for (const l of fundedLoans) {
      parByRating[l.ratingBucket] = (parByRating[l.ratingBucket] ?? 0) + l.survivingPar;
    }
    let best = "NR";
    let bestPar = 0;
    for (const [rating, par] of Object.entries(parByRating)) {
      // Tie-break alphabetically for deterministic results regardless of loan order
      if (par > bestPar || (par === bestPar && rating < best)) { best = rating; bestPar = par; }
    }
    return best;
  })();
  // C2 — WARF factor for reinvested positions. Uses the coarse-bucket fallback
  // (no per-position sub-bucket on reinvestment). NR→b2 proxy if bucket unknown.
  const reinvestmentWarfFactor = BUCKET_WARF_FALLBACK[reinvestmentRating] ?? BUCKET_WARF_FALLBACK.NR;

  // C1 — Max reinvestment amount that keeps the post-buy pool compliant with
  // every active reinvestment-period trigger:
  //   - Moody's Maximum WARF (`moodysWarfTriggerLevel`)
  //   - Min Weighted Average Floating Spread (`minWasBpsTrigger`,
  //     `floatingWAS + ExcessWAC`)
  //   - Moody's Caa Obligations concentration (`moodysCaaLimitPctTrigger`)
  //   - Fitch CCC Obligations concentration (`fitchCccLimitPctTrigger`)
  // Returns `requested` when no trigger is active or the buy fits entirely;
  // returns the boundary amount when the buy would breach a passing test;
  // returns 0 when the test is already breaching AND the reinvestment would
  // worsen it ("manager can maintain-or-improve but not actively worsen a
  // breaching test" — the engine's PPM-intent model). When several triggers
  // bind, the most restrictive boundary wins. Pure function of current
  // `loanStates` plus per-deal trigger inputs.
  const maxCompliantReinvestment = (currentQuarter: number, requested: number): number => {
    let allowed = requested;

    // Source the sums from the shared aggregator so the gate's pre-buy state
    // is bit-identical with `computePoolQualityMetrics`'s end-of-period
    // output. Drift between the two would mean the gate enforces against a
    // different pool than the one the partner sees on `qualityMetrics` —
    // exactly the parallel-implementation trap KI-21 tracks.
    const qLoans: QualityMetricLoan[] = [];
    for (const l of loanStates) {
      if (l.isDelayedDraw && (l.drawQuarter ?? 0) > currentQuarter) continue;
      if (l.survivingPar <= 0) continue;
      // Same partial-default exclusion as `computeQualityMetrics` —
      // mirroring the per-period helper exactly is a hard requirement of
      // KI-21 (parallel-implementation drift): the gate's pre-buy state
      // and the per-period output must apply identical exclusions, else
      // a reinvestment would be allowed against one denominator and
      // displayed against another.
      if (l.defaultedParPending > 0) continue;
      qLoans.push({
        parBalance: l.survivingPar,
        warfFactor: l.warfFactor,
        yearsToMaturity: 0, // unused by the gate's boundary math
        spreadBps: l.spreadBps,
        ratingBucket: l.ratingBucket,
        isFixedRate: l.isFixedRate,
        fixedCouponPct: l.fixedCouponPct,
        isDeferring: l.isDeferring,
        isLossMitigationLoan: l.isLossMitigationLoan,
        currency: l.currency,
        moodysRatingFinal: l.moodysRatingFinal,
        fitchRatingFinal: l.fitchRatingFinal,
      });
    }
    const {
      warfSum,
      totalPar: par,
      floatingPar,
      floatingSpreadSum,
      fixedPar,
      fixedCouponSum,
      concDenom,
      moodysCaaPar,
      fitchCccPar,
    } = aggregateQualityMetrics(qLoans, { dealCurrency });

    // ── WARF gate ──────────────────────────────────────────────────────────
    if (moodysWarfTriggerLevel != null && moodysWarfTriggerLevel > 0 && par > 0) {
      const factor = reinvestmentWarfFactor;
      const currentWarf = warfSum / par;
      // Factor at-or-below current WARF: adding it improves or holds. No limit.
      if (factor > currentWarf) {
        const postWarf = (warfSum + allowed * factor) / (par + allowed);
        if (postWarf > moodysWarfTriggerLevel) {
          // amount = (trigger × par − warfSum) / (factor − trigger).
          const denom = factor - moodysWarfTriggerLevel;
          if (denom > 0) {
            const boundary = (moodysWarfTriggerLevel * par - warfSum) / denom;
            allowed = Math.min(allowed, Math.max(0, boundary));
          }
        }
      }
    }

    // ── WAS gate (Min Weighted Average Floating Spread) ────────────────────
    // Reinvestment is floating-rate by construction (ratingBucket fallback,
    // spreadBps = reinvestmentSpreadBps). It contributes only to floating
    // numerator and floating denominator; the Excess WAC numerator (a
    // function of fixedPar / fixedCoupon) is invariant to X, the denominator
    // floatingPar grows with X.
    if (minWasBpsTrigger != null && minWasBpsTrigger > 0 && floatingPar > 0) {
      const refWAFC = referenceWafcPct ?? 4.0;
      const wafc = fixedPar > 0 ? fixedCouponSum / fixedPar : 0;
      const excessNumerator = (wafc - refWAFC) * 100 * fixedPar;
      // currentWAS bps = (floatingSpreadSum + excessNumerator) / floatingPar.
      const wasNumerator = floatingSpreadSum + excessNumerator;
      const currentWas = wasNumerator / floatingPar;
      const spread = reinvestmentSpreadBps;
      // If reinvestment spread ≥ current weighted-average, post-buy ≥ current.
      // If spread ≥ trigger, dilution toward trigger from above is fine.
      if (spread < currentWas && spread < minWasBpsTrigger) {
        const postNumerator = wasNumerator + allowed * spread;
        const postDenominator = floatingPar + allowed;
        const postWas = postNumerator / postDenominator;
        if (postWas < minWasBpsTrigger) {
          // X * (trigger − spread) = wasNumerator − trigger × floatingPar
          const denom = minWasBpsTrigger - spread;
          if (denom > 0) {
            const boundary = (wasNumerator - minWasBpsTrigger * floatingPar) / denom;
            allowed = Math.min(allowed, Math.max(0, boundary));
          }
        }
      }
    }

    // ── Moody's Caa concentration gate ─────────────────────────────────────
    // Reinvestment counts toward Caa only when its bucket-fallback rating is
    // CCC (engine reinvestment positions don't carry per-agency sub-buckets).
    // Non-CCC reinvestment dilutes the existing Caa share — never violates.
    if (
      moodysCaaLimitPctTrigger != null &&
      moodysCaaLimitPctTrigger > 0 &&
      concDenom > 0 &&
      reinvestmentRating === "CCC"
    ) {
      const limitFrac = moodysCaaLimitPctTrigger / 100;
      const denominator = 1 - limitFrac;
      if (denominator > 0) {
        // Already breaching → adding CCC always worsens (post > current when
        // current < 100% CCC). Block.
        if (moodysCaaPar / concDenom > limitFrac) {
          allowed = 0;
        } else {
          // Boundary: (caaPar + X)/(denom + X) = limit
          // X = (limit × denom − caaPar) / (1 − limit)
          const boundary = (limitFrac * concDenom - moodysCaaPar) / denominator;
          allowed = Math.min(allowed, Math.max(0, boundary));
        }
      }
    }

    // ── Fitch CCC concentration gate ───────────────────────────────────────
    if (
      fitchCccLimitPctTrigger != null &&
      fitchCccLimitPctTrigger > 0 &&
      concDenom > 0 &&
      reinvestmentRating === "CCC"
    ) {
      const limitFrac = fitchCccLimitPctTrigger / 100;
      const denominator = 1 - limitFrac;
      if (denominator > 0) {
        if (fitchCccPar / concDenom > limitFrac) {
          allowed = 0;
        } else {
          const boundary = (limitFrac * concDenom - fitchCccPar) / denominator;
          allowed = Math.min(allowed, Math.max(0, boundary));
        }
      }
    }

    return allowed;
  };

  // C2 — Compute end-of-period portfolio quality + concentration metrics from
  // `loanStates`. Ignores unfunded DDTLs and defaulted par pending recovery.
  // Called at each period emit so partner can see forward drift. Delegates
  // the math to `computePoolQualityMetrics` in pool-metrics.ts so the switch
  // simulator uses identical formulas (see KI-21 — avoid parallel impls).
  const computeQualityMetrics = (currentQuarter: number): PeriodQualityMetrics => {
    const qloans = [];
    for (const l of loanStates) {
      if (l.isDelayedDraw && (l.drawQuarter ?? 0) > currentQuarter) continue;
      if (l.survivingPar <= 0) continue;
      // Per PPM Condition 1 / definitions ("Defaulted Obligations", PDF p.
      // index TBD), the whole obligor is excluded from the Caa/CCC
      // concentration sets once any portion of its position is in default,
      // not just the defaulted portion. The conservative interpretation
      // (apply now, refine if PPM read says otherwise) skips any loan with
      // `defaultedParPending > 0` from the per-period quality metrics —
      // its surviving piece must NOT count toward Caa/CCC numerator or
      // denominator. Without this filter, a partially-defaulted Caa loan
      // would silently inflate `pctMoodysCaa` (numerator and denominator
      // both grow, but the rating-Caa flag biases the ratio upward),
      // potentially pushing reinvestment compliance gates past their
      // triggers. Magnitude is zero on Euro XV today (no partial defaults
      // in fixture) but emerges on portability + stress scenarios.
      if (l.defaultedParPending > 0) continue;
      qloans.push({
        parBalance: l.survivingPar,
        warfFactor: l.warfFactor,
        yearsToMaturity: Math.max(0, l.maturityQuarter - currentQuarter) / 4,
        spreadBps: l.spreadBps,
        ratingBucket: l.ratingBucket,
        isFixedRate: l.isFixedRate,
        fixedCouponPct: l.fixedCouponPct,
        isDeferring: l.isDeferring,
        isLossMitigationLoan: l.isLossMitigationLoan,
        currency: l.currency,
        moodysRatingFinal: l.moodysRatingFinal,
        fitchRatingFinal: l.fitchRatingFinal,
      });
    }
    return computePoolQualityMetrics(qloans, {
      referenceWAFC: referenceWafcPct ?? undefined,
      dealCurrency,
    });
  };

  // Track tranche balances (debt outstanding per tranche)
  const trancheBalances: Record<string, number> = {};
  // Deferred interest that doesn't compound — tracked separately so it
  // doesn't earn interest, but IS included in OC denominator and paydown.
  const deferredBalances: Record<string, number> = {};
  const sortedTranches = [...tranches].sort((a, b) => a.seniorityRank - b.seniorityRank);
  const debtTranches = sortedTranches.filter((t) => !t.isIncomeNote);
  const resolvedAmortPerPeriod: Record<string, number> = {};
  // Interest-payment shortfall on non-deferrable senior tranches. Per PPM
  // § 10(a)(i), missed interest on a non-deferrable tranche is NOT a PIK
  // accrual (no soft-deferrable carry-forward into next period's pre-accel
  // demand) — it is an EoD trigger after the deal-specific grace period.
  // This map records cumulative unpaid base interest per tranche so:
  //   (a) the EoD detector can fire when consecutive shortfall periods
  //       exceed `interestNonPaymentGracePeriods`, and
  //   (b) the post-acceleration handoff folds the running balance into
  //       `interestDueByTranche` (line ~2091) so the breach claim is whole.
  // Deferrable tranches use `deferredBalances` for PIK and don't accrue
  // here. Empty / all-zero in healthy scenarios.
  const interestShortfall: Record<string, number> = {};
  // Consecutive-period shortfall counter per non-deferrable senior tranche.
  // Increments each period the tranche is owed interest and receives less
  // than the full amount; resets to 0 on a fully-paid period. Drives the
  // PPM § 10(a)(i) grace-period gate for EoD detection.
  const shortfallCount: Record<string, number> = {};
  for (const t of sortedTranches) {
    trancheBalances[t.className] = t.currentBalance;
    deferredBalances[t.className] = 0;
    // Seed PPM § 10(a)(i) running state from the input. Null/undefined → 0
    // (no prior carry; standard for a healthy projection start). Populated
    // from a resolver-extracted trustee shortfall snapshot when the deal's
    // most recent payment date showed unpaid senior interest mid-grace.
    interestShortfall[t.className] = t.priorInterestShortfall ?? 0;
    shortfallCount[t.className] = t.priorShortfallCount ?? 0;
    if (t.isAmortising) {
      resolvedAmortPerPeriod[t.className] = t.amortisationPerPeriod ?? (t.currentBalance / CLO_DEFAULTS.defaultScheduledAmortPeriods);
    }
  }
  // EoD-protected tranches per PPM § 10(a)(i): the same set the D1 guard
  // uses (non-income, non-amortising tranches at the lowest two distinct
  // seniorityRank values). Computed once here rather than re-derived per
  // period — the rank topology is invariant across the projection.
  //
  // Edge case: a deal with NO non-amortising debt tranches (entire debt
  // stack is amortising — extremely unusual, structurally inconsistent
  // with PPM § 10(a)(i) which presumes a non-deferrable senior at risk
  // of payment shortfall) yields an empty set. The shortfall mechanic
  // then silently does nothing. This matches reality: there's no rank-
  // protected tranche to protect; § 10(a)(i) does not apply.
  // `accrueShortfall` skips amortising tranches anyway (line ~2660 below),
  // so `interestShortfall` would stay all-zero and the trigger has nothing
  // to detect. If a deal of this shape ever appears, the silent-disable
  // is the correct PPM-faithful behavior — but flag for a cross-check
  // against the deal's specific § 10 wording.
  const eodProtectedClassNames = new Set(
    tranches
      .filter((t) => !t.isIncomeNote && !t.isAmortising && seniorProtectedRanks.has(t.seniorityRank))
      .map((t) => t.className),
  );

  const ocTriggersByClass = ocTriggers;
  const icTriggersByClass = icTriggers;

  // Recovery pipeline: future cash from defaulted assets
  const recoveryPipeline: { quarter: number; amount: number }[] = [];

  // Seed recovery from pre-existing defaults (loans already defaulted before projection start).
  // Priced holdings: use market-price recovery. Unpriced holdings: use model recoveryPct.
  // Timing adjustment: if the compliance report is N quarters old, the default happened at least
  // N quarters ago, so the recovery is N quarters closer. Uses reportDate as proxy for default
  // date since exact default dates are rarely available in compliance reports.
  if (preExistingDefaultedPar > 0) {
    const totalRecovery = preExistingDefaultRecovery + unpricedDefaultedPar * (recoveryPct / 100);
    if (totalRecovery > 0) {
      const adjustedRecoveryQ = Math.max(1, 1 + recoveryLagQ - quartersSinceReport);
      recoveryPipeline.push({ quarter: adjustedRecoveryQ, amount: totalRecovery });
    }
  }

  // When loans are provided, use their total as the starting par (not the Adjusted CPA
  // which includes cash, haircuts, and other OC adjustments that are modeled separately).
  // Funded loan total excludes unfunded DDTLs — consistent with beginningPar/endingPar.
  const loanTotal = hasLoans ? loanStates.filter(l => !l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0) : 0;
  let currentPar = hasLoans ? loanTotal : initialPar;
  const periods: PeriodResult[] = [];
  const equityCashFlows: number[] = [];

  const tranchePayoffQuarter: Record<string, number | null> = {};
  let totalEquityDistributions = 0;

  const totalDebtOutstanding = debtTranches.reduce((s, t) => s + t.currentBalance, 0);
  // Equity investment: user-specified entry price if provided, otherwise balance-sheet implied value.
  const totalAssets = hasLoans ? loanTotal + initialPrincipalCash : initialPar;
  // The Math.max(0, totalAssets - totalDebtOutstanding) here is an
  // ACCOUNTING-CONVENTION floor (Phase 8 triage category β): negative
  // balance-sheet equity is reported as zero by convention. NOT a heuristic-
  // disguised-as-value (the once-proposed `q1Cash` floor at line ~1316 was
  // that, and was rejected because it manufactured fake alpha by ignoring
  // the determination-date overdraft).
  //
  // When this floor fires, equityCashFlows[0] = -0 and calculateIrr() returns
  // null on the all-non-negative series. Surfaced via initialState.equityWipedOut
  // so the UI can label this state rather than show "N/A".
  //
  // Note: the negative principalAccountCash IS retained inside totalAssets —
  // the determination-date overdraft is a real claim against equity at t=0.
  // Q1's principal-collection netting at line ~1316 uses the same signed
  // value; both are correct; floored variants would be wrong.
  const equityBookValueRaw = totalAssets - totalDebtOutstanding;
  const bookValue = Math.max(0, equityBookValueRaw);
  const equityWipedOut = equityBookValueRaw <= 0;
  const equityInvestment = inputs.equityEntryPrice != null && inputs.equityEntryPrice > 0
    ? inputs.equityEntryPrice
    : bookValue;
  equityCashFlows.push(-equityInvestment);

  for (const t of sortedTranches) {
    tranchePayoffQuarter[t.className] = null;
  }

  // Post-v6 plan §4.5: effective RP end is `max(extracted, user extension)`.
  // The max() preserves a late extracted RP — a user-set extension can lengthen
  // but never shorten the active reinvestment window.
  const effectiveRpEnd =
    reinvestmentPeriodExtension && reinvestmentPeriodEnd
      ? reinvestmentPeriodExtension > reinvestmentPeriodEnd
        ? reinvestmentPeriodExtension
        : reinvestmentPeriodEnd
      : reinvestmentPeriodExtension ?? reinvestmentPeriodEnd;
  const rpEndDate = effectiveRpEnd ? new Date(effectiveRpEnd) : null;

  // ── T=0 snapshot for N6 harness (determination-date compliance parity) ──
  // Computed BEFORE the period loop runs. Uses initial trancheBalances (no
  // mutations), initial pool par, initial principal cash, agency default
  // adjustments, and haircuts — equivalent to what the trustee reports as
  // of the determination date.
  const initialState: ProjectionInitialState = (() => {
    const poolPar = hasLoans ? loanTotal : initialPar;
    const ocEligibleAtStart = debtTranches.filter((t) => !t.isAmortising);

    // Pre-existing default OC adjustment — same formula as the in-loop version
    // at period q=1 (before any recovery arrives).
    const preExistingCashRecovery = preExistingDefaultRecovery + unpricedDefaultedPar * (recoveryPct / 100);
    const adjustedArrivalQ = Math.max(1, 1 + recoveryLagQ - quartersSinceReport);
    const preExistingRecoveryStillPending = preExistingDefaultedPar > 0 && 1 < adjustedArrivalQ;
    const ocDefaultAdjustment = (preExistingDefaultOcValue > 0 && preExistingRecoveryStillPending)
      ? preExistingDefaultOcValue - preExistingCashRecovery
      : 0;
    // Pending recoveries arriving at or before q=1 (zero at T=0 since we haven't elapsed any period yet)
    const pendingRecoveryValue = 0;
    const currentDdtlUnfundedPar = hasLoans
      ? loanStates.filter(l => l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0)
      : 0;
    const ocNumerator = poolPar + initialPrincipalCash + pendingRecoveryValue + ocDefaultAdjustment
      - discountObligationHaircut - longDatedObligationHaircut - impliedOcAdjustment - currentDdtlUnfundedPar;

    const ocTests: ProjectionInitialState["ocTests"] = ocTriggersByClass.map((oc) => {
      const debtAtAndAbove = ocEligibleAtStart
        .filter((t) => t.seniorityRank <= oc.rank)
        .reduce((s, t) => s + trancheBalances[t.className] + deferredBalances[t.className], 0);
      const actual = debtAtAndAbove > 0 ? (ocNumerator / debtAtAndAbove) * 100 : 999;
      return { className: oc.className, actual, trigger: oc.triggerLevel, passing: actual >= oc.triggerLevel };
    });

    // At T=0, the trustee IC test uses [Interest Collection − Senior Expenses
    // (A-D) − Senior Mgmt Fee (E) − Hedge Payments (F)] / [Interest Due on
    // senior tranches]. Replicate with initial pool par × effective rate for
    // the numerator base, minus the quarterly fees. Fees use the same formula
    // as the in-loop per-period deduction so pre-fill parity flows through —
    // including taxes (A.i) and admin (C), which were missing pre-Sprint-3
    // and broke the KI-IC-AB/C/D cascade (closures of KI-08 and the taxes/issuerProfit upstream didn't
    // move observed drift because this computation wasn't deducting them).
    const scheduledInterestOnCollateral = poolPar * (wacSpreadBps / 10000 + baseRatePct / 100) / 4;
    const taxesAmountT0 = poolPar * (taxesBps / 10000) / 4;
    // Issuer Profit is a fixed € per period (not par-scaled), same
    // absolute value at T=0 as in the forward loop. Deducting at T=0 keeps
    // IC compositional parity aligned with the in-loop path.
    const issuerProfitAmountT0 = issuerProfitAmount;
    const trusteeFeeAmountT0 = poolPar * (trusteeFeeBps / 10000) / 4;
    const adminFeeAmountT0 = poolPar * (adminFeeBps / 10000) / 4;
    const seniorFeeAmountT0 = poolPar * (seniorFeePct / 100) / 4;
    const hedgeCostAmountT0 = poolPar * (hedgeCostBps / 10000) / 4;
    const interestAfterFeesT0 = Math.max(
      0,
      scheduledInterestOnCollateral - taxesAmountT0 - issuerProfitAmountT0 - trusteeFeeAmountT0 - adminFeeAmountT0 - seniorFeeAmountT0 - hedgeCostAmountT0,
    );
    const icTests: ProjectionInitialState["icTests"] = icTriggersByClass.map((ic) => {
      const interestDueAtAndAbove = ocEligibleAtStart
        .filter((t) => t.seniorityRank <= ic.rank)
        .reduce((s, t) => s + trancheBalances[t.className] * trancheCouponRate(t, baseRatePct, baseRateFloorPct) / 4, 0);
      const actual = interestDueAtAndAbove > 0 ? (interestAfterFeesT0 / interestDueAtAndAbove) * 100 : 999;
      return { className: ic.className, actual, trigger: ic.triggerLevel, passing: actual >= ic.triggerLevel };
    });

    // B1 — Event of Default Par Value Test (PPM 10(a)(iv)) at T=0.
    // Compositional numerator, Class-A-only denominator. Runs only when the
    // resolver emitted a separately-tracked EoD test (post-B1 fixtures).
    let eodTest: EventOfDefaultTestResult | null = null;
    if (eventOfDefaultTest) {
      // loanStates carry per-position par + currentPrice + isDelayedDraw; at
      // T=0 none are defaulted (pre-existing defaults are already extracted
      // to preExistingDefaultedPar/OcValue and excluded from the loan list).
      const eodLoanStates = loanStates.map((l) => ({
        survivingPar: l.survivingPar,
        isDefaulted: false, // per-position default state activates in B1 tier-2
        currentPrice: l.currentPrice,
        isDelayedDraw: l.isDelayedDraw,
      }));
      const classAPao = computeSeniorTranchePao(tranches, trancheBalances);
      eodTest = computeEventOfDefaultTest(
        eodLoanStates,
        initialPrincipalCash,
        classAPao,
        eventOfDefaultTest.triggerLevel,
      );
    }

    return { poolPar, ocNumerator, ocTests, icTests, eodTest, equityBookValue: bookValue, equityWipedOut };
  })();

  // B2 — Post-acceleration mode flag. Persists across periods once set (PPM
  // Condition 10: acceleration irreversible without Class A supermajority,
  // which we model as permanent). Triggered by EoD breach at T=0 or in any
  // forward period. Flip happens AT the end of the breaching period, so the
  // NEXT period runs under acceleration.
  //
  // Two independent T=0 EoD checks:
  //   1. Compositional EoD (par-coverage test) via `initialState.eodTest`.
  //   2. PPM § 10(a)(i) interest-non-payment grace already exceeded at T=0
  //      via a seeded `priorShortfallCount` exceeding `eodGrace` on a
  //      rank-protected tranche. Without this check, a deal arriving with
  //      e.g. count=3 / grace=2 would silently run period 1 under pre-accel
  //      (which is wrong — the breach already occurred pre-projection).
  let isAccelerated =
    (initialState.eodTest !== null && !initialState.eodTest.passing) ||
    sortedTranches.some(
      (t) =>
        eodProtectedClassNames.has(t.className) &&
        (t.priorShortfallCount ?? 0) > eodGrace,
    );

  const draw: DefaultDrawFn = defaultDrawFn ?? ((par, hz) => par * hz);
  for (let q = 1; q <= totalQuarters; q++) {
    const periodDate = periodEndDate(q);
    const inRP = rpEndDate ? new Date(periodDate) <= rpEndDate : false;
    const isMaturity = q === totalQuarters;
    // Snapshot interestShortfall at start of period so we can detect
    // whether THIS period accrued a shortfall (post − pre > 0) for
    // shortfallCount + EoD-on-shortfall gating. Only pre-accel mutates
    // interestShortfall via accrueShortfall; post-accel folds the prior
    // running balance into interestDueByTranche and resets to 0.
    const bopInterestShortfall: Record<string, number> = { ...interestShortfall };
    // §7.5 + decision R: pull this quarter's path map once and use it for
    // BOTH the bucket-map hazard (legacy / fallback branch of the per-loan
    // default loop) AND the per-bucket multiplier on the per-position WARF
    // branch. Calling `cdrMultiplierPathFn(q)` once per quarter — calling
    // it twice would duplicate-count `q` in observability tests and double
    // any side effects the caller might have.
    const cdrPathMapThisQuarter = cdrMultiplierPathFn ? cdrMultiplierPathFn(q) : null;
    const quarterlyHazard = cdrPathMapThisQuarter
      ? computeQuarterlyHazard(cdrPathMapThisQuarter)
      : quarterlyHazardConstant;
    // Per-bucket multiplier = path[bucket] / baseline[bucket]. Applied to
    // warfFactor-derived hazards. When baseline is zero (path non-zero),
    // the multiplier is undefined and we fall back to the path's bucket-map
    // hazard for that loan — matches the bucket-map branch's semantic.
    const cdrPathMultiplier = (() => {
      if (!cdrPathMapThisQuarter) return null;
      const out: Record<string, number> = {};
      for (const bucket of Object.keys(cdrPathMapThisQuarter)) {
        const baseline = defaultRatesByRating[bucket] ?? 0;
        if (baseline > 0) {
          out[bucket] = cdrPathMapThisQuarter[bucket] / baseline;
        } else {
          // Baseline 0 → multiplier undefined. Encode as Infinity sentinel;
          // the consumer below interprets this as "use bucket-map hazard".
          out[bucket] = cdrPathMapThisQuarter[bucket] > 0 ? Infinity : 1;
        }
      }
      return out;
    })();

    // B3 / §4.2: period accrual window. Default cadence is full quarters from
    // currentDate; with stubPeriod=true, period 1 is `currentDate → firstPeriodEndDate`
    // (partial quarter), and periods 2+ run as full quarters from firstPeriodEndDate.
    const periodStart = periodStartDate(q);
    const periodEnd = periodDate;
    const dayFracActual = dayCountFraction("actual_360", periodStart, periodEnd);
    const dayFrac30 = dayCountFraction("30_360", periodStart, periodEnd);
    // Period fraction relative to a standard quarter (0.25 year). Used to
    // prorate quarterly hazard / prepay rates for stub periods. For full
    // quarters this is approximately 1.0 and would alter pinned hazards by
    // ~1% (90 vs 91 days); we therefore only enable proration when stub mode
    // is active to preserve byte-identical output on legacy fixtures.
    const periodFraction = dayFracActual / 0.25;
    const prorate = (rate: number): number =>
      useStub && q === 1 ? 1 - Math.pow(1 - rate, periodFraction) : rate;
    /** Day-count fraction for a given tranche this period: Actual/360 for
     *  floating, 30/360 for fixed-rate. */
    const trancheDayFrac = (t: ProjectionInputs["tranches"][number]): number =>
      t.isFloating ? dayFracActual : dayFrac30;

    // ── §4.3 balance instrumentation: capture defaulted-par at period start
    // BEFORE any per-period mutations so the conservation invariant holds.
    const beginningDefaultedPar = hasLoans
      ? loanStates.reduce((s, l) => s + l.defaultedParPending, 0)
      : 0;

    // ── 1. Beginning par ──────────────────────────────────────────
    // ── 1b. DDTL draw event (before beginningPar capture) ──────────
    if (hasLoans) {
      for (const loan of loanStates) {
        if (!loan.isDelayedDraw) continue;
        if (q === loan.drawQuarter) {
          const fundedPar = loan.survivingPar * (ddtlDrawPercent / 100);
          loan.survivingPar = fundedPar;
          loan.spreadBps = loan.ddtlSpreadBps ?? 0;
          loan.isDelayedDraw = false;
        }
      }
    }

    // Beginning par excludes unfunded DDTLs — they are not deployed collateral
    // and should not be in the fee base (trustee, management, hedge fees).
    const beginningPar = hasLoans
      ? loanStates.filter(l => !l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0)
      : currentPar;
    const beginningLiabilities = debtTranches.reduce((s, t) => s + trancheBalances[t.className] + deferredBalances[t.className], 0);

    // ── Step-trace accumulators (for N1 harness) ────────────────────────
    // Multi-site values (OC cure diversions, reinv OC diversion, PIK accrual)
    // need accumulation across the period. Single-site fee amounts are captured
    // directly at emission.
    const _stepTrace_ocCureDiversions: Array<{ rank: number; mode: "reinvest" | "paydown"; amount: number }> = [];
    let _stepTrace_reinvOcDiversion = 0;
    let _stepTrace_classXAmortFromInterest = 0;
    const _amortFromInterestByTranche: Record<string, number> = {};
    for (const t of debtTranches) _amortFromInterestByTranche[t.className] = 0;
    const _stepTrace_deferredAccrualByTranche: Record<string, number> = {};
    for (const t of debtTranches) _stepTrace_deferredAccrualByTranche[t.className] = 0;

    // Per-loan beginning par for interest calc (post-draw, so newly-funded DDTLs are included)
    const loanBeginningPar = hasLoans ? loanStates.map((l) => l.survivingPar) : [];

    // ── 2. Per-loan maturities (before defaults — maturing loans pay at par) ──
    let totalMaturities = 0;
    if (hasLoans) {
      for (const loan of loanStates) {
        if (loan.isDelayedDraw) continue;
        if (q === loan.maturityQuarter) {
          totalMaturities += loan.survivingPar;
          loan.survivingPar = 0;
        }
      }
    }

    // ── 3a. Drain defaulted-par-pending on loans whose recovery arrived
    //     this period. Cash flow is handled separately by the aggregate
    //     `recoveryPipeline`; this loop only updates the per-loan
    //     defaultedParPending so the EoD MV × PB component reflects current
    //     (not-yet-recovered) defaulted par at the end of this period.
    if (hasLoans) {
      for (const loan of loanStates) {
        if (loan.defaultEvents.length === 0) continue;
        const arrived = loan.defaultEvents.filter((e) => e.quarter <= q);
        const remaining = loan.defaultEvents.filter((e) => e.quarter > q);
        for (const e of arrived) {
          loan.defaultedParPending = Math.max(0, loan.defaultedParPending - e.defaultedPar);
        }
        loan.defaultEvents = remaining;
      }
    }

    // ── 3b. Per-loan defaults (only on non-maturing surviving loans) ──
    let totalDefaults = 0;
    const defaultsByRating: Record<string, number> = {};
    const loanDefaultEventsThisPeriod: PeriodResult["loanDefaultEvents"] = [];

    if (hasLoans) {
      for (let idx = 0; idx < loanStates.length; idx++) {
        const loan = loanStates[idx];
        if (loan.survivingPar <= 0) continue;
        if (loan.isDelayedDraw) continue;
        // D2 — Per-position hazard is the default behavior (Moody's CLO
        // methodology). `useLegacyBucketHazard` escapes to the pre-D2
        // bucket-averaged path when legacy tests need their pinning
        // preserved. Per-position distinguishes Caa1 (factor 4770 ≈ 6.3%
        // annual) from Caa3 (8070 ≈ 15.2% annual) which the bucket map
        // averages together as "CCC" at 10.28%. Positions without a
        // `warfFactor` (shouldn't happen post-D2 since construction always
        // populates from LoanInput or BUCKET_WARF_FALLBACK) fall back to
        // the bucket map as a defensive path.
        const isBucketOverridden = overriddenBucketSet?.has(loan.ratingBucket) ?? false;
        const usingBucketBranch =
          useLegacyBucketHazard || isBucketOverridden || loan.warfFactor <= 0;
        let baseHazard: number;
        if (usingBucketBranch) {
          // Bucket-map branch — already path-aware via `quarterlyHazard`
          // recompute above.
          baseHazard = quarterlyHazard[loan.ratingBucket] ?? 0;
        } else {
          // Per-position WARF branch. Scale by cdrPathMultiplier when a
          // path is active; otherwise constant.
          const warfHazard = warfFactorToQuarterlyHazard(loan.warfFactor);
          if (cdrPathMultiplier == null) {
            baseHazard = warfHazard;
          } else {
            const m = cdrPathMultiplier[loan.ratingBucket] ?? 1;
            if (m === Infinity) {
              // Baseline 0, path non-zero — fall back to bucket-map path
              // hazard since the multiplier is undefined.
              baseHazard = quarterlyHazard[loan.ratingBucket] ?? 0;
            } else {
              baseHazard = warfHazard * m;
            }
          }
        }
        const hazard = prorate(baseHazard);
        const loanDefaults = draw(loan.survivingPar, hazard);
        loan.survivingPar -= loanDefaults;
        totalDefaults += loanDefaults;
        if (loanDefaults > 0) {
          defaultsByRating[loan.ratingBucket] = (defaultsByRating[loan.ratingBucket] ?? 0) + loanDefaults;
          const scheduledRecoveryQuarter = q + recoveryLagQ;
          // B1 Tier 2: track per-position defaulted par + scheduled recovery.
          loan.defaultedParPending += loanDefaults;
          loan.defaultEvents.push({ quarter: scheduledRecoveryQuarter, defaultedPar: loanDefaults });
          // Emit per-loan event to PeriodResult so tests can cross-verify the
          // aggregate `recoveryPipeline` path uses the same per-loan schedule.
          loanDefaultEventsThisPeriod.push({
            loanIndex: idx,
            defaultedPar: loanDefaults,
            scheduledRecoveryQuarter,
          });
        }
      }
    }

    if (totalDefaults > 0 && recoveryPct > 0) {
      recoveryPipeline.push({ quarter: q + recoveryLagQ, amount: totalDefaults * (recoveryPct / 100) });
    }

    // ── 4. Per-loan prepayments ─────────────────────────────────────
    let totalPrepayments = 0;
    if (hasLoans) {
      for (const loan of loanStates) {
        if (loan.survivingPar > 0) {
          if (loan.isDelayedDraw) continue;
          const prepay = loan.survivingPar * prorate(qPrepayRate);
          loan.survivingPar -= prepay;
          totalPrepayments += prepay;
        }
      }
    }

    // ── Aggregate ──────────────────────────────────────────────────
    let defaults: number;
    let prepayments: number;
    const scheduledMaturities = totalMaturities;
    if (hasLoans) {
      defaults = totalDefaults;
      prepayments = totalPrepayments;
    } else {
      // Fallback: apply aggregate CDR/CPR to currentPar.
      // Without loan-level data, weight toward non-zero buckets (AAA/AA at 0% would
      // dilute the average if included equally with B/CCC).
      const allRates = Object.values(defaultRatesByRating);
      const avgAnnualCdr = allRates.length > 0
        ? allRates.reduce((s, v) => s + v, 0) / allRates.length
        : 0;
      const qHazard = 1 - Math.pow(1 - Math.min(avgAnnualCdr, 99.99) / 100, 0.25);
      defaults = currentPar * prorate(qHazard);
      currentPar -= defaults;
      prepayments = currentPar * prorate(qPrepayRate);
      currentPar -= prepayments;

      if (defaults > 0 && recoveryPct > 0) {
        recoveryPipeline.push({ quarter: q + recoveryLagQ, amount: defaults * (recoveryPct / 100) });
      }
    }

    // ── 5. Recoveries ───────────────────────────────────────────
    const recoveries = isMaturity
      ? recoveryPipeline.filter((r) => r.quarter >= q).reduce((s, r) => s + r.amount, 0)
      : recoveryPipeline.filter((r) => r.quarter === q).reduce((s, r) => s + r.amount, 0);

    // ── 6. Interest collection ─────────────────────────────────
    const flooredBaseRate = Math.max(baseRateFloorPct, baseRatePct);
    let interestCollected: number;
    if (hasLoans) {
      interestCollected = 0;
      for (let i = 0; i < loanStates.length; i++) {
        const loan = loanStates[i];
        if (loan.isDelayedDraw) continue;
        const loanBegPar = loanBeginningPar[i];
        if (loan.isFixedRate) {
          interestCollected += loanBegPar * (loan.fixedCouponPct ?? 0) / 100 * dayFracActual;
        } else {
          interestCollected += loanBegPar * (flooredBaseRate + loan.spreadBps / 100) / 100 * dayFracActual;
        }
      }
      // Q1: initial principal cash earns interest at money market rate (~ESTR) for the quarter.
      // This cash sits in accounts before being reinvested or paid down.
      if (q === 1 && initialPrincipalCash > 0) {
        // Cash in principal accounts earns MMF/ESTR yield, not EURIBOR. Using the floored
        // base rate as a proxy — ESTR tracks ~10-15bps below 3M EURIBOR, immaterial here.
        interestCollected += initialPrincipalCash * flooredBaseRate / 100 * dayFracActual;
      }
    } else {
      const allInRate = (flooredBaseRate + wacSpreadBps / 100) / 100;
      interestCollected = beginningPar * allInRate * dayFracActual;
    }

    // ── 7. Reinvestment ─────────────────────────────────────────
    // No reinvestment on the final period (call or maturity) — the deal is winding down.
    let reinvestment = 0;
    const principalProceeds = prepayments + scheduledMaturities + recoveries;
    // Q1: initial principal cash (uninvested proceeds already in accounts) treated as
    // additional principal proceeds — reinvested during RP, flows to paydown outside RP.
    // Policy: during RP, cash IS reinvested (manager has discretion to deploy).
    // Post-RP, cash goes to paydown only — the indenture restricts reinvestment to new
    // principal proceeds from the portfolio, not pre-existing account balances.
    const q1Cash = (q === 1) ? initialPrincipalCash : 0;
    const totalPrincipalAvailable = principalProceeds + q1Cash;
    if (!isMaturity && inRP) {
      reinvestment = totalPrincipalAvailable;
    } else if (!isMaturity && postRpReinvestmentPct > 0 && principalProceeds > 0) {
      // Post-RP limited reinvestment (credit improved/risk sales, unscheduled principal)
      reinvestment = principalProceeds * (postRpReinvestmentPct / 100);
    }
    // C1 — Reinvestment compliance enforcement. The single gate
    // `maxCompliantReinvestment` applies all four triggers in turn (WARF,
    // Min WAS, Moody's Caa, Fitch CCC) and returns the most-restrictive
    // boundary. The blocked portion falls through to the principal
    // waterfall for senior paydown.
    let reinvestmentBlockedCompliance = 0;
    const anyComplianceTriggerActive =
      moodysWarfTriggerLevel != null ||
      minWasBpsTrigger != null ||
      moodysCaaLimitPctTrigger != null ||
      fitchCccLimitPctTrigger != null;
    if (reinvestment > 0 && hasLoans && anyComplianceTriggerActive) {
      const allowed = maxCompliantReinvestment(q, reinvestment);
      if (allowed < reinvestment) {
        reinvestmentBlockedCompliance = reinvestment - allowed;
        reinvestment = allowed;
      }
    }
    if (reinvestment > 0 && hasLoans) {
      const matQ = q + reinvestmentTenorQuarters;
      // Split reinvestment into individual loans sized to the portfolio average.
      // Improves Monte Carlo accuracy: each loan defaults independently instead
      // of one giant loan going all-or-nothing.
      if (avgLoanSize > 0 && reinvestment > avgLoanSize * 1.5) {
        let remaining = reinvestment;
        while (remaining > 0) {
          const par = Math.min(avgLoanSize, remaining);
          loanStates.push({ survivingPar: par, ratingBucket: reinvestmentRating, spreadBps: reinvestmentSpreadBps, warfFactor: reinvestmentWarfFactor, maturityQuarter: matQ, isFixedRate: false, isDelayedDraw: false, defaultedParPending: 0, defaultEvents: [] });
          remaining -= par;
        }
      } else {
        loanStates.push({ survivingPar: reinvestment, ratingBucket: reinvestmentRating, spreadBps: reinvestmentSpreadBps, warfFactor: reinvestmentWarfFactor, maturityQuarter: matQ, isFixedRate: false, isDelayedDraw: false, defaultedParPending: 0, defaultEvents: [] });
      }
    }

    // Update currentPar from loan states or fallback.
    // Excludes unfunded DDTLs — they are not deployed collateral.
    if (hasLoans) {
      currentPar = loanStates.filter(l => !l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0);
    } else {
      if (reinvestment > 0) {
        currentPar += reinvestment;
      }
    }

    let endingPar = hasLoans
      ? loanStates.filter(l => !l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0)
      : currentPar;

    // ── 8. Preliminary principal paydown ─────────────────────────
    // Pay down tranches from principal proceeds BEFORE computing OC
    // tests so the ratios use post-paydown liability balances. This
    // avoids a false OC breach at the RP boundary where par drops
    // (no reinvestment) but liabilities haven't been reduced yet.
    //
    // IMPORTANT: Save BOP tranche balances first — interest DUE and
    // IC tests must use beginning-of-period balances since interest
    // accrues on the balance before any principal paydown.
    //
    // C3 — Senior Expenses Cap at steps (B) + (C):
    //   Trustee fee (B) + Admin expenses (C) jointly capped at
    //   `seniorExpensesCapBps` × beginningPar × dayFrac. Capped portion is
    //   paid up-front as part of senior expenses; any overflow defers to
    //   PPM step (Y) trustee-overflow and (Z) admin-overflow, which pay
    //   from residual interest AFTER tranche interest + sub mgmt fee.
    //   When the cap isn't set (undefined), expenses emit uncapped —
    //   legacy / synthetic-test behaviour.
    // Step (A)(i) Issuer taxes. Deducted before trustee fees per PPM.
    const taxesAmount = beginningPar * (taxesBps / 10000) * dayFracActual;
    // Step (A)(ii) Issuer Profit Amount. Fixed absolute € per period
    // (PPM Condition 1 definitions — €250 regular, €500 post-Frequency-Switch).
    // Deducted immediately after taxes and before trustee fees. Not
    // day-count adjusted (fixed amount per waterfall event, not an accrual).
    const issuerProfitPaid = issuerProfitAmount;
    const trusteeFeeRequested = beginningPar * (trusteeFeeBps / 10000) * dayFracActual;
    const adminFeeRequested = beginningPar * (adminFeeBps / 10000) * dayFracActual;
    const cappedRequested = trusteeFeeRequested + adminFeeRequested;
    const capAmount = seniorExpensesCapBps != null
      ? beginningPar * (seniorExpensesCapBps / 10000) * dayFracActual
      : Infinity;
    const cappedPaid = Math.min(cappedRequested, capAmount);
    const cappedOverflowTotal = cappedRequested - cappedPaid;
    // Allocate capped portion pro rata between trustee and admin so each
    // stepTrace bucket reflects the same cap ratio.
    const cappedRatio = cappedRequested > 0 ? cappedPaid / cappedRequested : 0;
    const trusteeFeeAmount = trusteeFeeRequested * cappedRatio;
    const adminFeeAmount = adminFeeRequested * cappedRatio;
    // Overflow per bucket (for emission at steps Y/Z).
    const trusteeOverflowRequested = trusteeFeeRequested - trusteeFeeAmount;
    const adminOverflowRequested = adminFeeRequested - adminFeeAmount;

    // PPM Step E: Senior collateral management fee (NOT capped).
    const seniorFeeAmount = beginningPar * (seniorFeePct / 100) * dayFracActual;
    // PPM Step F: Hedge payments (NOT capped).
    const hedgeCostAmount = beginningPar * (hedgeCostBps / 10000) * dayFracActual;
    // KI-21 Scope 2 closure: single canonical breakdown drives BOTH the IC
    // numerator (via sumSeniorExpensesPreOverflow) AND the cash-flow chain
    // (via applySeniorExpensesToAvailable below). Trustee/admin overflow at
    // steps Y/Z is computed separately on residual interest after tranche
    // interest, so it's set later (see `trusteeOverflowPaid` block).
    //
    // Consumer asymmetry (intentional, do not "fix"): the IC numerator
    // below uses requested (`sumSeniorExpensesPreOverflow(seniorExpenseBreakdown)`)
    // while stepTrace emission uses paid (the `paid` return of
    // applySeniorExpensesToAvailable). The IC denominator at the IC test
    // below is contractual interest due (par × coupon × dayfrac, not
    // actually-paid tranche interest), so the numerator is contractual for
    // dimensional symmetry — IC is a forward-looking compliance ratio of
    // contractual obligations, not a backward-looking cash report. This
    // matches the canonical CLO-market reading of IC tests.
    //
    // Caveat: PPM language varies. A deal whose PPM explicitly defines
    // the IC numerator as "Interest Proceeds minus actually-paid senior
    // expenses" would require switching the consumer to `paid`. We have
    // not verified Euro XV's specific PPM clause; on portability to a
    // new deal, re-confirm the IC definition and adjust if needed.
    //
    // Numerical equivalence under the floor at the next line means the
    // output is identical today; the comment is documentation-only for
    // now, but flips to load-bearing the moment either the floor is
    // removed (see comment there) or a per-deal IC definition diverges.
    const seniorExpenseBreakdown: SeniorExpenseBreakdown = {
      taxes: taxesAmount,
      issuerProfit: issuerProfitPaid,
      trusteeCapped: trusteeFeeAmount,
      adminCapped: adminFeeAmount,
      seniorMgmt: seniorFeeAmount,
      hedge: hedgeCostAmount,
      trusteeOverflow: 0,
      adminOverflow: 0,
    };
    const totalSeniorExpenses = sumSeniorExpensesPreOverflow(seniorExpenseBreakdown);
    // The Math.max(0, …) floor here is load-bearing for the requested-vs-paid
    // equivalence noted above: under stress where requested > available, paid
    // = available (truncated by the helper), so available − paid = 0; without
    // this floor, available − requested would go negative and the two
    // formulations would diverge in the IC numerator. If you remove the
    // floor (e.g., to throw on < 0 as a stricter invariant), the IC consumer
    // must switch to `seniorExpensesApplied.paid` to preserve the equivalence.
    const interestAfterFees = Math.max(0, interestCollected - totalSeniorExpenses);

    const bopTrancheBalances: Record<string, number> = {};
    for (const t of debtTranches) {
      bopTrancheBalances[t.className] = trancheBalances[t.className];
    }

    // Post-v6 plan §4.1: when manager call fires (callActive), liquidate per
    // callPriceMode. When the projection reaches legal final without a call,
    // loans redeem at par. Aggregate-mode deals (no loan list) under manual
    // mode fall back to endingPar × callPricePct/100; under par/market modes
    // the aggregate fallback is endingPar at face value (no per-position info
    // to apply market prices to). The "market without loans" combination is
    // not supported — runProjection's pre-period validation should catch.
    const liquidationProceeds = isMaturity
      ? (callActive
          ? (hasLoans
              ? computeCallLiquidation(loanStates, callPricePct, callPriceMode)
              : callPriceMode === "manual"
                ? endingPar * (callPricePct / 100)
                : endingPar)
          : endingPar)
      : 0;
    let prelimPrincipal = prepayments + scheduledMaturities + recoveries + q1Cash - reinvestment + liquidationProceeds;
    if (prelimPrincipal < 0) prelimPrincipal = 0;

    // B2 — Post-acceleration branch. If the prior period triggered EoD
    // (isAccelerated set at end of period q-1), pool interest + principal
    // into a single cash stream and distribute through POST_ACCEL_SEQUENCE.
    // Senior expenses uncapped, rated tranches P+I sequential (Class A first,
    // then B pari passu, then C/D/E/F), sub fees and incentive only if
    // rated notes fully retired, residual to Sub Noteholders. Deferred
    // interest under acceleration is NOT PIKed — unpaid interest is a
    // shortfall captured in the executor's output for diagnostic visibility.
    if (isAccelerated) {
      const totalCashUnderAccel = interestCollected + prelimPrincipal;

      // Interest due per tranche from BOP balances × coupon × day-count fraction,
      // PLUS any pre-acceleration carried shortfall on non-deferrable tranches.
      // Once accelerated, prior-period unpaid interest becomes part of the
      // accelerated interest claim — losing it on the handoff would silently
      // discharge the obligation and overstate residual cash.
      const interestDueByTranche: Record<string, number> = {};
      for (const t of debtTranches) {
        const baseDue =
          bopTrancheBalances[t.className] * trancheCouponRate(t, baseRatePct, baseRateFloorPct) * trancheDayFrac(t);
        interestDueByTranche[t.className] = baseDue + (interestShortfall[t.className] ?? 0);
      }
      // Reset pre-accel carry now that it's been folded into the accelerated
      // claim — post-accel tracks its own period shortfall in accelResult.
      // Scope MUST mirror `accrueShortfall`'s write predicate (non-amortising
      // non-income debt) — anything else is a no-op today (amortising and
      // income tranches never accrue) and a latent trap if a future change
      // routes amortising-tranche shortfall through this state.
      //
      // INVARIANT: this reset must occur BEFORE the EoD-on-shortfall
      // detector reads `interestShortfall`. The current detector at the
      // pre-accel emit site is gated `if (!isAccelerated)` — so the
      // post-accel branch never reaches the detector. If that gate is
      // ever relaxed (e.g., to detect a secondary EoD condition under
      // acceleration), the reset here would have already cleared the
      // value and `delta = end - bop` would always be ≤ 0, silently
      // disabling the detector. Preserve the gate, or move the reset.
      for (const t of debtTranches) {
        if (!t.isAmortising) interestShortfall[t.className] = 0;
      }

      // Sub mgmt fee amount (same formula as normal mode, subject to cash).
      const subFeeAmountUnderAccel = beginningPar * (subFeePct / 100) * dayFracActual;

      const accelResult = runPostAccelerationWaterfall({
        totalCash: totalCashUnderAccel,
        tranches,
        trancheBalances,
        deferredBalances,
        seniorExpenses: {
          // `taxesAmount` computed from taxesBps.
          // Under acceleration taxes are still paid at step (A)(i) per PPM.
          taxes: taxesAmount,
          // Issuer Profit at step (A.ii). Fixed
          // absolute € per period; still paid under acceleration per PPM.
          issuerProfit: issuerProfitPaid,
          // PPM 10(b): Senior Expenses Cap DISAPPEARS under acceleration —
          // trustee + admin fees pay uncapped (steps B + C directly, no
          // overflow deferral to Y/Z). Pass the REQUESTED amounts, not the
          // cap-truncated amounts used in normal mode.
          trusteeFees: trusteeFeeRequested,
          adminExpenses: adminFeeRequested,
          // Inherits KI-12a fee-base discrepancy (beginningPar vs prior
          // Determination Date ACB) from normal mode — see KI-12a "Scope note".
          seniorMgmtFee: seniorFeeAmount,
          hedgePayments: hedgeCostAmount,
        },
        interestDueByTranche,
        subMgmtFee: subFeeAmountUnderAccel,
        // KI-15: incentive fee under acceleration hardcoded inactive. Correct
        // under most distressed paths (hurdle not met) but wrong for edge
        // scenarios with accumulated pre-breach equity distributions. Fix
        // plan: carry equityCashFlows into accel branch and run
        // resolveIncentiveFee here — ~0.5 day per KI-15 ledger.
        incentiveFeeActive: false,
        incentiveFeePct,
      });

      // Apply post-executor tranche balances.
      for (const d of accelResult.trancheDistributions) {
        const origPrincipal = trancheBalances[d.className];
        // Principal portion is deducted from trancheBalances; deferred stays
        // put (no PIK under acceleration, no cure-type drains either).
        trancheBalances[d.className] = Math.max(0, origPrincipal - d.principalPaid);
      }

      const endingLiabilitiesAccel = debtTranches.reduce(
        (s, t) => s + trancheBalances[t.className] + deferredBalances[t.className],
        0,
      );
      const equityDistributionAccel = accelResult.residualToSub;
      totalEquityDistributions += equityDistributionAccel;
      equityCashFlows.push(equityDistributionAccel);

      // §4.3 balance instrumentation (post-acceleration branch).
      const endingDefaultedParAccel = hasLoans
        ? loanStates.reduce((s, l) => s + l.defaultedParPending, 0)
        : 0;

      periods.push({
        periodNum: q,
        date: periodDate,
        beginningPar,
        beginningPerformingPar: beginningPar,
        endingPerformingPar: endingPar,
        beginningDefaultedPar,
        endingDefaultedPar: endingDefaultedParAccel,
        beginningPrincipalAccount: 0,
        endingPrincipalAccount: 0,
        beginningInterestAccount: 0,
        endingInterestAccount: 0,
        defaults,
        prepayments,
        scheduledMaturities,
        recoveries,
        principalProceeds: prepayments + scheduledMaturities + recoveries,
        reinvestment: 0,
        endingPar,
        interestCollected,
        beginningLiabilities,
        endingLiabilities: endingLiabilitiesAccel,
        trancheInterest: accelResult.trancheDistributions.map((d) => ({
          className: d.className,
          due: d.interestDue,
          paid: d.interestPaid,
        })),
        tranchePrincipal: accelResult.trancheDistributions.map((d) => ({
          className: d.className,
          paid: d.principalPaid,
          // Acceleration: amortising tranches are excluded from the accel
          // waterfall (`runPostAccelerationWaterfall` filters !isAmortising).
          // Step-G amort lane doesn't apply post-breach. Zero per the
          // stepTrace.classXAmortFromInterest = 0 invariant.
          paidFromInterest: 0,
          endBalance: d.endBalance,
        })),
        // Pre-acceleration cumulative carry was folded into
        // `interestDueByTranche` at the handoff (line ~2163) and reset to
        // 0; the field's cumulative-carry semantic is consistent across
        // accel/pre-accel by emitting empty here. Post-accel per-period
        // unpaid lives on its own field below.
        interestShortfall: {},
        // Per-period unpaid interest from the accelerated waterfall.
        // Distinct semantic from `interestShortfall` (cumulative pre-accel
        // carry) — populated only under acceleration.
        perPeriodInterestShortfall: { ...accelResult.perPeriodInterestShortfall },
        // Counter is frozen under post-acceleration (no longer mutated).
        // Emit empty so consumers iterating across periods don't see
        // stale counter values from the breach period.
        interestShortfallCount: {},
        // OC / IC / EoD tests emitted empty under acceleration — PPM-correct,
        // not a deferred simplification. The class-level OC/IC cure mechanics
        // don't apply post-acceleration: coverage-test diversions only fire
        // during normal operations to keep the deal out of distress. Once
        // accelerated, the waterfall just pays down rated notes sequentially
        // and those tests stop gating cash flow. Same for EoD — the condition
        // already triggered; further checks are moot until acceleration is
        // rescinded (which we model as never).
        ocTests: [],
        icTests: [],
        eodTest: null,
        isAccelerated: true,
        loanDefaultEvents: loanDefaultEventsThisPeriod,
        equityDistribution: equityDistributionAccel,
        defaultsByRating,
        stepTrace: {
          // Under acceleration PPM 10(b) removes the Senior Expenses Cap, so
          // trustee + admin pay directly at steps (B)+(C) uncapped, with no
          // overflow deferral to (Y)/(Z). Each step emits its own bucket so
          // the N1 harness compares B vs B and C vs C — the B2 regression
          // guard asserts adminFeesPaid > 0 directly, no subtraction needed.
          taxes: accelResult.seniorExpensesPaid.taxes,
          issuerProfit: accelResult.seniorExpensesPaid.issuerProfit,
          trusteeFeesPaid: accelResult.seniorExpensesPaid.trusteeFees,
          adminFeesPaid: accelResult.seniorExpensesPaid.adminExpenses,
          trusteeOverflowPaid: 0,
          adminOverflowPaid: 0,
          seniorMgmtFeePaid: accelResult.seniorExpensesPaid.seniorMgmtFee,
          hedgePaymentPaid: accelResult.seniorExpensesPaid.hedgePayments,
          // Acceleration mode (PPM 10(b)): senior expenses cap is removed
          // and interest+principal pool together for sequential P+I
          // distribution. "Available for tranches" doesn't have a coherent
          // meaning here. UI hides the row + renders an explanatory header.
          availableForTranches: null,
          subMgmtFeePaid: accelResult.subMgmtFeePaid,
          // Incentive fee collapsed into a single bucket under acceleration —
          // the executor returns one aggregated value (pre-residual), and the
          // normal-mode interest/principal split isn't meaningful here.
          // incentiveFeeFromPrincipal hardcoded 0 preserves stepTrace shape
          // without duplicating the fee. Partner-visible total = incentiveFeePaid.
          incentiveFeeFromInterest: accelResult.incentiveFeePaid,
          incentiveFeeFromPrincipal: 0,
          // OC cure + reinvestment OC diversion both emit zero under
          // acceleration — PPM-correct, not deferred. Cure mechanics only
          // apply during normal operations; under acceleration the waterfall
          // is unconditionally sequential P+I by seniority, no diversion.
          ocCureDiversions: [],
          reinvOcDiversion: 0,
          // Equity collapsed into a single bucket (residualToSub). The
          // normal-mode interest/principal equity split doesn't apply
          // because under acceleration all cash is pooled before distribution.
          equityFromInterest: equityDistributionAccel,
          equityFromPrincipal: 0,
          // Acceleration pools interest+principal into a single sequential
          // P+I distribution by seniority — there's no separate "amort
          // from interest" lane to expose. Step G's normal-mode pari-passu
          // mechanic doesn't apply post-breach. Emit 0 to satisfy the type.
          classXAmortFromInterest: 0,
          // Deferred-accrual map empty under acceleration — deferred interest
          // does NOT PIK post-breach (PPM 10(b)); unpaid interest becomes a
          // shortfall captured in accelResult.perPeriodInterestShortfall instead.
          deferredAccrualByTranche: {},
          // Acceleration skips the normal-mode reinvestment decision entirely
          // (sequential P+I paydown by seniority); no C1 enforcement applies.
          reinvestmentBlockedCompliance: 0,
        },
        qualityMetrics: computeQualityMetrics(q),
      });

      // Record tranche payoff quarter(s) for any tranche that reached zero.
      for (const d of accelResult.trancheDistributions) {
        if (d.endBalance <= 0.01 && tranchePayoffQuarter[d.className] == null) {
          tranchePayoffQuarter[d.className] = q;
        }
      }

      // Same early-break guard as the normal-mode path: if all debt is
      // retired and pool is depleted, stop the loop to avoid emitting
      // zero-padded periods for the remainder of maturityQuarters.
      if (endingLiabilitiesAccel <= 0.01 && endingPar <= 0.01) break;
      continue; // Skip normal waterfall for this period.
    }

    if (isMaturity) {
      if (hasLoans) {
        for (const loan of loanStates) {
          loan.survivingPar = 0;
        }
      }
      currentPar = 0;
      endingPar = 0;
    }

    // Track principal paid per tranche across preliminary + diversion passes
    const principalPaid: Record<string, number> = {};
    for (const t of sortedTranches) {
      principalPaid[t.className] = 0;
    }

    // First pass: pay down from principal proceeds only.
    // Deferred interest on a tranche is paid before its principal.
    // Amortising tranches (Class X) are SKIPPED during normal periods — they pay
    // down from interest proceeds. At maturity/call, all tranches are paid.
    //
    // Pari-passu absorption: tranches at the same `seniorityRank` (A-1+A-2,
    // B-1+B-2) split available principal pro-rata by deferred-then-principal
    // balance instead of B-1 paying down to zero before B-2 sees a cent.
    let remainingPrelim = prelimPrincipal;
    const principalRanksInOrder: number[] = [];
    const principalGroupByRank = new Map<number, typeof sortedTranches>();
    for (const t of sortedTranches) {
      if (t.isIncomeNote || (t.isAmortising && !isMaturity)) continue;
      if (!principalGroupByRank.has(t.seniorityRank)) {
        principalRanksInOrder.push(t.seniorityRank);
        principalGroupByRank.set(t.seniorityRank, []);
      }
      principalGroupByRank.get(t.seniorityRank)!.push(t);
    }
    for (const rank of principalRanksInOrder) {
      const group = principalGroupByRank.get(rank)!;
      // Phase 1: deferred — pro-rata across group by deferredBalance.
      const groupDeferred = group.reduce((s, t) => s + deferredBalances[t.className], 0);
      const deferredPaidGroup = Math.min(groupDeferred, remainingPrelim);
      remainingPrelim -= deferredPaidGroup;
      const deferredShare: Record<string, number> = {};
      for (const t of group) {
        const share = groupDeferred > 0 ? deferredPaidGroup * (deferredBalances[t.className] / groupDeferred) : 0;
        deferredShare[t.className] = share;
        deferredBalances[t.className] -= share;
      }
      // Phase 2: principal — pro-rata across group by trancheBalance.
      const groupPrincipal = group.reduce((s, t) => s + trancheBalances[t.className], 0);
      const principalPaidGroup = Math.min(groupPrincipal, remainingPrelim);
      remainingPrelim -= principalPaidGroup;
      for (const t of group) {
        const share = groupPrincipal > 0 ? principalPaidGroup * (trancheBalances[t.className] / groupPrincipal) : 0;
        trancheBalances[t.className] -= share;
        principalPaid[t.className] += deferredShare[t.className] + share;
      }
      if (remainingPrelim <= 0.01) break;
    }

    // ── 9. Compute OC & IC ratios ────────────────────────────────
    // OC uses post-paydown balances (liability position after payments).
    // IC uses BOP balances (interest due accrued on beginning balance).
    //
    // Adjusted Collateral Principal Amount = ending par + principal account cash
    // + recovery value of defaulted-but-pending securities - CCC excess haircut
    // Principal account cash: uninvested principal sitting in accounts (remainingPrelim)
    // At maturity, all pending recoveries are already accelerated into `recoveries` (and thus
    // into prelimPrincipal/remainingPrelim), so don't count them again in the OC numerator.
    const pendingRecoveryValue = isMaturity ? 0 : recoveryPipeline
      .filter((r) => r.quarter > q)
      .reduce((s, r) => s + r.amount, 0);
    // OC numerator adjustment for pre-existing defaults: the trustee credits defaulted assets
    // at the lesser-of-agency recovery rate, which can be ABOVE or BELOW market price.
    // When agency > market: positive adjustment (trustee gives more OC credit than cash value).
    // When agency < market: negative adjustment (trustee caps OC credit below cash value).
    // Disappears when recovery arrives (adjusted for report staleness).
    const preExistingCashRecovery = preExistingDefaultRecovery + unpricedDefaultedPar * (recoveryPct / 100);
    const adjustedArrivalQ = Math.max(1, 1 + recoveryLagQ - quartersSinceReport);
    const preExistingRecoveryStillPending = preExistingDefaultedPar > 0 && !isMaturity && q < adjustedArrivalQ;
    // When agency data exists: adjust OC from cash value to agency value (can be negative).
    // When no agency data (preExistingDefaultOcValue = 0): no adjustment, use cash as-is.
    const ocDefaultAdjustment = (preExistingDefaultOcValue > 0 && preExistingRecoveryStillPending)
      ? preExistingDefaultOcValue - preExistingCashRecovery
      : 0;
    const currentDdtlUnfundedPar = hasLoans
      ? loanStates.filter(l => l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0)
      : 0;
    let ocNumerator = endingPar + remainingPrelim + pendingRecoveryValue + ocDefaultAdjustment
      - discountObligationHaircut - longDatedObligationHaircut - impliedOcAdjustment - currentDdtlUnfundedPar;
    if (hasLoans && cccBucketLimitPct > 0) {
      const cccPar = loanStates
        .filter((l) => !l.isDelayedDraw && l.ratingBucket === "CCC" && l.survivingPar > 0)
        .reduce((s, l) => s + l.survivingPar, 0);
      const cccLimitAbs = endingPar * (cccBucketLimitPct / 100);
      const cccExcess = Math.max(0, cccPar - cccLimitAbs);
      if (cccExcess > 0) {
        // Haircut: replace par with market value for the excess amount
        const haircut = cccExcess * (1 - cccMarketValuePct / 100);
        ocNumerator -= haircut;
      }
    }

    const ocResults: PeriodResult["ocTests"] = [];
    const icResults: PeriodResult["icTests"] = [];

    // Amortising tranches (Class X) are excluded from OC/IC denominators per PPM definitions.
    // Par Value Ratio denominators only reference the rated notes (A through F), not Class X.
    const ocEligibleTranches = debtTranches.filter((t) => !t.isAmortising);

    for (const oc of ocTriggersByClass) {
      const debtAtAndAbove = ocEligibleTranches
        .filter((t) => t.seniorityRank <= oc.rank)
        .reduce((s, t) => s + trancheBalances[t.className] + deferredBalances[t.className], 0);
      const actual = debtAtAndAbove > 0 ? (ocNumerator / debtAtAndAbove) * 100 : 999;
      const passing = actual >= oc.triggerLevel;
      ocResults.push({ className: oc.className, actual, trigger: oc.triggerLevel, passing });
    }

    // B1 Tier 2 — in-loop EoD check. Compositional numerator uses per-position
    // defaultedParPending (drained as recoveries arrive) × currentPrice; plus
    // non-defaulted surviving par; plus current principal cash. Denominator is
    // Class A balance (post-period-mutations, since this runs after paydowns).
    let eodPeriodResult: EventOfDefaultTestResult | null = null;
    if (eventOfDefaultTest && hasLoans) {
      const eodInput: Array<{
        survivingPar: number;
        isDefaulted: boolean;
        currentPrice?: number | null;
        isDelayedDraw?: boolean;
      }> = [];
      for (const l of loanStates) {
        if (l.isDelayedDraw) continue;
        if (l.survivingPar > 0) {
          eodInput.push({ survivingPar: l.survivingPar, isDefaulted: false, isDelayedDraw: false });
        }
        if (l.defaultedParPending > 0) {
          eodInput.push({
            survivingPar: l.defaultedParPending,
            isDefaulted: true,
            currentPrice: l.currentPrice,
            isDelayedDraw: false,
          });
        }
      }
      const classAPao = computeSeniorTranchePao(tranches, trancheBalances);
      // Principal Account cash at measurement date = `remainingPrelim` —
      // principal proceeds still parked on the account after the first
      // paydown pass, before any further distribution. Same quantity the
      // class OC numerator uses (see ocNumerator computation above). Under
      // stress (defaults spiking, reinvestment opportunities shrinking,
      // post-RP with throttled reinvestment) this is strictly positive and
      // flows into component (3) of the compositional numerator. Previously
      // this was hardcoded to 0, under-counting the numerator and making
      // forward-loop EoD detection insensitive in exactly the distressed
      // scenarios where the test needs to be sensitive.
      eodPeriodResult = computeEventOfDefaultTest(
        eodInput,
        remainingPrelim,
        classAPao,
        eventOfDefaultTest.triggerLevel,
      );
    }

    for (const ic of icTriggersByClass) {
      const interestDueAtAndAbove = ocEligibleTranches
        .filter((t) => t.seniorityRank <= ic.rank)
        .reduce((s, t) => s + bopTrancheBalances[t.className] * trancheCouponRate(t, baseRatePct, baseRateFloorPct) * trancheDayFrac(t), 0);
      const actual = interestDueAtAndAbove > 0 ? (interestAfterFees / interestDueAtAndAbove) * 100 : 999;
      const passing = actual >= ic.triggerLevel;
      icResults.push({ className: ic.className, actual, trigger: ic.triggerLevel, passing });
    }

    const failingOcRanks = new Set(
      ocTriggersByClass
        .filter((oc) => ocResults.some((r) => r.className === oc.className && !r.passing))
        .map((oc) => oc.rank)
    );
    const failingIcRanks = new Set(
      icTriggersByClass
        .filter((ic) => icResults.some((r) => r.className === ic.className && !r.passing))
        .map((ic) => ic.rank)
    );

    // ── 10. Interest waterfall (OC/IC-gated) ─────────────────────
    // Interest DUE uses BOP balances (accrued before paydown).
    // Class X interest is paid sequentially (earlier in the loop). Class X amortisation
    // and Class A interest are paid pro rata per PPM Step G if there is a shortfall.
    let availableInterest = interestCollected;
    const trancheInterest: PeriodResult["trancheInterest"] = [];

    // PPM Steps (A)(i) → (F): senior expenses deducted in strict PPM order
    // (taxes → issuer profit → trustee capped → admin capped → senior mgmt
    // → hedge). Single helper drives this AND the IC numerator above from
    // the same `seniorExpenseBreakdown` object — see KI-21 Scope 2. The
    // `paid` return is consumed by stepTrace emission below (post-truncation
    // values per partner-visible "actually paid" semantic); the IC numerator
    // above keeps the requested-deducted reading on purpose — see comment
    // at the IC numerator construction.
    const seniorExpensesApplied = applySeniorExpensesToAvailable(
      seniorExpenseBreakdown,
      availableInterest,
    );
    availableInterest = seniorExpensesApplied.remainingAvailable;
    const seniorExpensesPaid = seniorExpensesApplied.paid;

    // Capture residual at this point for stepTrace.availableForTranches —
    // the amount entering the tranche-interest pari-passu loop (PPM step G
    // onward), before any tranche or OC-cure mutations. UI consumes this
    // directly. See CLAUDE.md § Engine ↔ UI separation: the original
    // PeriodTrace incident recomputed this from period × inputs and dropped
    // clauses (A.i), (A.ii), (C).
    const availableForTranches = availableInterest;

    // Step G (PPM): Class X amort + Class A interest are paid pro rata / pari passu.
    // Class X amort starts on the second payment date (q >= 2) per PPM definition.
    // Compute Class X amort demand alongside the most senior non-amortising tranche
    // interest so they share proportionally in a shortfall scenario.
    const amortDemand: Record<string, number> = {};
    for (const t of debtTranches) {
      if (!t.isAmortising || trancheBalances[t.className] <= 0.01) continue;
      // Amort only active after the start date (e.g. second payment date per PPM)
      if (t.amortStartDate && new Date(periodDate) < new Date(t.amortStartDate)) continue;
      const scheduleAmt = resolvedAmortPerPeriod[t.className] ?? trancheBalances[t.className];
      amortDemand[t.className] = Math.min(scheduleAmt, trancheBalances[t.className]);
    }

    // Find the most senior non-amortising tranche rank (typically Class A)
    const seniorNonAmortRank = debtTranches.find((t) => !t.isAmortising)?.seniorityRank;

    // Group debtTranches by seniorityRank so pari-passu classes (A-1+A-2,
    // B-1+B-2) absorb interest pro-rata under shortfall instead of B-1
    // taking the full available before B-2 sees a cent. The post-acceleration
    // executor (`runPostAccelerationWaterfall`) has the same shape; this is
    // the pre-accel mirror. Pro-rata splits use `gInterestDue / totalGroupDue`
    // (the engine's existing rule for the post-accel path) so two pari-passu
    // tranches with different spreads share by interest demand rather than
    // by balance — matches PPM "pari passu and pro rata" semantics.
    const ranksInOrder: number[] = [];
    const groupByRank = new Map<number, typeof debtTranches>();
    for (const t of debtTranches) {
      if (!groupByRank.has(t.seniorityRank)) {
        ranksInOrder.push(t.seniorityRank);
        groupByRank.set(t.seniorityRank, []);
      }
      groupByRank.get(t.seniorityRank)!.push(t);
    }

    let diverted = false;
    for (const rank of ranksInOrder) {
      const group = groupByRank.get(rank)!;
      const dueByMember: Record<string, number> = {};
      let totalGroupDue = 0;
      for (const t of group) {
        const rate = trancheCouponRate(t, baseRatePct, baseRateFloorPct);
        const d = bopTrancheBalances[t.className] * rate * trancheDayFrac(t);
        dueByMember[t.className] = d;
        totalGroupDue += d;
      }

      // Helper: at every payment-allocation site below, accrue the per-member
      // shortfall to either deferredBalances (deferrable, PIK semantic) or
      // interestShortfall (non-deferrable, EoD-trigger semantic). PPM-correct
      // non-deferrable mechanic: missed interest is NOT paid back in pre-
      // acceleration; it's tracked here for visibility, fed into the EoD
      // detector (consecutive-shortfall-count > grace → EoD), and folded
      // into post-acceleration interestDueByTranche when the breach declares.
      const accrueShortfall = (
        t: ProjectionInputs["tranches"][number],
        due: number,
        paid: number,
      ) => {
        if (paid >= due - 0.01) return;
        if (bopTrancheBalances[t.className] <= 0.01) return;
        const shortfall = due - paid;
        if (t.isDeferrable) {
          if (deferredInterestCompounds) {
            trancheBalances[t.className] += shortfall;
          } else {
            deferredBalances[t.className] += shortfall;
          }
          _stepTrace_deferredAccrualByTranche[t.className] =
            (_stepTrace_deferredAccrualByTranche[t.className] ?? 0) + shortfall;
        } else if (!t.isAmortising && !t.isIncomeNote) {
          // Non-deferrable debt tranche: shortfall accrues for diagnostic
          // visibility and post-acceleration claim integrity. Carry-forward
          // into next period's pre-accel demand is INTENTIONALLY NOT
          // performed — that would model a soft-deferrable behavior which
          // is the antithesis of "non-deferrable". The shortfall is
          // collected (a) by the EoD trigger when consecutive-shortfall-
          // count on a RANK-PROTECTED tranche (top-two non-amort debt
          // ranks per `eodProtectedClassNames`) exceeds the PPM grace
          // period — non-protected non-deferrable juniors track shortfall
          // here but don't drive the EoD trigger; and (b) by the post-
          // acceleration handoff which folds the running interestShortfall
          // balance for ALL non-deferrable debt tranches into
          // interestDueByTranche.
          interestShortfall[t.className] = (interestShortfall[t.className] ?? 0) + shortfall;
        }
      };

      if (diverted) {
        for (const t of group) {
          const due = dueByMember[t.className];
          trancheInterest.push({ className: t.className, due, paid: 0 });
          accrueShortfall(t, due, 0);
        }
        continue;
      }

      // Step G (PPM): at the senior-non-amort rank, fold Class X amort demand
      // into the pari-passu basket alongside the group's interest. Under
      // shortfall, the X-amort + group-interest basket splits pro-rata across
      // ALL components. The original sequential loop ran this fold once per
      // tranche at the senior-non-amort rank, which double-paid X amort on a
      // pari-passu A-1+A-2 split — the rank-grouped form handles X amort
      // exactly once per period regardless of A-rank cardinality.
      if (seniorNonAmortRank != null && rank === seniorNonAmortRank) {
        const totalAmortDue = Object.values(amortDemand).reduce((s, v) => s + v, 0);
        const totalStepGDue = totalAmortDue + totalGroupDue;
        if (totalStepGDue > 0 && totalStepGDue > availableInterest) {
          const ratio = availableInterest / totalStepGDue;
          for (const [cls, amt] of Object.entries(amortDemand)) {
            const amortPay = amt * ratio;
            trancheBalances[cls] -= amortPay;
            principalPaid[cls] += amortPay;
            _stepTrace_classXAmortFromInterest += amortPay;
            _amortFromInterestByTranche[cls] = (_amortFromInterestByTranche[cls] ?? 0) + amortPay;
          }
          for (const t of group) {
            const due = dueByMember[t.className];
            const paid = due * ratio;
            trancheInterest.push({ className: t.className, due, paid });
            accrueShortfall(t, due, paid);
          }
          availableInterest = 0;
          // Step G fully consumed available; subsequent groups produce
          // zero paid via the same Math.min(totalGroupDue, 0) = 0 path,
          // with PIK / shortfall on shortfall handled per-member.
        } else {
          // Enough to pay X amort in full; group interest pays normally below.
          for (const [cls, amt] of Object.entries(amortDemand)) {
            trancheBalances[cls] -= amt;
            availableInterest -= amt;
            principalPaid[cls] += amt;
            _stepTrace_classXAmortFromInterest += amt;
            _amortFromInterestByTranche[cls] = (_amortFromInterestByTranche[cls] ?? 0) + amt;
          }
          // Pay group interest pro-rata (or in full if available exceeds totalGroupDue)
          const groupPaid = Math.min(totalGroupDue, availableInterest);
          availableInterest -= groupPaid;
          for (const t of group) {
            const due = dueByMember[t.className];
            const memberPaid = totalGroupDue > 0 ? groupPaid * (due / totalGroupDue) : 0;
            trancheInterest.push({ className: t.className, due, paid: memberPaid });
            accrueShortfall(t, due, memberPaid);
          }
        }
      } else {
        // Non-Step-G group: pay group interest pro-rata across members.
        const groupPaid = Math.min(totalGroupDue, availableInterest);
        availableInterest -= groupPaid;
        for (const t of group) {
          const due = dueByMember[t.className];
          const memberPaid = totalGroupDue > 0 ? groupPaid * (due / totalGroupDue) : 0;
          trancheInterest.push({ className: t.className, due, paid: memberPaid });
          accrueShortfall(t, due, memberPaid);
        }
      }

      // Diversion check at end of rank group — all members at this rank are
      // paid before any cure fires. Replaces the per-iteration
      // `atRankBoundary` check from the sequential form.
      if (failingOcRanks.has(rank) || failingIcRanks.has(rank)) {
        const failingOc = ocTriggersByClass.find(
          (oc) => oc.rank === rank && ocResults.some((r) => r.className === oc.className && !r.passing)
        );
        const failingIc = icTriggersByClass.find(
          (ic) => ic.rank === rank && icResults.some((r) => r.className === ic.className && !r.passing)
        );

        let cureAmount = 0;

        if (failingOc) {
          const debtAtAndAbove = ocEligibleTranches
            .filter((tr) => tr.seniorityRank <= failingOc.rank)
            .reduce((s, tr) => s + trancheBalances[tr.className] + deferredBalances[tr.className], 0);
          const trigger = failingOc.triggerLevel / 100;
          if (inRP && !failingIc) {
            cureAmount = Math.max(0, trigger * debtAtAndAbove - ocNumerator);
          } else {
            cureAmount = Math.max(0, debtAtAndAbove - ocNumerator / trigger);
          }
        }

        if (failingIc) {
          const icTriggerRatio = failingIc.triggerLevel / 100;
          const interestDueAtAndAbove = ocEligibleTranches
            .filter((tr) => tr.seniorityRank <= failingIc.rank)
            .reduce((s, tr) => s + bopTrancheBalances[tr.className] * trancheCouponRate(tr, baseRatePct, baseRateFloorPct) * trancheDayFrac(tr), 0);
          const neededInterestDue = interestAfterFees / icTriggerRatio;
          const reductionNeeded = Math.max(0, interestDueAtAndAbove - neededInterestDue);

          if (reductionNeeded > 0) {
            let reductionRemaining = reductionNeeded;
            let icCureAmount = 0;
            for (const tr of ocEligibleTranches.filter((tr) => tr.seniorityRank <= failingIc.rank)) {
              if (reductionRemaining <= 0) break;
              const couponPerPar = trancheCouponRate(tr, baseRatePct, baseRateFloorPct) * trancheDayFrac(tr);
              if (couponPerPar <= 0) continue;
              const trancheAvailable = trancheBalances[tr.className] + deferredBalances[tr.className];
              const paydownForThisTranche = Math.min(reductionRemaining / couponPerPar, trancheAvailable);
              icCureAmount += paydownForThisTranche;
              reductionRemaining -= paydownForThisTranche * couponPerPar;
            }
            cureAmount = Math.max(cureAmount, icCureAmount);
          }
        }

        const diversion = Math.min(cureAmount, availableInterest);
        availableInterest -= diversion;
        if (availableInterest <= 0.01) diverted = true;

        if (diversion > 0) {
          const _mode: "reinvest" | "paydown" = inRP && !failingIc ? "reinvest" : "paydown";
          _stepTrace_ocCureDiversions.push({ rank, mode: _mode, amount: diversion });
          if (inRP && !failingIc) {
            currentPar += diversion;
            ocNumerator += diversion;
            if (hasLoans) {
              loanStates.push({
                survivingPar: diversion,
                ratingBucket: reinvestmentRating,
                spreadBps: reinvestmentSpreadBps,
                warfFactor: reinvestmentWarfFactor,
                maturityQuarter: q + reinvestmentTenorQuarters,
                isFixedRate: false,
                isDelayedDraw: false,
                defaultedParPending: 0,
                defaultEvents: [],
              });
            }
          } else {
            // Cure paydown application — rank-grouped pari-passu so a B-1+B-2
            // pair at the failing rank shares the diversion pro-rata by
            // balance instead of B-1 paying to zero before B-2 is touched.
            // Same template as the principal first-pass refactor; deferred
            // is paid first then principal, both pro-rata within each group.
            //
            // Excludes amortising tranches (Class X): the cure amount is
            // computed against `ocEligibleTranches` (which omits amortising)
            // because Class X is not in the OC denominator. Applying the
            // diversion to Class X would consume cash without reducing the
            // denominator the cure aims to satisfy, leaving the OC test
            // un-cured. Income notes excluded for the same reason (residual
            // claim, not part of the senior-debt stack the cure targets).
            let remaining = diversion;
            const cureRanksInOrder: number[] = [];
            const cureGroupByRank = new Map<number, typeof sortedTranches>();
            for (const dt of sortedTranches) {
              if (dt.isIncomeNote || dt.isAmortising) continue;
              if (!cureGroupByRank.has(dt.seniorityRank)) {
                cureRanksInOrder.push(dt.seniorityRank);
                cureGroupByRank.set(dt.seniorityRank, []);
              }
              cureGroupByRank.get(dt.seniorityRank)!.push(dt);
            }
            for (const cr of cureRanksInOrder) {
              if (remaining <= 0) break;
              const cgroup = cureGroupByRank.get(cr)!;
              const groupDeferred = cgroup.reduce((s, t) => s + deferredBalances[t.className], 0);
              const deferredPaidGroup = Math.min(groupDeferred, remaining);
              remaining -= deferredPaidGroup;
              for (const t of cgroup) {
                const share = groupDeferred > 0 ? deferredPaidGroup * (deferredBalances[t.className] / groupDeferred) : 0;
                deferredBalances[t.className] -= share;
                principalPaid[t.className] += share;
              }
              const groupPrincipal = cgroup.reduce((s, t) => s + trancheBalances[t.className], 0);
              const principalPaidGroup = Math.min(groupPrincipal, remaining);
              remaining -= principalPaidGroup;
              for (const t of cgroup) {
                const share = groupPrincipal > 0 ? principalPaidGroup * (trancheBalances[t.className] / groupPrincipal) : 0;
                trancheBalances[t.className] -= share;
                principalPaid[t.className] += share;
              }
            }
          }
        }
      }
    }

    // PPM Step V: Reinvestment OC Test — divert a percentage of remaining interest during RP to buy collateral.
    // Evaluated after standard OC cures which may have bought collateral (updating ocNumerator).
    if (inRP && reinvestmentOcTrigger && availableInterest > 0) {
      const reinvOcDebt = ocEligibleTranches
        .filter((tr) => tr.seniorityRank <= reinvestmentOcTrigger.rank)
        .reduce((s, tr) => s + trancheBalances[tr.className] + deferredBalances[tr.className], 0);
      const diversion = computeReinvOcDiversion(
        availableInterest,
        ocNumerator,
        reinvOcDebt,
        reinvestmentOcTrigger.triggerLevel,
        reinvestmentOcTrigger.diversionPct,
      );
      if (diversion > 0) {
        _stepTrace_reinvOcDiversion = diversion;
        availableInterest -= diversion;
        currentPar += diversion;
        if (hasLoans) {
          loanStates.push({
            survivingPar: diversion,
            ratingBucket: reinvestmentRating,
            spreadBps: reinvestmentSpreadBps,
            warfFactor: reinvestmentWarfFactor,
            maturityQuarter: q + reinvestmentTenorQuarters,
            isFixedRate: false,
            isDelayedDraw: false,
            defaultedParPending: 0,
            defaultEvents: [],
          });
        }
      }
    }

    // Refresh endingPar after any RP OC diversion may have purchased collateral
    if (hasLoans) endingPar = loanStates.filter(l => !l.isDelayedDraw).reduce((s, l) => s + l.survivingPar, 0);
    else endingPar = currentPar;

    // PPM Step X: Subordinated management fee — paid after all debt tranches.
    // Capture the truncated paid amount so stepTrace emits "actually paid";
    // the requested `subFeeAmount` overstates payment under stress when
    // `availableInterest` is exhausted before reaching this step.
    const subFeeAmount = beginningPar * (subFeePct / 100) * dayFracActual;
    const subFeePaid = Math.min(subFeeAmount, availableInterest);
    availableInterest -= subFeePaid;

    // C3 — PPM Steps (Y) trustee-overflow + (Z) admin-overflow.
    // Senior Expenses Cap deferred any trustee+admin above the cap to
    // here; pay what residual interest can absorb, proportionally across
    // the two overflow buckets. Any residual-to-sub absorbs the rest as a
    // shortfall (trustee/admin parties receive partial payment; remainder
    // accrues to subsequent periods under PPM, but our simplified model
    // treats the un-absorbed overflow as paid from sub distribution).
    let trusteeOverflowPaid = 0;
    let adminOverflowPaid = 0;
    if (cappedOverflowTotal > 0 && availableInterest > 0) {
      const overflowPayable = Math.min(cappedOverflowTotal, availableInterest);
      const overflowRatio = cappedOverflowTotal > 0 ? overflowPayable / cappedOverflowTotal : 0;
      trusteeOverflowPaid = trusteeOverflowRequested * overflowRatio;
      adminOverflowPaid = adminOverflowRequested * overflowRatio;
      availableInterest -= overflowPayable;
    }

    // PPM Step BB: Incentive management fee — % of residual when equity IRR > hurdle.
    // Incentive fee is circular: the fee reduces equity distributions, which reduces
    // the IRR, which determines whether the fee should be charged. resolveIncentiveFee
    // handles this by checking three regimes — see function docstring.
    let incentiveFeeFromInterest = 0;
    if (incentiveFeePct > 0 && incentiveFeeHurdleIrr > 0 && availableInterest > 0) {
      incentiveFeeFromInterest = resolveIncentiveFee(
        equityCashFlows, availableInterest, incentiveFeePct, incentiveFeeHurdleIrr, 4
      );
      availableInterest -= incentiveFeeFromInterest;
    }

    const equityFromInterest = availableInterest;

    // ── 11. Build principal results ──────────────────────────────
    let availablePrincipal = remainingPrelim;

    const tranchePrincipal: PeriodResult["tranchePrincipal"] = [];
    for (const t of sortedTranches) {
      if (t.isIncomeNote) {
        tranchePrincipal.push({ className: t.className, paid: 0, paidFromInterest: 0, endBalance: trancheBalances[t.className] });
        continue;
      }
      tranchePrincipal.push({
        className: t.className,
        paid: principalPaid[t.className],
        paidFromInterest: _amortFromInterestByTranche[t.className] ?? 0,
        endBalance: trancheBalances[t.className] + deferredBalances[t.className],
      });

      if (trancheBalances[t.className] + deferredBalances[t.className] <= 0.01 && tranchePayoffQuarter[t.className] === null) {
        tranchePayoffQuarter[t.className] = q;
      }
    }

    const endingLiabilities = debtTranches.reduce((s, t) => s + trancheBalances[t.className] + deferredBalances[t.className], 0);

    // PPM Step U: Incentive fee from principal proceeds (same IRR-gated circularity).
    // Compute total fee on combined interest+principal, then subtract what was already
    // taken from interest to get the incremental principal fee.
    let incentiveFeeFromPrincipal = 0;
    if (incentiveFeePct > 0 && incentiveFeeHurdleIrr > 0 && availablePrincipal > 0) {
      const preFeeInterestForEquity = equityFromInterest + incentiveFeeFromInterest;
      const totalAvailable = preFeeInterestForEquity + availablePrincipal;
      const totalFee = resolveIncentiveFee(
        equityCashFlows, totalAvailable, incentiveFeePct, incentiveFeeHurdleIrr, 4
      );
      incentiveFeeFromPrincipal = Math.max(0, totalFee - incentiveFeeFromInterest);
      availablePrincipal -= incentiveFeeFromPrincipal;
    }

    // Capture equity-from-principal residual BEFORE it's summed into equityDistribution,
    // so the stepTrace separates PPM step (DD) (interest residual) from principal residual.
    const equityFromPrincipal = availablePrincipal;
    const equityDistribution = equityFromInterest + equityFromPrincipal;
    totalEquityDistributions += equityDistribution;
    equityCashFlows.push(equityDistribution);

    // §4.3 balance instrumentation (normal-waterfall branch).
    const endingDefaultedParNormal = hasLoans
      ? loanStates.reduce((s, l) => s + l.defaultedParPending, 0)
      : 0;

    // PPM § 10(a)(i) EoD-on-shortfall trigger — Phase 1 (pre-emit):
    // update `shortfallCount` based on this period's accrual and compute
    // the `eodOnShortfall` flag. Done BEFORE the emit so the emitted
    // `interestShortfallCount` reflects the end-of-period post-update
    // count (consistent with `interestShortfall`, which is also end-of-
    // period). The `isAccelerated` flip is deliberately deferred to
    // Phase 2 (after emit) — the emit must reflect the regime period N
    // actually ran under (pre-accel here), not the regime period N+1
    // will run under. A period emitting `isAccelerated=true` would imply
    // the post-acceleration waterfall executed for it, which only
    // happens in the post-accel branch above.
    let eodOnShortfall = false;
    for (const cls of eodProtectedClassNames) {
      const delta = (interestShortfall[cls] ?? 0) - (bopInterestShortfall[cls] ?? 0);
      if (delta > 0.01) {
        shortfallCount[cls] = (shortfallCount[cls] ?? 0) + 1;
        if (shortfallCount[cls] > eodGrace) eodOnShortfall = true;
      } else {
        shortfallCount[cls] = 0;
      }
    }

    periods.push({
      periodNum: q,
      date: periodDate,
      beginningPar,
      beginningPerformingPar: beginningPar,
      endingPerformingPar: endingPar,
      beginningDefaultedPar,
      endingDefaultedPar: endingDefaultedParNormal,
      beginningPrincipalAccount: 0,
      endingPrincipalAccount: 0,
      beginningInterestAccount: 0,
      endingInterestAccount: 0,
      defaults,
      prepayments,
      scheduledMaturities,
      recoveries,
      principalProceeds: prepayments + scheduledMaturities + recoveries,
      reinvestment,
      endingPar,
      beginningLiabilities,
      endingLiabilities,
      interestCollected,
      trancheInterest,
      tranchePrincipal,
      // Snapshot end-of-period interestShortfall (cumulative carry) so the
      // period's running balance is partner-visible. Skip zero entries to
      // keep the field clean in healthy runs.
      interestShortfall: Object.fromEntries(
        Object.entries(interestShortfall).filter(([, v]) => v > 0.01),
      ),
      // Empty in pre-accel periods — the per-period shortfall semantic only
      // applies under acceleration. Pre-accel uses cumulative carry above.
      perPeriodInterestShortfall: {},
      // Snapshot end-of-period shortfallCount — partner-facing countdown to
      // EoD without re-deriving the state machine. Captured AFTER the
      // trigger block (above the emit) so the value reflects this period's
      // post-update count: count==grace+1 on the period that fires EoD,
      // count==0 on a fully-paid period.
      interestShortfallCount: Object.fromEntries(
        Object.entries(shortfallCount).filter(([, v]) => v > 0),
      ),
      ocTests: ocResults,
      icTests: icResults,
      eodTest: eodPeriodResult,
      isAccelerated, // false at this emit site — normal path
      loanDefaultEvents: loanDefaultEventsThisPeriod,
      equityDistribution,
      defaultsByRating,
      stepTrace: {
        // Post-truncation paid amounts (consumed from `seniorExpensesPaid`
        // and `subFeePaid` above). Per the actually-paid invariant: every
        // fee/expense field on PeriodStepTrace must be sourced from the
        // truncated paid value, never the pre-truncation requested object,
        // or `Σ stepTrace.*(interest waterfall) ≤ interestCollected` breaks
        // and partner-visible aggregators overstate fees. trusteeOverflow /
        // adminOverflow already use truncated locals from the Y/Z block.
        taxes: seniorExpensesPaid.taxes,
        issuerProfit: seniorExpensesPaid.issuerProfit, // PPM A.ii
        // Each field maps to exactly one PPM step so the N1 harness ties
        // engine-emission to trustee-reported on a per-step basis. Pre-C3
        // `trusteeFeesPaid` bundled (B)+(C)+(Y)+(Z); the split lets us
        // distinguish trustee vs admin drift (and in/out of cap) under
        // both normal and accelerated paths.
        trusteeFeesPaid: seniorExpensesPaid.trusteeCapped, // PPM (B)
        adminFeesPaid: seniorExpensesPaid.adminCapped,     // PPM (C)
        trusteeOverflowPaid,                               // PPM (Y)
        adminOverflowPaid,                                 // PPM (Z)
        seniorMgmtFeePaid: seniorExpensesPaid.seniorMgmt,
        hedgePaymentPaid: seniorExpensesPaid.hedge,
        availableForTranches,
        subMgmtFeePaid: subFeePaid,
        incentiveFeeFromInterest,
        incentiveFeeFromPrincipal,
        ocCureDiversions: _stepTrace_ocCureDiversions,
        reinvOcDiversion: _stepTrace_reinvOcDiversion,
        equityFromInterest,
        equityFromPrincipal,
        classXAmortFromInterest: _stepTrace_classXAmortFromInterest,
        deferredAccrualByTranche: _stepTrace_deferredAccrualByTranche,
        reinvestmentBlockedCompliance,
      },
      qualityMetrics: computeQualityMetrics(q),
    });

    // Prune exhausted loans to keep iteration cost O(active loans) per period.
    // Critical for Monte Carlo performance where thousands of runs accumulate dead entries.
    if (hasLoans) {
      let write = 0;
      for (let read = 0; read < loanStates.length; read++) {
        if (loanStates[read].survivingPar > 0) loanStates[write++] = loanStates[read];
      }
      loanStates.length = write;
    }

    // Stop early if all debt paid off and collateral is depleted
    const remainingDebt = debtTranches.reduce((s, t) => s + trancheBalances[t.className] + deferredBalances[t.className], 0);
    if (remainingDebt <= 0.01 && endingPar <= 0.01) break;

    // PPM § 10(a)(i) EoD-on-shortfall trigger — Phase 2 (post-emit):
    // flip `isAccelerated` for the NEXT period if either the compositional
    // EoD test (`eodPeriodResult`) or the interest-non-payment grace-period
    // gate (`eodOnShortfall`, set in Phase 1 above) tripped this period.
    // Irreversible once set. Phase 1's `eodOnShortfall` flag is in scope
    // here because both phases run under the same pre-accel branch — the
    // post-accel branch `continue`s above and never reaches either phase.
    if ((eodPeriodResult && !eodPeriodResult.passing) || eodOnShortfall) {
      isAccelerated = true;
    }
  }

  // Explicit insolvency guard: if t=0 balance sheet is underwater, IRR is
  // undefined regardless of subsequent cashflow series. The implicit chain
  // (bookValue=0 → equityInvestment=0 → cf[0]=-0 → calculateIrr early-return
  // on all-non-negative) holds today but depends on JS treating -0 >= 0 as
  // true and on every downstream equity flow remaining non-negative. Make
  // the contract explicit instead of inferring it.
  const equityIrr = initialState.equityWipedOut
    ? null
    : calculateIrr(equityCashFlows, 4);

  return { periods, equityIrr, totalEquityDistributions, tranchePayoffQuarter, initialState };
}

/**
 * Solve the incentive fee circularity: find the fee F such that
 * the post-fee equity IRR is consistent with the fee being charged.
 *
 * Three regimes:
 *   1. Pre-fee IRR ≤ hurdle → F = 0
 *   2. Full fee AND post-fee IRR > hurdle → F = available × feePct/100
 *   3. Full fee pushes IRR below hurdle → bisect to find F where post-fee IRR ≈ hurdle
 */
function resolveIncentiveFee(
  priorCashFlows: number[],
  availableAmount: number,
  feePct: number,
  hurdleIrr: number,
  periodsPerYear: number,
): number {
  const cf = [...priorCashFlows, availableAmount];
  const lastIdx = cf.length - 1;

  // Regime 1: no fee needed
  const preFeeIrr = calculateIrr(cf, periodsPerYear);
  if (preFeeIrr === null || preFeeIrr <= hurdleIrr) return 0;

  // Regime 2: full flat fee
  const fullFee = availableAmount * (feePct / 100);
  cf[lastIdx] = availableAmount - fullFee;
  const postFullFeeIrr = calculateIrr(cf, periodsPerYear);
  if (postFullFeeIrr !== null && postFullFeeIrr >= hurdleIrr) return fullFee;

  // Regime 3: bisect — full fee pushes IRR below hurdle
  let lo = 0;
  let hi = fullFee;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    cf[lastIdx] = availableAmount - mid;
    const midIrr = calculateIrr(cf, periodsPerYear);
    if (midIrr === null || midIrr < hurdleIrr) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}

export function calculateIrr(cashFlows: number[], periodsPerYear: number = 4): number | null {
  if (cashFlows.length < 2) return null;
  if (cashFlows.every((cf) => cf >= 0) || cashFlows.every((cf) => cf <= 0)) return null;

  // Newton-Raphson on periodic rate, then annualize
  let rate = 0.05;

  let converged = false;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dNpv = 0;
    for (let i = 0; i < cashFlows.length; i++) {
      const discount = Math.pow(1 + rate, i);
      npv += cashFlows[i] / discount;
      dNpv -= (i * cashFlows[i]) / Math.pow(1 + rate, i + 1);
    }
    if (Math.abs(dNpv) < 1e-12) break;
    const newRate = rate - npv / dNpv;
    if (Math.abs(newRate - rate) < 1e-9) {
      rate = newRate;
      converged = true;
      break;
    }
    rate = newRate;
    // Guard against divergence
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  if (!converged) return null;

  // Annualize: (1 + periodic)^periodsPerYear - 1
  const annualized = Math.pow(1 + rate, periodsPerYear) - 1;
  if (!isFinite(annualized) || isNaN(annualized)) return null;
  return annualized;
}

/**
 * Date-aware IRR using Actual/365 year-fractions, anchored at the first
 * cashflow's date. Replaces the periodic `calculateIrr` for series where
 * cashflows aren't on a uniform cadence — e.g., a since-inception sub-note
 * IRR with a deal-closing anchor, payment-date distributions, and a terminal
 * value as-of the current determination date.
 *
 * Cashflows must be sorted by date; the first row is the investment outflow
 * (negative amount), the rest are inflows.
 */
export function calculateIrrFromDatedCashflows(
  flows: Array<{ date: string; amount: number }>,
): number | null {
  if (flows.length < 2) return null;
  const hasOut = flows.some((f) => f.amount < 0);
  const hasIn = flows.some((f) => f.amount > 0);
  if (!hasOut || !hasIn) return null;

  const t0 = Date.parse(flows[0].date);
  if (!Number.isFinite(t0)) return null;
  const years: number[] = flows.map((f) => {
    const t = Date.parse(f.date);
    if (!Number.isFinite(t)) return NaN;
    return (t - t0) / (1000 * 60 * 60 * 24 * 365);
  });
  if (years.some((y) => !Number.isFinite(y))) return null;

  let rate = 0.08;
  let converged = false;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dNpv = 0;
    for (let i = 0; i < flows.length; i++) {
      const y = years[i];
      const discount = Math.pow(1 + rate, y);
      npv += flows[i].amount / discount;
      dNpv -= (y * flows[i].amount) / Math.pow(1 + rate, y + 1);
    }
    if (Math.abs(dNpv) < 1e-12) break;
    const newRate = rate - npv / dNpv;
    if (Math.abs(newRate - rate) < 1e-9) {
      rate = newRate;
      converged = true;
      break;
    }
    rate = newRate;
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  if (!converged) return null;
  if (!isFinite(rate) || isNaN(rate)) return null;
  return rate;
}

export interface SensitivityRow {
  assumption: string;
  base: string;
  down: string;
  up: string;
  downIrr: number | null;
  upIrr: number | null;
}

export function computeSensitivity(
  baseInputs: ProjectionInputs,
  baseIrr: number | null,
): SensitivityRow[] {
  const scenarios: { assumption: string; base: string; down: string; up: string; makeDown: () => ProjectionInputs; makeUp: () => ProjectionInputs }[] = [
    {
      assumption: "CDR (uniform)",
      base: formatSensPct(avgCdr(baseInputs.defaultRatesByRating)),
      down: formatSensPct(Math.max(0, avgCdr(baseInputs.defaultRatesByRating) - 1)),
      up: formatSensPct(avgCdr(baseInputs.defaultRatesByRating) + 1),
      // D2b — the shifted bucket rates only take effect when the buckets are
      // in the override set (otherwise the engine uses per-position WARF).
      // Flag every bucket present in the rate map so the ±1 pct shift is
      // actually applied to the hazard path.
      makeDown: () => ({
        ...baseInputs,
        defaultRatesByRating: shiftAllRates(baseInputs.defaultRatesByRating, -1),
        overriddenBuckets: Object.keys(baseInputs.defaultRatesByRating),
      }),
      makeUp: () => ({
        ...baseInputs,
        defaultRatesByRating: shiftAllRates(baseInputs.defaultRatesByRating, 1),
        overriddenBuckets: Object.keys(baseInputs.defaultRatesByRating),
      }),
    },
    {
      assumption: "CPR",
      base: formatSensPct(baseInputs.cprPct),
      down: formatSensPct(Math.max(0, baseInputs.cprPct - 5)),
      up: formatSensPct(baseInputs.cprPct + 5),
      makeDown: () => ({ ...baseInputs, cprPct: Math.max(0, baseInputs.cprPct - 5) }),
      makeUp: () => ({ ...baseInputs, cprPct: baseInputs.cprPct + 5 }),
    },
    {
      assumption: "Base Rate",
      base: formatSensPct(baseInputs.baseRatePct),
      down: formatSensPct(Math.max(0, baseInputs.baseRatePct - 1)),
      up: formatSensPct(baseInputs.baseRatePct + 1),
      makeDown: () => ({ ...baseInputs, baseRatePct: Math.max(0, baseInputs.baseRatePct - 1) }),
      makeUp: () => ({ ...baseInputs, baseRatePct: baseInputs.baseRatePct + 1 }),
    },
    {
      assumption: "Recovery Rate",
      base: formatSensPct(baseInputs.recoveryPct),
      down: formatSensPct(Math.max(0, baseInputs.recoveryPct - 10)),
      up: formatSensPct(Math.min(100, baseInputs.recoveryPct + 10)),
      makeDown: () => ({ ...baseInputs, recoveryPct: Math.max(0, baseInputs.recoveryPct - 10) }),
      makeUp: () => ({ ...baseInputs, recoveryPct: Math.min(100, baseInputs.recoveryPct + 10) }),
    },
    {
      assumption: "Reinvestment Spread",
      base: `${baseInputs.reinvestmentSpreadBps} bps`,
      down: `${Math.max(0, baseInputs.reinvestmentSpreadBps - 50)} bps`,
      up: `${baseInputs.reinvestmentSpreadBps + 50} bps`,
      makeDown: () => ({ ...baseInputs, reinvestmentSpreadBps: Math.max(0, baseInputs.reinvestmentSpreadBps - 50) }),
      makeUp: () => ({ ...baseInputs, reinvestmentSpreadBps: baseInputs.reinvestmentSpreadBps + 50 }),
    },
  ];

  const rows: SensitivityRow[] = scenarios.map((s) => {
    if (baseIrr === null) {
      return { assumption: s.assumption, base: s.base, down: s.down, up: s.up, downIrr: null, upIrr: null };
    }
    const downResult = runProjection(s.makeDown());
    const upResult = runProjection(s.makeUp());
    return {
      assumption: s.assumption,
      base: s.base,
      down: s.down,
      up: s.up,
      downIrr: downResult.equityIrr,
      upIrr: upResult.equityIrr,
    };
  });

  rows.sort((a, b) => {
    const impactA = Math.max(Math.abs((a.downIrr ?? 0) - (baseIrr ?? 0)), Math.abs((a.upIrr ?? 0) - (baseIrr ?? 0)));
    const impactB = Math.max(Math.abs((b.downIrr ?? 0) - (baseIrr ?? 0)), Math.abs((b.upIrr ?? 0) - (baseIrr ?? 0)));
    return impactB - impactA;
  });

  return rows;
}

function formatSensPct(val: number): string {
  return `${val.toFixed(1)}%`;
}

function avgCdr(rates: Record<string, number>): number {
  const vals = Object.values(rates);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function shiftAllRates(rates: Record<string, number>, delta: number): Record<string, number> {
  const shifted: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) {
    shifted[k] = Math.max(0, v + delta);
  }
  return shifted;
}
