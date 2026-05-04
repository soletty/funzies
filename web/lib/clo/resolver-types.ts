import type { DayCountConvention } from "./day-count-canonicalize";

export interface ResolvedReinvestmentOcTrigger {
  triggerLevel: number;
  rank: number;
  diversionPct: number; // % of remaining interest diverted when test fails (e.g. 50 for 50%)
}

/** Canonical classification of compliance tests used by the engine and
 *  filter pipelines. Resolved at the resolver build sites so downstream
 *  consumers (build-projection-inputs, buy-list-filter, the resolver's own
 *  silent-skip blocking gate) match by enum instead of re-running fragile
 *  name regexes. Adding a new canonical type means: extend this union, add
 *  a branch in `classifyComplianceTest`, and consume it where the test is
 *  surfaced. The "other" bucket covers tests the engine doesn't reason
 *  about (per-class OC/IC, WAL, diversity, recovery, lettered concentration
 *  rows, etc.); they retain `testName` and remain visible to the UI. */
export type ComplianceTestType =
  | "moodys_max_warf"
  | "min_was"
  | "moodys_caa_concentration"
  | "fitch_ccc_concentration"
  | "other";

export interface ResolvedComplianceTest {
  testName: string;
  testClass: string | null;
  actualValue: number | null;
  triggerLevel: number | null;
  cushion: number | null;
  isPassing: boolean | null;
  canonicalType: ComplianceTestType;
}

export interface ResolvedMetadata {
  reportDate: string | null;
  dataSource: "sdf" | "pdf" | "mixed" | null;
  sdfFilesIngested: string[];
  pdfExtracted: string[];
}

/** E1 (Sprint 5) — PPM provenance metadata for a resolved value. Populated
 *  when the underlying PPM extraction (ppm.json) carries `source_pages`
 *  and/or `source_condition` for the originating field. Null when the
 *  extraction didn't capture provenance. Partner UI uses this to render
 *  "Source: PPM Condition 10, p.127" tooltips on hover. */
export interface Citation {
  /** PPM page numbers (1-indexed) where the value is defined. */
  sourcePages: number[] | null;
  /** PPM condition number / label (e.g., "Condition 10", "1 (Definitions)"). */
  sourceCondition: string | null;
}

/** B1: Event of Default Par Value Test (PPM Condition 10(a)(iv)).
 *  Structurally distinct from class-level OC tests — its numerator is
 *  compositional (APB non-defaulted + Σ(MV × PB) defaulted + principal
 *  account cash) and its denominator is Class A PAO only.
 *  Previously mis-emitted as a rank-99 OC trigger which drove the denominator
 *  to include all tranches and made the test impossible to breach. */
export interface ResolvedEodTest {
  triggerLevel: number; // 102.5 for Euro XV
  sourcePage: number | null;
  /** E1: PPM provenance for the EoD trigger (source_pages + source_condition
   *  from ppm.json section_4_coverage_tests.event_of_default_par_value_test). */
  citation?: Citation | null;
}

/** PPM Condition 1 "Senior Expenses Cap" structured definition. Lives on
 *  `ResolvedDealData` (not `ResolvedFees`) per codebase pattern: structural
 *  Condition-1 definitions sit alongside `ResolvedEodTest` /
 *  `ResolvedReinvestmentOcTrigger`, not under fee-rate types.
 *
 *  Ares CLO XV cap formula (verbatim, OC pp. 150-151):
 *    sum of (a) €300,000 per annum (pro-rated 30/360 ongoing PDs, Actual/360
 *    first PD); and (b) 0.025 per cent. per annum (Actual/360 all PDs) of the
 *    Collateral Principal Amount as at the Determination Date immediately
 *    preceding the Payment Date.
 *
 *  Provisos: (i) VAT counts toward cap; (ii) 3-period rolling carryforward
 *  of unused cap headroom (post-Frequency-Switch-Event: 1-period). Both are
 *  unmodeled today; tracked as separate KIs.
 *
 *  Resolver emits `severity: "error", blocking: true` when this field is null
 *  on a deal whose PPM specifies a cap (per project rule: silent fallbacks
 *  on missing computational extraction are bugs). */
