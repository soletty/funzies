// Pure deterministic CLO waterfall projection engine — no React, no DOM.
// Runs entirely client-side for instant recalculation.

export interface ProjectionInputs {
  initialPar: number;
  wacSpreadBps: number;
  baseRatePct: number;
  seniorFeePct: number;
  tranches: {
    className: string;
    currentBalance: number;
    spreadBps: number;
    seniorityRank: number;
    isFloating: boolean;
    isIncomeNote: boolean;
  }[];
  ocTriggers: { className: string; triggerLevel: number }[];
  icTriggers: { className: string; triggerLevel: number }[];
  reinvestmentPeriodEnd: string | null;
  maturityDate: string | null;
  currentDate: string;
  cdrPct: number;
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
}

export interface PeriodResult {
  periodNum: number;
  date: string;
  beginningPar: number;
  defaults: number;
  prepayments: number;
  recoveries: number;
  reinvestment: number;
  endingPar: number;
  interestCollected: number;
  trancheInterest: { className: string; due: number; paid: number }[];
  tranchePrincipal: { className: string; paid: number; endBalance: number }[];
  ocTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  icTests: { className: string; actual: number; trigger: number; passing: boolean }[];
  equityDistribution: number;
}

export interface ProjectionResult {
  periods: PeriodResult[];
  equityIrr: number | null;
  totalEquityDistributions: number;
  tranchePayoffQuarter: Record<string, number | null>;
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
    (t) => !t.isIncomeNote && (t.spreadBps === null || t.spreadBps === undefined || t.spreadBps === 0)
  );
  if (missingSpread) {
    errors.push({ field: "trancheSpreads", message: "Tranche spread/coupon data needed for interest calculations" });
  }
  return errors;
}

function quartersBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, Math.ceil(months / 3));
}

function addQuarters(dateIso: string, quarters: number): string {
  const d = new Date(dateIso);
  d.setMonth(d.getMonth() + quarters * 3);
  return d.toISOString().slice(0, 10);
}

// Helper: compute tranche coupon rate as a decimal
function trancheCouponRate(t: ProjectionInputs["tranches"][number], baseRatePct: number): number {
  // Floating: base rate + spread. Fixed: spread represents the full coupon.
  return t.isFloating
    ? (baseRatePct + t.spreadBps / 100) / 100
    : t.spreadBps / 10000;
}

