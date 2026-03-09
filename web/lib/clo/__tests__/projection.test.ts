import { describe, it, expect } from "vitest";
import {
  validateInputs,
  runProjection,
  calculateIrr,
  ProjectionInputs,
} from "../projection";

function makeInputs(overrides: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return {
    initialPar: 100_000_000,
    wacSpreadBps: 375,
    baseRatePct: 4.5,
    seniorFeePct: 0.45,
    tranches: [
      { className: "A", currentBalance: 65_000_000, spreadBps: 140, seniorityRank: 1, isFloating: true, isIncomeNote: false },
      { className: "B", currentBalance: 15_000_000, spreadBps: 250, seniorityRank: 2, isFloating: true, isIncomeNote: false },
      { className: "Sub", currentBalance: 20_000_000, spreadBps: 0, seniorityRank: 3, isFloating: false, isIncomeNote: true },
    ],
    ocTriggers: [
      { className: "A", triggerLevel: 120 },
      { className: "B", triggerLevel: 110 },
    ],
    icTriggers: [
      { className: "A", triggerLevel: 120 },
      { className: "B", triggerLevel: 110 },
    ],
    reinvestmentPeriodEnd: "2028-06-15",
    maturityDate: "2034-06-15",
    currentDate: "2026-03-09",
    cdrPct: 2,
    cprPct: 15,
    recoveryPct: 60,
    recoveryLagMonths: 12,
    reinvestmentSpreadBps: 350,
    maturitySchedule: [],
    ...overrides,
  };
}

// ─── validateInputs ──────────────────────────────────────────────────────────

describe("validateInputs", () => {
  it("accepts valid inputs", () => {
    const errors = validateInputs(makeInputs());
    expect(errors).toHaveLength(0);
  });

  it("rejects missing tranches", () => {
    const errors = validateInputs(makeInputs({ tranches: [] }));
    expect(errors.some((e) => e.field === "tranches")).toBe(true);
  });

  it("rejects zero initial par", () => {
    const errors = validateInputs(makeInputs({ initialPar: 0 }));
    expect(errors.some((e) => e.field === "initialPar")).toBe(true);
  });

  it("rejects missing maturity date", () => {
    const errors = validateInputs(makeInputs({ maturityDate: null }));
    expect(errors.some((e) => e.field === "maturityDate")).toBe(true);
  });
});

// ─── runProjection baseline (no maturities) ─────────────────────────────────

describe("runProjection baseline (no maturities)", () => {
  it("runs without error and returns periods", () => {
    const result = runProjection(makeInputs());
    expect(result.periods.length).toBeGreaterThan(0);
    expect(result.periods[0].periodNum).toBe(1);
  });

  it("par declines over time due to defaults and prepayments", () => {
    const result = runProjection(makeInputs());
    const first = result.periods[0];
    const last = result.periods[result.periods.length - 1];
    expect(last.endingPar).toBeLessThan(first.beginningPar);
  });

  it("generates equity distributions", () => {
    const result = runProjection(makeInputs());
    expect(result.totalEquityDistributions).toBeGreaterThan(0);
  });

  it("zero CDR and CPR keeps par stable during RP", () => {
    const result = runProjection(makeInputs({ cdrPct: 0, cprPct: 0 }));
    // During the RP, par should remain constant with no defaults or prepays
    const rpPeriods = result.periods.filter(
      (p) => new Date(p.date) <= new Date("2028-06-15")
    );
    for (const p of rpPeriods) {
      expect(p.beginningPar).toBeCloseTo(100_000_000, -2);
    }
  });

  it("reinvests prepayments during RP", () => {
    const result = runProjection(makeInputs());
    const rpPeriod = result.periods[0]; // Q1 is within RP
    expect(rpPeriod.reinvestment).toBeGreaterThan(0);
  });

  it("does not reinvest post-RP", () => {
    const result = runProjection(makeInputs());
    // RP ends 2028-06-15, currentDate 2026-03-09, so ~9 quarters in RP
    const postRpPeriods = result.periods.filter(
      (p) => new Date(p.date) > new Date("2028-06-15")
    );
    expect(postRpPeriods.length).toBeGreaterThan(0);
    for (const p of postRpPeriods) {
      expect(p.reinvestment).toBe(0);
    }
  });

  it("tracks tranche payoff quarters", () => {
    const result = runProjection(makeInputs());
    // The result should have entries for all tranches
    expect(result.tranchePayoffQuarter).toHaveProperty("A");
    expect(result.tranchePayoffQuarter).toHaveProperty("B");
    expect(result.tranchePayoffQuarter).toHaveProperty("Sub");
  });
});

// ─── calculateIrr ────────────────────────────────────────────────────────────

describe("calculateIrr", () => {
  it("returns null for all-positive cash flows", () => {
    expect(calculateIrr([100, 200, 300])).toBeNull();
  });

  it("returns null for fewer than 2 cash flows", () => {
    expect(calculateIrr([100])).toBeNull();
    expect(calculateIrr([])).toBeNull();
  });

  it("computes a reasonable IRR for typical CLO equity flows", () => {
    // Invest 20M, receive ~2M/quarter for 8 years → should be a positive IRR
    const flows = [-20_000_000];
    for (let i = 0; i < 32; i++) flows.push(2_000_000);
    const irr = calculateIrr(flows, 4);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.05);
    expect(irr!).toBeLessThan(1.0);
  });
});