export interface ResolvedSeniorExpensesCap {
  /** Cap rate component (b) in basis points per annum (Ares XV: 2.5 = 0.025% p.a.).
   *  Applied as: bpsComponent = base × (bpsPerYear / 10000) × dayFrac. */
  bpsPerYear: number;
  /** Cap absolute fixed component (a) in € per year (Ares XV: 300_000).
   *  Applied as: floorComponent = absoluteFloorEurPerYear × dayFrac. Null when
   *  PPM specifies no fixed component. */
  absoluteFloorEurPerYear: number | null;
  /** Denominator for component (b): "CPA" = Collateral Principal Amount per
   *  Condition 1; "APB" = Aggregate Principal Balance. Ares XV uses CPA. The
   *  engine currently uses `beginningPar` (APB) for both — CPA-vs-APB
   *  divergence is a separate KI. */
  capBase: "CPA" | "APB";
  /** Accrual cadence: "per_payment_date" = cap resets each PD (cap × dayFrac);
   *  "per_annum" = single annual ceiling requiring rolling state. Ares XV is
   *  per_payment_date. */
  capPeriod: "per_payment_date" | "per_annum";
  /** How the cap is allocated between step (B) trustee + step (C) admin when
   *  cappedRequested > capAmount. Ares XV: "sequential_b_first" — clause (C)
   *  reads "less any amounts paid pursuant to paragraph (B) above". */
  allocationWithinCap: "pro_rata" | "sequential_b_first" | "separate_caps";
  /** How overflow paid past cap is allocated between step (Y) trustee +
   *  step (Z) admin. Ares XV: sequential per POP convention (each step paid
   *  in full from residual before next). */
  overflowAllocation: "pro_rata" | "sequential_y_first" | "sequential_z_first";
  /** Number of preceding Payment Dates whose unused cap headroom carries
   *  forward into the current PD's cap (Ares XV: 3, or 1 post-Frequency-
   *  Switch-Event). Engine doesn't model the carryforward today; tracked
   *  as a separate KI. Null when PPM specifies no carryforward. */
  carryforwardPeriods: number | null;
  /** Whether VAT on capped expenses counts toward the cap. Ares XV: true.
   *  Engine doesn't model VAT today; tracked as a separate KI. */
  vatIncluded: boolean;
  /** E1 PPM provenance (OC pp. 150-151 for Ares XV). */
  citation?: Citation | null;
}

