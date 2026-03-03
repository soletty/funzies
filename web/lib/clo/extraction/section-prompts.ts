type Prompt = { system: string; user: string };

const COMMON_RULES = `Rules:
- Extract ONLY explicitly stated values. Use null for missing fields. Never fabricate data.
- Percentages as numbers (e.g., 5.2 not "5.2%").
- Monetary amounts as raw numbers without currency symbols.
- Dates in YYYY-MM-DD format.`;

// ---------------------------------------------------------------------------
// Compliance Report Section Prompts
// ---------------------------------------------------------------------------

export function complianceSummaryPrompt(): Prompt {
  return {
    system: `You are extracting the compliance summary section of a CLO trustee report from markdown text that was transcribed from a PDF.

Extract:
- Report date, deal name, trustee, collateral manager
- Tranche table: class name, principal amount, spread, all-in rate, current balance, rating, coupon rate
- Pool summary metrics: total par, number of assets, number of obligors, WAC spread, WARF, diversity score, WAL, WA recovery rate
- Percentage breakdowns: fixed rate, floating rate, cov-lite, second lien, defaulted, CCC and below

REPORT DATE — CRITICAL:
- Look for "Report Date:", "Determination Date:", "As of:", "Payment Date:".
- Convert to YYYY-MM-DD. NEVER return "UNKNOWN" or a placeholder — use null only as a last resort.

TRANCHE TABLE:
- Extract ALL tranches from the summary table — from Class A through subordinated notes.
- Each tranche needs: className, principalAmount, spread, allInRate, currentBalance, rating, couponRate.

${COMMON_RULES}`,
    user: `Extract the compliance summary section from the following markdown text.`,
  };
}

export function parValueTestsPrompt(): Prompt {
  return {
    system: `You are extracting par value / overcollateralization tests from a CLO trustee report's markdown text.

For EACH test extract: testName, testClass, numerator, denominator, actualValue, triggerLevel, cushionPct, isPassing, consequenceIfFail.

CRITICAL: Every test has BOTH actualValue AND triggerLevel. Look for "Trigger", "Limit", "Threshold", "Required", "Min", "Max" columns. If "Actual: 129.03, Required: 120.0", then actualValue=129.03 and triggerLevel=120.0.

Par value adjustments: Extract haircuts for CCC excess, defaulted, discount obligations, etc. Each with testName, adjustmentType, description, grossAmount, adjustmentAmount, netAmount.

Normalize class names: "Class A/B", "Classes A and B" -> use "A/B".

DEDUPLICATION: Same test may appear in multiple places. Extract each unique test ONLY ONCE with the most complete data (has actualValue, triggerLevel, and isPassing).

${COMMON_RULES}`,
    user: `Extract all par value / overcollateralization tests from the following markdown text.`,
  };
}

export function interestCoverageTestsPrompt(): Prompt {
  return {
    system: `You are extracting interest coverage (IC) tests from a CLO trustee report's markdown text.

For EACH test extract: testName, testClass, numerator, denominator, actualValue, triggerLevel, cushionPct, isPassing, consequenceIfFail.

Also extract interest amounts per tranche from the IC test denominator breakdown: className, interestAmount, currency.

CRITICAL: Every test has BOTH actualValue AND triggerLevel. Look for "Trigger", "Limit", "Threshold", "Required", "Min", "Max" columns.

Normalize class names: "Class A/B", "Classes A and B" -> use "A/B".

DEDUPLICATION: Same test may appear in multiple places. Extract each unique test ONLY ONCE with the most complete data.

${COMMON_RULES}`,
    user: `Extract all interest coverage tests from the following markdown text.`,
  };
}

