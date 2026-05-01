// web/lib/clo/extraction/json-ingest/types.ts

export interface PpmJsonTranche {
  class: string;                    // "Class A" ... "Subordinated Notes"
  principal: number;
  rate_description?: string;
  rate_type?: "floating" | "fixed" | "residual";
  spread_pct?: number;              // e.g. 0.95 (percent)
  margin_decimal?: number;          // e.g. 0.0095 (decimal)
  fixed_coupon_pct?: number;
  fixed_coupon_decimal?: number;
  alt_rate_post_freq_switch?: string;
  fitch?: string;
  moodys?: string;
  issue_price_pct?: number;
  oid_eur?: number;
  note?: string;
  [k: string]: unknown;
}

export interface PpmJsonTransactionParty {
  role: string;
  entity: string;
  location?: string;
  regulatory_status?: string;
  endorsement?: string;
  [k: string]: unknown;
}

export interface PpmJsonFeeEntry {
  name: string;
  rate_pct_pa?: number;
  rate_pct?: number;
  rate?: string;
  basis?: string;
  vat_treatment?: string;
  waterfall_clause?: string;
  waterfall_clauses?: string[];
  seniority?: string;
  combined_stated_mgmt_fee_pct_pa?: number;
  trigger?: string;
  [k: string]: unknown;
}

export interface PpmJsonWaterfallClause {
  clause: string;                   // "A" ... "DD"
  application: string;
  v2_note?: string;
  [k: string]: unknown;
}

export interface PpmJsonCoverageTest {
  class_group: string;              // "Class A/B", "Class C" ...
  required_ratio_pct: number;       // e.g. 129.37 (percent, not decimal)
  denominator_description?: string;
  denominator_eur?: number;
  applicable_from?: string;
  numerator?: string;
  [k: string]: unknown;
}