export interface ResolvedDealData {
  tranches: ResolvedTranche[];
  poolSummary: ResolvedPool;
  ocTriggers: ResolvedTrigger[];
  icTriggers: ResolvedTrigger[];
  qualityTests: ResolvedComplianceTest[];
  concentrationTests: ResolvedComplianceTest[];
  reinvestmentOcTrigger: ResolvedReinvestmentOcTrigger | null;
  eventOfDefaultTest: ResolvedEodTest | null;
  dates: ResolvedDates;
  fees: ResolvedFees;
  loans: ResolvedLoan[];
  metadata: ResolvedMetadata;
  principalAccountCash: number; // uninvested cash in principal accounts (counts toward OC numerator)
  /** Interest Account cash — collections awaiting distribution on the next
   *  payment date. Per PPM Condition 3(j)(ii)(1) the entire balance is
   *  transferred to the Payment Account on the BD prior to each Payment Date
   *  for disbursement under the Interest Priority of Payments; the engine
   *  routes this value into Q1 `availableInterest` ahead of step (A)(i) via
   *  `ProjectionInputs.initialInterestAccountCash`. NOT credited to the OC
   *  numerator (Adjusted Collateral Principal Amount per Condition 1(d)
   *  limits account-cash credit to Principal Account + Unused Proceeds). */
  interestAccountCash: number;
  /** Interest Smoothing Account balance — reserve used to smooth interest
   *  distributions across periods (PPM Condition 3(j)(xii)). Opening balance
   *  is mid-cycle and flushes back to the Interest Account on the BD after
   *  the next Payment Date; the engine consumes this via Q1 `availableInterest`.
   *  Multi-period FSE-coupled deposit/withdrawal dynamics are out-of-scope
   *  (KI-04). NOT credited to the OC numerator. */
  interestSmoothingBalance: number;
  /** Supplemental Reserve Account balance — discretionary reserve governed
   *  by the Collateral Manager (PPM Condition 3(j)(vi)). Eight Permitted
   *  Uses; no automatic flow on a determination date. Q1 disposition is
   *  driven by `userAssumptions.supplementalReserveDisposition` (modeling
   *  assumption, not extracted). NOT credited to the OC numerator. */
  supplementalReserveBalance: number;
  /** Expense Reserve Account balance — reserved for senior expenses (PPM
   *  Condition 3(j)(x)). Per Interest Priority of Payments steps (B) + (C)
   *  the balance augments the Senior Expenses Cap each period; the engine
   *  drains it as overflow is paid. Distinct from KI-02 step (D) deposit-
   *  into-reserve flow. NOT credited to the OC numerator. */
  expenseReserveBalance: number;
  /** PPM Senior Expenses Cap structured definition (Condition 1). Null on
   *  legacy fixtures or when PPM extraction missed; resolver emits a blocking
   *  warning in that case. Engine consumes via `defaultsFromResolved` →
   *  `ProjectionInputs.seniorExpensesCapBps` + `seniorExpensesCapAbsoluteFloorPerYear`. */
  seniorExpensesCap: ResolvedSeniorExpensesCap | null;
  preExistingDefaultedPar: number; // par of defaulted loans excluded from loan list
  preExistingDefaultRecovery: number; // market-price recovery for priced defaulted holdings
  unpricedDefaultedPar: number; // par of defaulted holdings without market price (engine applies recoveryPct)
  preExistingDefaultOcValue: number; // recovery value for OC numerator (agency rate — typically higher than market)
  discountObligationHaircut: number; // net OC deduction for loans purchased below threshold (from par value adjustments)
  longDatedObligationHaircut: number; // net OC deduction for loans maturing after CLO (from par value adjustments)
  cccBucketLimitPct: number | null; // PPM Excess CCC Adjustment threshold (% of par); null = extraction missed (blocking)
  cccMarketValuePct: number | null; // PPM market-value floor (% of par) credited to CCC excess; null = extraction missed (blocking)
  /** PPM Target Par Amount (€). Sourced from PPM
   *  `constraints.dealSizing.targetParAmount` or DB `pool.targetPar`. Intended
   *  to feed the Aggregate Excess Funded Spread (AEFS) term in the Floating
   *  WAS denominator (PPM Condition 1, PDF p. 304) — but **NOT yet wired into
   *  the engine**: `pool-metrics.ts` / `projection.ts` do not consume this
   *  field today. The AEFS contribution is therefore zero in the engine's
   *  Floating WAS calculation. Null on extraction-miss is intentional and
   *  harmless while the AEFS term is unimplemented. When AEFS is wired, this
   *  field must promote to `severity: "error", blocking: true` on null —
   *  partner-facing computational input cannot accept a silent fallback.
   *  Tracked as a deferred-implementation follow-up. */
  targetParAmount: number | null;
  /** PPM Reference Weighted Average Fixed Coupon (%). Used by the Excess WAC
   *  term: `(WeightedAvgFixedCoupon − referenceWAFC) × (fixedPar / floatingPar)`
   *  per PPM Condition 1, PDF p. 305. Per-deal extracted from PPM section 7
   *  (interest mechanics). Resolver blocks via `severity: "error",
   *  blocking: true` if the field is missing — partner-facing computational
   *  input, no silent default. The previously-shipped 4.0% Ares-family
   *  default was a CLAUDE.md principle 3 violation and has been removed. */
  referenceWeightedAverageFixedCoupon: number | null;
  /** Whether the deal is rated by Moody's (any tranche carries a non-null
   *  Moody's rating in PPM capital structure). Used by the silent-skip
   *  blocking-gate predicate so missing Moody's-tagged compliance triggers
   *  block on Moody's-rated deals but are silently absent on Fitch-only deals. */
  isMoodysRated: boolean;
  /** Whether the deal is rated by Fitch. Same predicate role as `isMoodysRated`
   *  for Fitch-tagged compliance triggers. */
  isFitchRated: boolean;
  /** Whether the deal is rated by S&P. Same predicate role as `isMoodysRated`.
   *  False on European CLOs whose Rating Agencies set is {Moody's, Fitch};
   *  true on US CLOs whose indenture defines S&P as a Rating Agency. */
  isSpRated: boolean;
  /** Deal's Rating Agencies set per the indenture. Derived strictly from
   *  tranche capital-structure rating columns (each agency present iff
   *  any tranche carries a non-empty rating value for that agency). NOT
   *  derived from `isMoodysRated` / `isSpRated` / `isFitchRated` — those
   *  are PERMISSIVE booleans that OR in compliance-test-name evidence
   *  for the silent-skip C1 blocking gate; this set is STRICT (capital-
   *  structure-only) because the OC numerator's per-agency dispatch must
   *  not use compliance-test-name evidence as a stand-in for actual
   *  tranche ratings. The two derivations diverge only on extraction-gap
   *  shapes; resolver emits a non-blocking `error` warning when the strict
   *  set has < 2 agencies on a deal that has any tranche-level agency
   *  rating data populated.
   *
   *  Consumed at the per-position recovery-rate dispatch in
   *  `recovery-rate.ts:resolveAgencyRecovery` to filter agency rates that
   *  are not the deal's rating-agency rates (a holding can be rated by
   *  S&P even on a Fitch+Moody's deal — the S&P rate is irrelevant to
   *  the OC numerator's Adjusted CPA paragraph (e) construction, which
   *  references "Fitch Collateral Value" and "Moody's Collateral Value"
   *  only — see Ares European XV PPM, oc.txt lines 7120-7124, 8765-8777,
   *  9420-9434, 368-369). */
  ratingAgencies: ("moodys" | "sp" | "fitch")[];
  impliedOcAdjustment: number; // derived residual between trustee's Adjusted CPA and identified components
  quartersSinceReport: number; // quarters between compliance report date and projection start (adjusts pre-existing default recovery timing)
  ddtlUnfundedPar: number; // total DDTL commitment par (for dynamic OC deduction in projection)
  deferredInterestCompounds: boolean; // whether PIK'd interest itself earns interest in subsequent periods
  /** PPM § 10(a)(i) — number of consecutive payment-date interest shortfalls
   *  on a non-deferrable senior tranche before an Event of Default fires.
   *  Null = use the engine's PPM-correct default (0). Standard CLO PPMs cure
   *  EoD within ~5 business days of the payment date — sub-period in a
   *  quarterly model, so if a missed payment survives to the next checkpoint
   *  the cure has lapsed. Non-standard deals whose PPM grants a multi-period
   *  grace are uncommon; if one shows up, the override path is to set this
   *  field on the resolved deal (no UI assumption knob exists today). */
  interestNonPaymentGracePeriods: number | null;
  baseRateFloorPct: number | null; // extracted reference rate floor (null = not extracted, use default)
  /** ISO 4217 currency code for the deal (e.g. "EUR", "USD", "GBP"). Sourced
   *  from `CloDeal.dealCurrency` when populated, otherwise derived as the
   *  modal `nativeCurrency` across non-defaulted holdings. Null when neither
   *  source can be determined. UI uses this to render currency symbols and to
   *  surface a "Set deal currency" banner when null. See CLAUDE.md §
   *  "Recurring failure modes" principle 1 (don't overfit) — formatting code
   *  must read this field, never hardcode `€` or `$`. */
  currency: string | null;
}