// ─── runProjection — loan maturities ─────────────────────────────────────────

describe("runProjection — loan maturities", () => {
  it("loan maturing in Q4 reduces par in that period", () => {
    const maturityDate = addQuartersHelper("2026-03-09", 4);
    const result = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        reinvestmentPeriodEnd: null, // no RP so maturity cash is not reinvested
        maturitySchedule: [{ parBalance: 5_000_000, maturityDate }],
      })
    );
    const q4 = result.periods.find((p) => p.periodNum === 4)!;
    expect(q4.scheduledMaturities).toBeGreaterThan(0);
    // Par should be lower than the no-maturity scenario
    const baseline = runProjection(
      makeInputs({ cdrPct: 0, cprPct: 0, reinvestmentPeriodEnd: null })
    );
    const q4Baseline = baseline.periods.find((p) => p.periodNum === 4)!;
    expect(q4.endingPar).toBeLessThan(q4Baseline.endingPar);
  });

  it("matured par stops earning interest", () => {
    // Place a large maturity in Q2 so it affects interest from Q3 onward
    const maturityDate = addQuartersHelper("2026-03-09", 2);
    const withMat = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        reinvestmentPeriodEnd: null, // no RP so maturities aren't reinvested
        maturitySchedule: [{ parBalance: 30_000_000, maturityDate }],
      })
    );
    const withoutMat = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        reinvestmentPeriodEnd: null,
        maturitySchedule: [],
      })
    );
    const q3With = withMat.periods.find((p) => p.periodNum === 3)!;
    const q3Without = withoutMat.periods.find((p) => p.periodNum === 3)!;
    expect(q3With.interestCollected).toBeLessThan(q3Without.interestCollected);
  });

  it("maturities during RP are reinvested", () => {
    const maturityDate = addQuartersHelper("2026-03-09", 2); // well within RP
    const result = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        maturitySchedule: [{ parBalance: 10_000_000, maturityDate }],
      })
    );
    const q2 = result.periods.find((p) => p.periodNum === 2)!;
    // Reinvestment should include the maturity amount
    expect(q2.reinvestment).toBeGreaterThanOrEqual(q2.scheduledMaturities);
    // Par should be restored after reinvestment
    expect(q2.endingPar).toBeCloseTo(100_000_000, -2);
  });

  it("maturities post-RP flow to principal paydown", () => {
    // Place maturity after RP ends (2028-06-15 → ~Q10)
    const maturityDate = addQuartersHelper("2026-03-09", 12); // ~Q12, post-RP
    const withMat = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        maturitySchedule: [{ parBalance: 10_000_000, maturityDate }],
      })
    );
    const withoutMat = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        maturitySchedule: [],
      })
    );
    const q12With = withMat.periods.find((p) => p.periodNum === 12)!;
    const q12Without = withoutMat.periods.find((p) => p.periodNum === 12)!;
    // With maturity, more principal should be paid to tranches
    const totalPrinWith = q12With.tranchePrincipal.reduce((s, t) => s + t.paid, 0);
    const totalPrinWithout = q12Without.tranchePrincipal.reduce((s, t) => s + t.paid, 0);
    expect(totalPrinWith).toBeGreaterThan(totalPrinWithout);
  });

  it("maturity amount capped at remaining par (no double-count with defaults)", () => {
    // With 50% CDR, par erodes rapidly. Schedule a huge maturity.
    const maturityDate = addQuartersHelper("2026-03-09", 8);
    const result = runProjection(
      makeInputs({
        cdrPct: 50,
        cprPct: 0,
        reinvestmentPeriodEnd: null,
        maturitySchedule: [{ parBalance: 200_000_000, maturityDate }], // more than initial par
      })
    );
    const q8 = result.periods.find((p) => p.periodNum === 8)!;
    // scheduledMaturities should be capped — not exceed the par available after defaults
    expect(q8.scheduledMaturities).toBeLessThanOrEqual(q8.beginningPar);
    expect(q8.endingPar).toBeGreaterThanOrEqual(0);
  });

  it("loans maturing after CLO maturity are ignored", () => {
    const result = runProjection(
      makeInputs({
        maturitySchedule: [{ parBalance: 10_000_000, maturityDate: "2040-01-01" }],
      })
    );
    // No period should have scheduled maturities
    for (const p of result.periods) {
      expect(p.scheduledMaturities).toBe(0);
    }
  });

  it("multiple loans maturing in same quarter are aggregated", () => {
    const maturityDate = addQuartersHelper("2026-03-09", 3);
    const result = runProjection(
      makeInputs({
        cdrPct: 0,
        cprPct: 0,
        reinvestmentPeriodEnd: null,
        maturitySchedule: [
          { parBalance: 5_000_000, maturityDate },
          { parBalance: 3_000_000, maturityDate },
        ],
      })
    );
    const q3 = result.periods.find((p) => p.periodNum === 3)!;
    expect(q3.scheduledMaturities).toBeCloseTo(8_000_000, -2);
  });
});

// Helper to compute a date N quarters from a start date (mirrors engine logic)
function addQuartersHelper(dateIso: string, quarters: number): string {
  const d = new Date(dateIso);
  d.setMonth(d.getMonth() + quarters * 3);
  return d.toISOString().slice(0, 10);
}