export interface PpmJson {
  meta: { source_file?: string; issuer?: string; lei?: string; reporting_currency?: string; [k: string]: unknown };
  section_1_deal_identity: {
    legal_name: string;
    jurisdiction?: string;
    entity_form?: string;
    company_number?: string;
    registered_office?: string;
    lei?: string;
    offering_circular_date?: string;
    issue_date?: string;
    target_par_amount?: { amount: number; currency: string; [k: string]: unknown };
    volcker_status?: string;
    listing?: string;
    transaction_parties: PpmJsonTransactionParty[];
    [k: string]: unknown;
  };
  section_2_key_dates: {
    issue_date?: string;
    effective_date_actual?: string;
    effective_date_target?: string;
    first_payment_date?: string;
    payment_dates_standard?: string[];
    payment_frequency?: string;
    determination_date?: string;
    non_call_period_end?: string;
    reinvestment_period_end?: string;
    stated_maturity?: string;
    [k: string]: unknown;
  };
  section_3_capital_structure: {
    denomination_currency?: string;
    common_maturity?: string;
    tranches: PpmJsonTranche[];
    total_principal?: number;
    rated_notes_principal?: number;
    subordinated_principal?: number;
    total_oid_eur?: number;
    subordination?: Array<{ class: string; subordinate_principal_eur: number; subordination_pct: number }>;
    [k: string]: unknown;
  };
  section_4_coverage_tests: {
    par_value_tests: PpmJsonCoverageTest[];
    interest_coverage_tests: PpmJsonCoverageTest[];
    reinvestment_oc_test?: { required_ratio_pct: number; description?: string; trigger_action?: string; waterfall_clause?: string };
    event_of_default_par_value_test?: { required_ratio_pct: number; [k: string]: unknown };
    // Condition 1 / 10(a)(iv) Excess CCC Adjustment Amount parameters used
    // by the OC numerator haircut. Outer-nullable, inner-required.
    excess_ccc_adjustment?: { threshold_pct: number; market_value_pct: number } | null;
    [k: string]: unknown;
  };
  section_5_fees_and_hurdle: {
    fees: PpmJsonFeeEntry[];
    incentive_fee_irr_threshold?: { threshold_pct_pa: number; [k: string]: unknown };
    [k: string]: unknown;
  };
  section_6_waterfall: {
    interest_priority_of_payments: { clauses: PpmJsonWaterfallClause[]; [k: string]: unknown };
    principal_priority_of_payments: { clauses: PpmJsonWaterfallClause[]; [k: string]: unknown };
    post_acceleration_priority_of_payments?: { sequence_summary?: string; [k: string]: unknown };
    [k: string]: unknown;
  };
  section_7_interest_mechanics: {
    conventions?: Record<string, unknown>;
    interest_deferral?: Record<string, unknown>;
    frequency_switch_event?: Record<string, unknown>;
    [k: string]: unknown;
  };
  section_8_portfolio_and_quality_tests: {
    portfolio_profile_limits_selected?: Array<{ bucket: string; direction: string; limit_pct: number; basis?: string; note?: string }>;
    collateral_quality_tests?: Array<{ test: string; description?: string }>;
    moodys_test_matrix_sample?: Record<string, unknown>;
    fitch_test_matrix?: Record<string, unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface ComplianceJsonTranche {
  tranche: string;                  // "Class A" ... "Subordinated"
  original: number;
  current: number;
  rate?: number | null;             // decimal, e.g. 0.02966
  spread?: number | null;           // decimal, e.g. 0.0095
  period_interest?: number;
  fitch?: string;
  moody?: string;
  maturity?: string;
  [k: string]: unknown;
}

export interface ComplianceJsonPvTest {
  test: string;                     // "Class A/B", ... "Event of Default (10(a)(iv))"
  numerator: number;
  denominator: number;
  prior?: number;
  actual: number;                   // ratio (1.3698), NOT percent
  trigger: number;                  // ratio
  cushion?: number;
  result: "Passed" | "Failed" | "N/A";
  indenture_section?: string;
  subtype?: string;
  numerator_composition?: Array<{ id: number; basis: string; scope?: string; description?: string; formula?: string; current_period_value: number }>;
  denominator_spec?: { basis: string; scope?: string; current_period_value: number };
  [k: string]: unknown;
}

export interface ComplianceJsonIcTest {
  test: string;                     // "Class A/B IC"
  numerator: number;
  denominator: number;
  prior?: number;
  actual: number;                   // ratio
  trigger: number;                  // ratio
  cushion?: number;
  result: "Passed" | "Failed" | "N/A";
  [k: string]: unknown;
}

export interface ComplianceJsonQualityTest {
  test: string;                     // "Fitch Maximum WARF", "Moody's Minimum Diversity", "Weighted Average Life", etc.
  actual: number;
  trigger: number;
  prior?: number;
  result: "Passed" | "Failed" | "N/A";
  [k: string]: unknown;
}

export interface ComplianceJsonPortfolioTest {
  code: string;                     // "a" ... "dd"
  test: string;
  limit?: number;
  limit_pct?: number;
  actual?: number;
  actual_pct?: number;
  result?: string;
  [k: string]: unknown;
}

export interface ComplianceJsonHolding {
  description: string;              // "Admiral Bidco GmbH - Facility B2"
  security_id?: string;             // LXID or ISIN ("LX28443T7", "XS3134529562")
  loan_type?: string;
  market_price?: number;
  par_quantity?: number;
  principal_balance?: number;
  unfunded_amount?: number;
  security_level?: string;
  maturity_date?: string;           // "29-Sep-2032"
  [k: string]: unknown;
}

export interface ComplianceJsonAccrualPosition {
  description: string;
  security_id?: string;
  rate_type?: "Fixed" | "Floating";
  payment_period?: string;
  principal_balance?: number;
  base_index?: string | null;
  index_rate_pct?: number | null;
  index_floor_pct?: number | null;
  spread_pct?: number | null;
  credit_spread_adj_pct?: number | null;
  effective_spread_pct?: number | null;
  all_in_rate_pct?: number | null;
  spread_bps?: number | null;
  [k: string]: unknown;
}

export interface ComplianceJsonTrade {
  description: string;
  security_id?: string;
  trade_date?: string;
  settle_date?: string | null;
  ccy?: string;
  par: number;
  price?: number;
  principal?: number;
  accrued?: number;
  total?: number;
  reason?: string | null;
  [k: string]: unknown;
}

export interface ComplianceJsonAccount {
  name: string;
  group?: string;
  ccy?: string;
  native_trade?: number;
  native_received?: number;
  deal_trade_eur?: number;
  deal_received_eur?: number;
  [k: string]: unknown;
}

export interface ComplianceJson {
  meta: { source_file?: string; determination_date: string; reporting_currency?: string; issuer?: string; lei?: string; trustee?: string; collateral_manager?: string; [k: string]: unknown };
  key_dates: {
    closing_date?: string;
    effective_date?: string;
    collection_period_start?: string;
    collection_period_end?: string;
    current_payment_date?: string;
    next_collection_period_start?: string;
    next_collection_period_end?: string;
    next_payment_date?: string;
    reinvestment_period_end?: string;
    stated_maturity?: string;
    euribor_reference_rate?: number;
    [k: string]: unknown;
  };
  capital_structure: ComplianceJsonTranche[];
  pool_summary: {
    aggregate_principal_balance?: number;
    principal_proceeds?: number;
    unused_proceeds?: number;
    collateral_principal_amount?: number;
    adjusted_collateral_principal_amount?: number;
    defaulted_obligations?: number;
    senior_secured_loans?: number;
    senior_secured_bonds?: number;
    aggregate_funded_spread?: number;
    [k: string]: unknown;
  };
  par_value_tests: ComplianceJsonPvTest[];
  interest_coverage_tests: { numerator_detail?: Record<string, unknown>; tests: ComplianceJsonIcTest[] };
  collateral_quality_tests: ComplianceJsonQualityTest[];
  portfolio_profile_tests: ComplianceJsonPortfolioTest[];
  other_tests?: Array<Record<string, unknown>>;
  account_balances: { accounts: ComplianceJsonAccount[]; zero_balance_accounts?: string[]; [k: string]: unknown };
  schedule_of_investments: ComplianceJsonHolding[];
  moody_caa_obligations?: { positions: Array<Record<string, unknown>>; [k: string]: unknown };
  fitch_ccc_obligations?: { positions: Array<Record<string, unknown>>; [k: string]: unknown };
  purchases?: ComplianceJsonTrade[];
  sales?: ComplianceJsonTrade[];
  paydowns?: Array<{ category?: string; description: string; security_id?: string; date?: string; amount: number }>;
  unsettled_trades_summary?: Record<string, unknown>;
  rating_migration?: Record<string, unknown>;
  rating_concentrations?: Record<string, unknown>;
  restructured_assets?: Array<Record<string, unknown>>;
  interest_smoothing_account?: Record<string, unknown>;
  notes_payment_history?: { per_tranche: Record<string, { rows: Array<Record<string, unknown>>; [k: string]: unknown }>; [k: string]: unknown };
  current_period_execution?: {
    payment_date?: string;
    tranche_distributions?: Array<{ class: string; original: number; beginning: number; all_in_rate?: number; interest_due?: number; deferred_interest_due?: number; interest_paid?: number; deferred_interest_paid?: number; principal_paid?: number; ending: number; note?: string }>;
    account_flow_on_payment_date?: Record<string, unknown>;
    administrative_expenses?: Array<Record<string, unknown>>;
    management_fees_paid?: Record<string, unknown>;
    interest_waterfall_execution?: Array<Record<string, unknown>>;
    principal_waterfall?: Record<string, unknown>;
    tranche_snapshots_this_period?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  interest_accrual_detail?: {
    source?: string;
    position_count?: number;
    fixed_count?: number;
    floating_count?: number;
    computed_was_pct?: number;
    positions: ComplianceJsonAccrualPosition[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