export type ResolvedSource = "db_tranche" | "ppm" | "snapshot" | "manual";

export interface ResolvedTranche {
  className: string;
  currentBalance: number;
  originalBalance: number;
  spreadBps: number;
  seniorityRank: number;
  isFloating: boolean;
  isIncomeNote: boolean;
  isDeferrable: boolean;
  isAmortising: boolean;
  amortisationPerPeriod: number | null;
  amortStartDate: string | null; // when amort begins (null = active immediately)
  source: ResolvedSource;
  /** PPM § 10(a)(i) — prior-period cumulative unpaid base interest carried
   *  into the projection (€). When the trustee report shows mid-grace
   *  shortfall on a non-deferrable senior tranche, populating this lets the
   *  engine fire EoD-on-shortfall at the PPM-correct period rather than
   *  starting the count from zero. Null = no prior shortfall (default for a
   *  healthy projection start). Resolver returns null today; trustee
   *  extraction work needed to populate. */
  priorInterestShortfall: number | null;
  /** PPM § 10(a)(i) — consecutive-period shortfall counter at T=0. Pairs
   *  with `priorInterestShortfall`: if the trustee report shows N periods
   *  of consecutive non-payment, this seeds the engine counter to N. Same
   *  null-default + same trustee-extraction TODO as `priorInterestShortfall`. */
  priorShortfallCount: number | null;
  /** PPM Condition 6(c) — opening "Deferred Interest" balance for
   *  deferrable mezzanine/junior tranches at T=0 (€). Sourced from
   *  `CloTrancheSnapshot.deferredInterestBalance` (trustee compliance
   *  report). Null = trustee did not report a value (default for healthy
   *  deals; Ares-family trustees do not maintain a separate column).
   *
   *  Sign + scale invariants (boundary):
   *    - **Non-negative.** Deferred Interest is a non-negative claim
   *      against the Issuer; a negative value would silently reduce
   *      noteholder claims. The boundary gate in `composeBuildWarnings`
   *      refuses negative values with a blocking warning.
   *    - **Bounded by `currentBalance` under compounding.** PPM 6(c):
   *      deferral is "added to the principal amount", so Deferred
   *      Interest is a subset of PAO. A trustee value above
   *      `currentBalance` is mathematically impossible and signals
   *      extraction misalignment (gate refuses).
   *    - **Zero on paid-off tranches.** Once PAO reaches zero the
   *      deferred claim is extinguished; a positive value on a
   *      zero-currentBalance tranche is invalid (gate refuses).
   *    - **Unit: euros (deal currency).** Same scale as
   *      `currentBalance`.
   *
   *  Semantics depend on the deal's `deferredInterestCompounds` flag:
   *    - `compounds=true` (Ares family — PPM 6(c): deferral "added to
   *      the principal amount … and thereafter will accrue interest at
   *      the rate of interest applicable to that Class"). Prior PIK is
   *      already embedded in `currentBalance`; the trustee value, if
   *      any, is informational. The engine ignores it; seeding from it
   *      would double-count.
   *    - `compounds=false` (non-compounding PPMs that hold deferred in
   *      a separate sub-account). The trustee value carries the T=0
   *      sub-account balance; the engine seeds `deferredBalances` from
   *      it.
   *
   *  Disjointness: only deferrable tranches can carry a non-null value;
   *  buildFromResolved emits a blocking warning when the field is
   *  populated on a non-deferrable tranche (data-shape invariant — non-
   *  deferrables breach EoD on missed interest, they cannot accumulate
   *  to a deferred bucket).
   *
   *  The trustee field's semantics were resolved by reading PPM Ares CLO
   *  XV Condition 6(c) verbatim; structural codebase signals (schema
   *  shape, DB column presence, parser absence-of-evidence) had been
   *  consistent with both compounding-PPM and non-compounding-PPM
   *  interpretations until the clause text disambiguated. */
  deferredInterestBalance: number | null;
  /** Per-tranche accrual convention (canonicalized from
   *  `clo_tranches.day_count_convention`). Undefined when extraction
   *  did not populate the column — engine falls back to
   *  `isFloating ? actual_360 : 30_360` for back-compat. The blocking
   *  gate (resolver) refuses on `null + isFixedRate` because fixed-rate
   *  tranches have no safe market default. */
  dayCountConvention?: DayCountConvention;
}