export function assetSchedulePrompt(): Prompt {
  return {
    system: `You are extracting the complete holdings schedule from a CLO trustee report's markdown text.

COMPLETENESS — CRITICAL:
- CLO portfolios have 100-250+ positions. You MUST extract EVERY SINGLE ONE.
- Do NOT stop partway through. Extract from A through Z.

For each holding extract: obligorName, facilityName, isin, lxid, assetType, currency, country, industryCode, industryDescription, moodysIndustry, spIndustry, ratings (moodysRating, spRating, fitchRating, compositeRating, ratingFactor), parBalance, principalBalance, marketValue, purchasePrice, currentPrice, accruedInterest, referenceRate, indexRate, spreadBps, allInRate, floorRate, recoveryRateMoodys, recoveryRateSp, remainingLifeYears, warfContribution, diversityScoreGroup, acquisitionDate, maturityDate, settlementStatus, boolean flags (isCovLite, isRevolving, isDelayedDraw, isDefaulted, isPik, isFixedRate, isDiscountObligation, isLongDated).

MULTI-TABLE: The markdown may contain a unified table from Phase 2 transcription. Extract all rows regardless of source table.

- Spreads in basis points as numbers (375 not "L+375")
- Prices as numbers (99.5)
- Rates as percentages (7.25 for 7.25%)
- Boolean flags as true/false/null
- Use null for missing fields, never fabricate data

${COMMON_RULES}`,
    user: `Extract the complete holdings schedule from the following markdown text.`,
  };
}

export function concentrationPrompt(): Prompt {
  return {
    system: `You are extracting concentration and distribution data from a CLO trustee report's markdown text.

Extract EVERY concentration/distribution bucket. Types: INDUSTRY, COUNTRY, SINGLE_OBLIGOR, RATING, MATURITY, SPREAD, ASSET_TYPE, CURRENCY.

For each bucket: concentrationType, bucketName, actualValue, actualPct, limitValue, limitPct, isPassing, excessAmount, isHaircutApplied, haircutAmount, obligorCount, assetCount.

Include ALL rows from:
- Industry distribution tables
- Country distribution tables
- Obligor concentration / top exposures
- Rating distribution tables
- Maturity profile tables
- Spread distribution tables
- Asset type distribution tables
- Currency distribution tables

${COMMON_RULES}`,
    user: `Extract all concentration and distribution data from the following markdown text.`,
  };
}

export function waterfallPrompt(): Prompt {
  return {
    system: `You are extracting waterfall payment data from a CLO trustee report's markdown text.

Extract ALL waterfall steps in priority order for both interest and principal waterfalls.
For each step: waterfallType (INTEREST/PRINCIPAL), priorityOrder, description, payee, amountDue, amountPaid, shortfall, fundsAvailableBefore, fundsAvailableAfter, isOcTestDiversion, isIcTestDiversion.

Extract proceeds: proceedsType, sourceDescription, amount, periodStart, periodEnd.

TRANCHE SNAPSHOTS — CRITICAL:
- Extract one for EVERY note class. These are essential for the waterfall model.
- For each: className, currentBalance, factor, couponRate, interestAccrued, interestPaid, interestShortfall, principalPaid, beginningBalance, endingBalance.
- If BOTH aggregated ("Class A Notes") and detailed ("Class A Loan" + "Class A Notes") entries exist, use ONLY the detailed ones.

${COMMON_RULES}`,
    user: `Extract all waterfall steps, proceeds, and tranche snapshots from the following markdown text.`,
  };
}

export function tradingActivityPrompt(): Prompt {
  return {
    system: `You are extracting trading activity from a CLO trustee report's markdown text.

Extract ALL trades: purchases, sales, paydowns, prepayments, defaults, recoveries.
For each: tradeType (PURCHASE/SALE/PAYDOWN/PREPAYMENT/DEFAULT_RECOVERY/CREDIT_RISK_SALE/DISCRETIONARY_SALE/SUBSTITUTION/AMENDED/RESTRUCTURED), obligorName, facilityName, tradeDate, settlementDate, parAmount, settlementPrice, settlementAmount, realizedGainLoss, currency, isCreditRiskSale, isCreditImproved, isDiscretionary.

Extract trading summary: totalPurchasesPar, totalSalesPar, totalSalesProceeds, netGainLoss, totalPaydowns, totalRecoveries, creditRiskSalesPar, discretionarySalesPar, remainingDiscretionaryAllowance.

- Prices as numbers
- Amounts as raw numbers

${COMMON_RULES}`,
    user: `Extract all trading activity from the following markdown text.`,
  };
}

