export interface ResolvedReinvestmentOcTrigger {
  triggerLevel: number;
  rank: number;
  diversionPct: number; // % of remaining interest diverted when test fails (e.g. 50 for 50%)
}

export interface ResolvedComplianceTest {
  testName: string;
  testClass: string | null;
  actualValue: number | null;
  triggerLevel: number | null;
  cushion: number | null;
  isPassing: boolean | null;
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
  /** D7: Interest Account cash — collections awaiting distribution on the next
   *  payment date (PPM Interest Account). Exposed for downstream consumers but
   *  NOT integrated into the engine OC numerator (deal-specific per-PPM). */
  interestAccountCash: number;
  /** D7: Interest Smoothing Account balance — reserve used to smooth interest
   *  distributions across periods (PPM Interest Smoothing Account). Resolver-
   *  exposed only; not wired into engine OC math. */
  interestSmoothingBalance: number;
  /** D7: Supplemental Reserve Account balance — discretionary reserve governed
   *  by the collateral manager (PPM Supplemental Reserve Account). Resolver-
   *  exposed only; not wired into engine OC math. */
  supplementalReserveBalance: number;
  /** D7: Expense Reserve Account balance — reserved for ongoing deal expenses
   *  (PPM Expense Reserve Account). Resolver-exposed only; not wired into
   *  engine OC math. */
  expenseReserveBalance: number;
  preExistingDefaultedPar: number; // par of defaulted loans excluded from loan list
  preExistingDefaultRecovery: number; // market-price recovery for priced defaulted holdings
  unpricedDefaultedPar: number; // par of defaulted holdings without market price (engine applies recoveryPct)
  preExistingDefaultOcValue: number; // recovery value for OC numerator (agency rate — typically higher than market)
  discountObligationHaircut: number; // net OC deduction for loans purchased below threshold (from par value adjustments)
  longDatedObligationHaircut: number; // net OC deduction for loans maturing after CLO (from par value adjustments)
  impliedOcAdjustment: number; // derived residual between trustee's Adjusted CPA and identified components
  quartersSinceReport: number; // quarters between compliance report date and projection start (adjusts pre-existing default recovery timing)
  ddtlUnfundedPar: number; // total DDTL commitment par (for dynamic OC deduction in projection)
  deferredInterestCompounds: boolean; // whether PIK'd interest itself earns interest in subsequent periods
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
  // Structural
  lienType?: string;
  isDefaulted?: boolean;
  defaultDate?: string;
  floorRate?: number;
  pikAmount?: number;
  // Consolidated credit watch — true if ANY agency has negative watch
  creditWatch?: boolean;
  // Moody's WARF factor for this position (1=Aaa, 10000=Ca/C). Multiply by
  // parBalance and divide by pool par to get the position's WARF contribution.
  warfFactor?: number;
}

export type WarningSeverity = "info" | "warn" | "error";

export interface ResolutionWarning {
  field: string;
  message: string;
  severity: WarningSeverity;
  resolvedFrom?: string;
}

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