export interface ResolvedPool {
  totalPar: number; // Adjusted Collateral Principal Amount (OC numerator) or aggregate par
  totalPrincipalBalance: number; // sum of loan principal balances (interest-generating base)
  wacSpreadBps: number;
  warf: number;
  walYears: number;
  diversityScore: number;
  numberOfObligors: number;
  // Pass-through from raw.complianceData.poolSummary when available
  numberOfAssets: number | null; // unique facility count (≥ numberOfObligors)
  totalMarketValue: number | null; // pool MtM (€)
  waRecoveryRate: number | null; // WARR — portfolio weighted-average recovery
  // Composition percentages derived from concentrations[] when the poolSummary
  // columns are null. Values are percentages (7.42 = 7.42%), not fractions.
  pctFixedRate: number | null;
  pctCovLite: number | null;
  pctPik: number | null;
  pctCccAndBelow: number | null;
  pctBonds: number | null;
  pctSeniorSecured: number | null;
  pctSecondLien: number | null;
  pctCurrentPay: number | null;
  // D4 (Sprint 4): par share held by the top 10 obligors, computed from
  // loans grouped by obligorName. Populated by the resolver for the base
  // pool; recomputed by `applySwitch` for the post-trade pool so the UI
  // can show concentration impact of a proposed trade. Null when loan data
  // lacks obligorName coverage (e.g., EMPTY_RESOLVED placeholder).
  top10ObligorsPct: number | null;
  /** E1: PPM provenance for the pool-summary block (source_pages from
   *  ppm.json section_8_portfolio_and_quality_tests). Null when the
   *  underlying extraction didn't carry provenance. */
  citation?: Citation | null;
}