export function interestAccrualPrompt(): Prompt {
  return {
    system: `You are extracting per-asset interest rate details from a CLO trustee report's markdown text.

For each asset: obligorName, facilityName, referenceRate, baseRate, indexFloor, spread, creditSpreadAdj, effectiveSpread, allInRate.

- Rates as numbers (e.g., 3.5 for 3.5%, 375 for 375 bps spread)

${COMMON_RULES}`,
    user: `Extract per-asset interest rate details from the following markdown text.`,
  };
}

export function accountBalancesPrompt(): Prompt {
  return {
    system: `You are extracting account balances from a CLO trustee report's markdown text.

Extract ALL account balances.
For each: accountName, accountType (COLLECTION/PAYMENT/RESERVE/PRINCIPAL/INTEREST/EXPENSE/HEDGE/CUSTODY), currency, balanceAmount, requiredBalance, excessDeficit.

Look for: Payment Account, Interest Collection Account, Principal Collection Account, Reserve Account, Expense Account, Custody Account, and any other named accounts.

${COMMON_RULES}`,
    user: `Extract all account balances from the following markdown text.`,
  };
}

export function supplementaryPrompt(): Prompt {
  return {
    system: `You are extracting supplementary data from a CLO trustee report's markdown text.

Extract:
- Fees: feeType, payee, rate, accrued, paid, unpaid
- Hedge positions: hedgeType, counterparty, counterpartyRating, notional, mtm, maturityDate
- FX rates: baseCurrency, quoteCurrency, spotRate, hedgeRate
- Rating actions: agency, tranche, priorRating, newRating, actionType, date
- Events: eventType, eventDate, description, isEventOfDefault, isCured
- S&P CDO Monitor: tranche, sdr, bdr, cushion

${COMMON_RULES}`,
    user: `Extract all supplementary data (fees, hedging, FX rates, rating actions, events, S&P CDO Monitor) from the following markdown text.`,
  };
}

// ---------------------------------------------------------------------------
// PPM Section Prompts
// ---------------------------------------------------------------------------

export function ppmTransactionOverviewPrompt(): Prompt {
  return {
    system: `You are extracting the transaction overview from a CLO private placement memorandum's markdown text.

Extract deal identity: dealName, issuerLegalName, jurisdiction, entityType, governingLaw, currency, listingExchange.

${COMMON_RULES}`,
    user: `Extract the transaction overview from the following markdown text.`,
  };
}

export function ppmCapitalStructurePrompt(): Prompt {
  return {
    system: `You are extracting the capital structure from a CLO private placement memorandum's markdown text.

CRITICAL: Extract ALL tranches from Class A through subordinated/equity notes.
For each tranche: class, designation, principalAmount, rateType, referenceRate, spreadBps, spread, rating (fitch, sp), deferrable, maturityDate, isSubordinated.

Also extract deal sizing: targetParAmount, totalRatedNotes, totalSubordinatedNotes, totalDealSize, equityPctOfDeal.

${COMMON_RULES}`,
    user: `Extract the capital structure from the following markdown text.`,
  };
}

export function ppmCoverageTestsPrompt(): Prompt {
  return {
    system: `You are extracting coverage test definitions from a CLO private placement memorandum's markdown text.

Extract coverage test entries: class, parValueRatio, interestCoverageRatio.

Extract reinvestment OC test: trigger, appliesDuring, diversionAmount.

${COMMON_RULES}`,
    user: `Extract the coverage test definitions from the following markdown text.`,
  };
}