export function runProjection(inputs: ProjectionInputs): ProjectionResult {
  const {
    initialPar, wacSpreadBps, baseRatePct, seniorFeePct,
    tranches, ocTriggers, icTriggers,
    reinvestmentPeriodEnd, maturityDate, currentDate,
    cdrPct, cprPct, recoveryPct, recoveryLagMonths, reinvestmentSpreadBps,
  } = inputs;

  const totalQuarters = maturityDate ? quartersBetween(currentDate, maturityDate) : 40;
  const recoveryLagQ = Math.max(0, Math.round(recoveryLagMonths / 3));

  // Annual rates → quarterly via deannualization
  const qDefaultRate = 1 - Math.pow(1 - cdrPct / 100, 0.25);
  const qPrepayRate = 1 - Math.pow(1 - cprPct / 100, 0.25);

  // Track tranche balances (debt outstanding per tranche)
  const trancheBalances: Record<string, number> = {};
  const sortedTranches = [...tranches].sort((a, b) => a.seniorityRank - b.seniorityRank);
  // Debt tranches only (no income notes) sorted by seniority for waterfall priority
  const debtTranches = sortedTranches.filter((t) => !t.isIncomeNote);
  for (const t of sortedTranches) {
    trancheBalances[t.className] = t.currentBalance;
  }

  // Pre-index OC/IC triggers by class seniority rank for O(1) lookup
  const trancheRankMap = new Map(sortedTranches.map((t) => [t.className, t.seniorityRank]));
  const ocTriggersByClass = ocTriggers.map((oc) => ({
    ...oc,
    rank: trancheRankMap.get(oc.className) ?? 0,
  }));
  const icTriggersByClass = icTriggers.map((ic) => ({
    ...ic,
    rank: trancheRankMap.get(ic.className) ?? 0,
  }));

  // Recovery pipeline: future cash from defaulted assets
  const recoveryPipeline: { quarter: number; amount: number }[] = [];

  let currentPar = initialPar; // performing collateral par
  let currentWacSpreadBps = wacSpreadBps;
  const periods: PeriodResult[] = [];
  const equityCashFlows: number[] = [];
  const tranchePayoffQuarter: Record<string, number | null> = {};
  let totalEquityDistributions = 0;

  // Initial equity investment (negative cash flow for IRR)
  const totalDebtOutstanding = debtTranches.reduce((s, t) => s + t.currentBalance, 0);
  const equityInvestment = Math.max(0, initialPar - totalDebtOutstanding);
  equityCashFlows.push(-equityInvestment);

  for (const t of sortedTranches) {
    tranchePayoffQuarter[t.className] = null;
  }

  const rpEndDate = reinvestmentPeriodEnd ? new Date(reinvestmentPeriodEnd) : null;

  for (let q = 1; q <= totalQuarters; q++) {
    const periodDate = addQuarters(currentDate, q);
    const inRP = rpEndDate ? new Date(periodDate) <= rpEndDate : false;
    const beginningPar = currentPar;

    // ── 1. Defaults ──────────────────────────────────────────────
    // Remove defaulted par from performing pool
    const defaults = currentPar * qDefaultRate;
    currentPar -= defaults;

    // Queue recovery cash to arrive after the lag period
    if (defaults > 0 && recoveryPct > 0) {
      recoveryPipeline.push({ quarter: q + recoveryLagQ, amount: defaults * (recoveryPct / 100) });
    }

    // ── 2. Prepayments ──────────────────────────────────────────
    // Prepaying loans leave the performing pool; cash goes to principal waterfall
    const prepayments = currentPar * qPrepayRate;
    currentPar -= prepayments;

    // ── 3. Recoveries ───────────────────────────────────────────
    // Recovery cash from prior defaults. This is CASH, not a restoration of par.
    // It flows to the principal waterfall as available proceeds.
    // At maturity, collect ALL pending pipeline recoveries (accelerated settlement).
    const isMaturity = q === totalQuarters;
    const recoveries = isMaturity
      ? recoveryPipeline.filter((r) => r.quarter >= q).reduce((s, r) => s + r.amount, 0)
      : recoveryPipeline.filter((r) => r.quarter === q).reduce((s, r) => s + r.amount, 0);
    // NOTE: recoveries do NOT add to currentPar — par was permanently reduced by the default.

    // ── 4. Reinvestment ─────────────────────────────────────────
    // During the RP, reinvest prepayment + recovery cash into new assets
    let reinvestment = 0;
    if (inRP) {
      reinvestment = prepayments + recoveries;
      currentPar += reinvestment;
      // Blend WAC toward reinvestment spread for newly purchased assets
      if (currentPar > 0) {
        const existingWeight = (currentPar - reinvestment) / currentPar;
        const newWeight = reinvestment / currentPar;
        currentWacSpreadBps = existingWeight * currentWacSpreadBps + newWeight * reinvestmentSpreadBps;
      }
    }

    const endingPar = currentPar;

    // ── 5. Interest collection ──────────────────────────────────
    // Interest accrues on performing par (after defaults, before it was reduced by prepays
    // that happen mid-period). Using beginningPar is the standard simplification.
    const allInRate = (baseRatePct + currentWacSpreadBps / 100) / 100;
    const interestCollected = beginningPar * allInRate / 4;

    // ── 6. Compute OC & IC ratios ───────────────────────────────
    // OC = performing par / debt outstanding (at or above the tested class)
    // IC = interest collected / interest due on debt at-and-above the tested class
    const ocResults: PeriodResult["ocTests"] = [];
    const icResults: PeriodResult["icTests"] = [];

    for (const oc of ocTriggersByClass) {
      const debtAtAndAbove = debtTranches
        .filter((t) => t.seniorityRank <= oc.rank)
        .reduce((s, t) => s + trancheBalances[t.className], 0);
      const actual = debtAtAndAbove > 0 ? (endingPar / debtAtAndAbove) * 100 : 999;
      const passing = actual >= oc.triggerLevel;
      ocResults.push({ className: oc.className, actual, trigger: oc.triggerLevel, passing });
    }

    for (const ic of icTriggersByClass) {
      const interestDueAtAndAbove = debtTranches
        .filter((t) => t.seniorityRank <= ic.rank)
        .reduce((s, t) => s + trancheBalances[t.className] * trancheCouponRate(t, baseRatePct) / 4, 0);
      const actual = interestDueAtAndAbove > 0 ? (interestCollected / interestDueAtAndAbove) * 100 : 999;
      const passing = actual >= ic.triggerLevel;
      icResults.push({ className: ic.className, actual, trigger: ic.triggerLevel, passing });
    }

    // Build a set of failing test class names for waterfall gating
    const failingOcClasses = new Set(ocResults.filter((r) => !r.passing).map((r) => r.className));
    const failingIcClasses = new Set(icResults.filter((r) => !r.passing).map((r) => r.className));

    // ── 7. Interest waterfall (OC/IC-gated) ─────────────────────
    // In a real CLO: pay senior interest → check OC/IC at that level → if fail,
    // divert remaining interest to principal before paying junior tranches.
    let availableInterest = interestCollected;
    const trancheInterest: PeriodResult["trancheInterest"] = [];
    let diversionToPaydown = 0;

    // Senior fees first (trustee, admin, collateral manager senior fee)
    const seniorFeeAmount = beginningPar * (seniorFeePct / 100) / 4;
    availableInterest -= Math.min(seniorFeeAmount, availableInterest);

    // Walk through debt tranches by seniority. After paying each tranche's interest,
    // check if any OC/IC test at that seniority level is failing.
    let diverted = false;
    for (const t of debtTranches) {
      if (diverted) {
        // Once diverted, no more interest to junior tranches
        const rate = trancheCouponRate(t, baseRatePct);
        const due = trancheBalances[t.className] * rate / 4;
        trancheInterest.push({ className: t.className, due, paid: 0 });
        continue;
      }

      const rate = trancheCouponRate(t, baseRatePct);
      const due = trancheBalances[t.className] * rate / 4;
      const paid = Math.min(due, availableInterest);
      availableInterest -= paid;
      trancheInterest.push({ className: t.className, due, paid });

      // Check if any OC/IC test at this tranche's level is failing
      if (failingOcClasses.has(t.className) || failingIcClasses.has(t.className)) {
        diversionToPaydown += availableInterest;
        availableInterest = 0;
        diverted = true;
      }
    }

    // Equity residual from interest (only if no diversion consumed everything)
    const equityFromInterest = availableInterest;

    // ── 8. Principal waterfall ──────────────────────────────────
    // Principal proceeds = all principal cash sources minus what was reinvested.
    // During RP: reinvestment = prepayments + recoveries, so net = 0 + diversion.
    // Post-RP:   reinvestment = 0, so net = prepayments + recoveries + diversion.
    // At maturity (final quarter): remaining collateral is liquidated at par.
    const liquidationProceeds = isMaturity ? endingPar : 0;
    let availablePrincipal = prepayments + recoveries - reinvestment + diversionToPaydown + liquidationProceeds;
    if (availablePrincipal < 0) availablePrincipal = 0;
    // If liquidating, the par is consumed
    if (isMaturity) currentPar = 0;

    const tranchePrincipal: PeriodResult["tranchePrincipal"] = [];
    for (const t of sortedTranches) {
      if (t.isIncomeNote) {
        tranchePrincipal.push({ className: t.className, paid: 0, endBalance: trancheBalances[t.className] });
        continue;
      }
      const paid = Math.min(trancheBalances[t.className], availablePrincipal);
      trancheBalances[t.className] -= paid;
      availablePrincipal -= paid;
      tranchePrincipal.push({ className: t.className, paid, endBalance: trancheBalances[t.className] });

      if (trancheBalances[t.className] <= 0.01 && tranchePayoffQuarter[t.className] === null) {
        tranchePayoffQuarter[t.className] = q;
      }
    }

    // Remaining principal cash + interest residual → equity
    const equityDistribution = equityFromInterest + availablePrincipal;
    totalEquityDistributions += equityDistribution;
    equityCashFlows.push(equityDistribution);

    periods.push({
      periodNum: q,
      date: periodDate,
      beginningPar,
      defaults,
      prepayments,
      recoveries,
      reinvestment,
      endingPar,
      interestCollected,
      trancheInterest,
      tranchePrincipal,
      ocTests: ocResults,
      icTests: icResults,
      equityDistribution,
    });

    // Stop early if all debt paid off and collateral is depleted
    const remainingDebt = debtTranches.reduce((s, t) => s + trancheBalances[t.className], 0);
    if (remainingDebt <= 0.01 && endingPar <= 0.01) break;
  }

  const equityIrr = calculateIrr(equityCashFlows, 4);

  return { periods, equityIrr, totalEquityDistributions, tranchePayoffQuarter };
}

export function calculateIrr(cashFlows: number[], periodsPerYear: number = 4): number | null {
  if (cashFlows.length < 2) return null;
  if (cashFlows.every((cf) => cf >= 0) || cashFlows.every((cf) => cf <= 0)) return null;

  // Newton-Raphson on periodic rate, then annualize
  let rate = 0.05;

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
      break;
    }
    rate = newRate;
    // Guard against divergence
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  // Annualize: (1 + periodic)^periodsPerYear - 1
  const annualized = Math.pow(1 + rate, periodsPerYear) - 1;
  if (!isFinite(annualized) || isNaN(annualized)) return null;
  return annualized;
}