export interface ResolvedTrigger {
  className: string;
  triggerLevel: number;
  rank: number;
  testType: "OC" | "IC";
  source: "compliance" | "ppm";
}

export interface ResolvedDates {
  maturity: string;
  reinvestmentPeriodEnd: string | null;
  nonCallPeriodEnd: string | null;
  firstPaymentDate: string | null;
  currentDate: string;
}

export interface ResolvedFees {
  seniorFeePct: number;
  subFeePct: number;
  trusteeFeeBps: number; // Trustee + admin expenses (PPM Steps B-C), in bps p.a.
  incentiveFeePct: number; // Incentive management fee as % of residual above IRR hurdle (e.g. 20)
  incentiveFeeHurdleIrr: number; // IRR hurdle for incentive fee (annualized, e.g. 0.12 for 12%)
  /** E1: PPM provenance for the fees block (source_pages from
   *  ppm.json section_5_fees_and_hurdle). Null when the underlying
   *  extraction didn't carry provenance. */
  citation?: Citation | null;
}

export interface ResolvedLoan {
  parBalance: number;
  maturityDate: string;
  ratingBucket: string;
  spreadBps: number;
  obligorName?: string;
  isFixedRate?: boolean;       // true = flat coupon, no EURIBOR sensitivity
  fixedCouponPct?: number;     // e.g. 8.0 for 8%. Only meaningful when isFixedRate=true
  isDelayedDraw?: boolean;     // true = unfunded commitment, no interest until drawn
  ddtlSpreadBps?: number;      // spread from parent facility, applied at draw
  drawQuarter?: number;        // quarter in which the DDTL converts to funded
  // Full ratings (not just ratingBucket)
  moodysRating?: string;
  spRating?: string;
  fitchRating?: string;
  // Derived ratings (what WARF actually uses)
  moodysRatingFinal?: string;
  spRatingFinal?: string;
  fitchRatingFinal?: string;
  // Market data
  currentPrice?: number;
  marketValue?: number;
  // Per-position agency recovery rates (from `clo_holdings.recovery_rate_*`).
  // Consumed by the engine's forward-default site via `resolveAgencyRecovery`
  // — the same helper used at the resolver's pre-existing-defaulted reduction
  // — so per-position recovery applies whether the loan defaulted before or
  // during the projection. Undefined when the SDF row carried no agency
  // rate; the engine then falls back to the global `recoveryPct`.
  recoveryRateMoodys?: number;
  recoveryRateSp?: number;
  recoveryRateFitch?: number;
  // Structural
  lienType?: string;
  isDefaulted?: boolean;
  defaultDate?: string;
  floorRate?: number;
  // Moody's WARF factor for this position (1=Aaa, 10000=Ca/C). Multiply by
  // parBalance and divide by pool par to get the position's WARF contribution.
  warfFactor?: number;
  /** ISO 4217 currency code (EUR/USD/GBP). Sourced from holding's `currency`
   *  or `nativeCurrency`. Used by the Floating WAS denominator to exclude
   *  Non-Euro Obligations per PPM Condition 1 (PDF p. 302). When undefined,
   *  the loan is assumed deal-currency-denominated. */
  currency?: string;
  /** Whether the obligation is currently deferring its current cash interest
   *  payment per PPM "Deferring Security" definition (PDF p. 120). Excluded
   *  from the Floating WAS denominator. Not extracted from SDF today —
   *  resolver leaves undefined; only relevant for distressed deals. */
  isDeferring?: boolean;
  /** Whether the position is a Loss Mitigation Loan (CM-designated workout
   *  obligation per PDF pp. 135-136). Excluded from both Moody's Caa and
   *  Fitch CCC concentration tests. Not extracted from SDF today — resolver
   *  leaves undefined; only relevant when CM has designated workout positions. */
  isLossMitigationLoan?: boolean;
  /** Per-position accrual convention (canonicalized from
   *  `clo_holdings.day_count_convention`). Undefined when extraction
   *  did not populate the column — engine falls back to Actual/360 for
   *  back-compat. Resolver blocks when the column is non-empty but
   *  unrecognized, or when the column is null on a fixed-rate position
   *  (no market default exists). */
  dayCountConvention?: DayCountConvention;
  /** Cov-lite classification (from `clo_holdings.is_cov_lite`). Used by
   *  the switch simulator's delta-style `pctCovLite` recompute. The
   *  delta-recompute fires only when both swap legs carry a known
   *  isCovLite — when either leg is null/undefined, the simulator
   *  inherits the deal-level pctCovLite from the resolver and emits a
   *  coverage warning, avoiding silent inflation OR deflation of the
   *  partner-visible share. */
  isCovLite?: boolean;
  /** "Structurally PIK" classification — `pikAmount > 0` (cumulative
   *  historical PIK present) OR explicit override via the LLM-PDF
   *  extraction path. Observability/audit signal; does NOT drive engine
   *  PIK accretion. Forward dispatch is keyed on `pikSpreadBps`. */
  isPik?: boolean;
  /** Live forward PIK rate in basis points. Sourced from SDF
   *  `Current_Facility_Spread_PIK` via `clo_holdings.pik_spread_bps`
   *  (per-annum decimal × 10000 at the parser boundary). When > 0, the
   *  engine accretes `par × pikSpreadBps/10000 × dayFrac` to surviving
   *  par each period (additive on top of the cash leg — does NOT
   *  subtract from the existing `all_in_rate` / `fixedCouponPct` cash
   *  accrual). Zero / undefined → no PIK accretion. Consumed by the
   *  switch-simulator's `pctPik` recompute as the "actively accreting
   *  PIK" signal. */
  pikSpreadBps?: number;
}

export type WarningSeverity = "info" | "warn" | "error";

// Discriminated union: every site must declare its blocking decision
// explicitly. `severity: "info" | "warn"` cannot be blocking (yellow
// advisory banner with a refused projection is contradictory UX);
// `severity: "error"` may be either blocking (the gate refuses) or
// non-blocking (display-only red flag, e.g. concentration vocabulary
// drift). The `buildFromResolved` gate at `selectBlockingWarnings`
// uses `blocking === true` as its sole predicate; severity is purely
// presentational.
export type ResolutionWarning =
  | {
      field: string;
      message: string;
      severity: "info" | "warn";
      blocking: false;
      resolvedFrom?: string;
    }
  | {
      field: string;
      message: string;
      severity: "error";
      blocking: boolean;
      resolvedFrom?: string;
    };

export interface ValidationError {
  field: string;
  message: string;
}

export interface Fix {
  field: string;
  message: string;
  before: unknown;
  after: unknown;
}