export function ppmEligibilityCriteriaPrompt(): Prompt {
  return {
    system: `You are extracting eligibility criteria from a CLO private placement memorandum's markdown text.

Extract EVERY eligibility criterion (typically 30-45 items). Be exhaustive — check annexes and schedules in the text.

Also extract reinvestment criteria: duringReinvestment, postReinvestment, substituteRequirements.

${COMMON_RULES}`,
    user: `Extract all eligibility criteria from the following markdown text.`,
  };
}

export function ppmPortfolioConstraintsPrompt(): Prompt {
  return {
    system: `You are extracting portfolio constraints from a CLO private placement memorandum's markdown text.

Extract ALL collateral quality tests: WARF, WAS, WAL, diversity score, WA recovery rate, etc. Each with name, agency, value.

Extract ALL portfolio profile tests (typically 25-35 tests with min/max limits). Include conditional/tiered limits. Each test is a record with min, max, and optional notes.

${COMMON_RULES}`,
    user: `Extract all portfolio constraints from the following markdown text.`,
  };
}

export function ppmWaterfallRulesPrompt(): Prompt {
  return {
    system: `You are extracting waterfall rules from a CLO private placement memorandum's markdown text.

Extract as structured prose:
- interestPriority: The full interest waterfall priority of payments
- principalPriority: The full principal waterfall priority of payments
- postAcceleration: The post-acceleration waterfall if described

${COMMON_RULES}`,
    user: `Extract the waterfall rules from the following markdown text.`,
  };
}

export function ppmFeesPrompt(): Prompt {
  return {
    system: `You are extracting fees and account definitions from a CLO private placement memorandum's markdown text.

Extract all fees: name, rate, basis, description.

Extract account definitions: name, purpose.

${COMMON_RULES}`,
    user: `Extract all fees and account definitions from the following markdown text.`,
  };
}

export function ppmKeyDatesPrompt(): Prompt {
  return {
    system: `You are extracting key dates from a CLO private placement memorandum's markdown text.

CRITICAL: Extract ACTUAL DATE VALUES, not field labels.
- maturityDate should be "2035-07-15" not "Maturity Date".
- Look in the summary/term sheet sections for actual dates.
- If only month/year is given, use the 15th (e.g., "July 2035" -> "2035-07-15").

Extract: originalIssueDate, currentIssueDate, maturityDate, nonCallPeriodEnd, reinvestmentPeriodEnd, firstPaymentDate, paymentFrequency.

${COMMON_RULES}`,
    user: `Extract all key dates from the following markdown text.`,
  };
}

export function ppmKeyPartiesPrompt(): Prompt {
  return {
    system: `You are extracting key parties from a CLO private placement memorandum's markdown text.

Extract key parties: role, entity (e.g., Trustee, Collateral Manager, Issuer, Arranger, Placement Agent, etc.)

Extract collateral manager details: name, parent, replacementMechanism.

${COMMON_RULES}`,
    user: `Extract all key parties from the following markdown text.`,
  };
}

export function ppmRedemptionPrompt(): Prompt {
  return {
    system: `You are extracting redemption provisions and events of default from a CLO private placement memorandum's markdown text.

Extract redemption provisions: type (optional, mandatory, special, tax, clean-up call), description.

Extract events of default (typically 8-12 events): event, description.

${COMMON_RULES}`,
    user: `Extract all redemption provisions and events of default from the following markdown text.`,
  };
}

export function ppmHedgingPrompt(): Prompt {
  return {
    system: `You are extracting hedging requirements from a CLO private placement memorandum's markdown text.

Extract: currencyHedgeRequired, hedgeTypes, counterpartyRatingReq, replacementTimeline, maxCurrencyHedgePct.

${COMMON_RULES}`,
    user: `Extract hedging requirements from the following markdown text.`,
  };
}
