/**
 * `SeniorExpenseBreakdown` helpers.
 *
 * Pure function unit tests; no engine wiring. The full waterfall correctness
 * regression lives in n1-correctness.test.ts (KI-13a / KI-IC / KI-12b
 * markers) — if those move after a change here, the breakdown semantics
 * shifted.
 */

import { describe, it, expect } from "vitest";
import {
  applySeniorExpensesToAvailable,
  sumSeniorExpensesPreOverflow,
  type SeniorExpenseBreakdown,
} from "@/lib/clo/senior-expense-breakdown";

function breakdown(overrides: Partial<SeniorExpenseBreakdown> = {}): SeniorExpenseBreakdown {
  return {
    taxes: 100,
    issuerProfit: 250,
    trusteeCapped: 50,
    adminCapped: 75,
    seniorMgmt: 80,
    hedge: 45,
    trusteeOverflow: 0,
    adminOverflow: 0,
    ...overrides,
  };
}

describe("sumSeniorExpensesPreOverflow", () => {
  it("returns the sum of the six pre-overflow fields", () => {
    const b = breakdown();
    expect(sumSeniorExpensesPreOverflow(b)).toBe(100 + 250 + 50 + 75 + 80 + 45);
  });

  it("excludes trusteeOverflow + adminOverflow (Y/Z pay from residual interest)", () => {
    const withOverflow = breakdown({ trusteeOverflow: 999, adminOverflow: 888 });
    const withoutOverflow = breakdown();
    expect(sumSeniorExpensesPreOverflow(withOverflow)).toBe(
      sumSeniorExpensesPreOverflow(withoutOverflow),
    );
  });

  it("returns 0 when all fields are 0", () => {
    const zero: SeniorExpenseBreakdown = {
      taxes: 0, issuerProfit: 0, trusteeCapped: 0, adminCapped: 0,
      seniorMgmt: 0, hedge: 0, trusteeOverflow: 0, adminOverflow: 0,
    };
    expect(sumSeniorExpensesPreOverflow(zero)).toBe(0);
  });
});

describe("applySeniorExpensesToAvailable", () => {
  it("ample-cash path: deducts sum, returns full breakdown in paid", () => {
    const b = breakdown(); // sum = 600
    const { remainingAvailable, paid } = applySeniorExpensesToAvailable(b, 1000);
    expect(remainingAvailable).toBeCloseTo(400, 10);
    expect(paid.taxes).toBe(b.taxes);
    expect(paid.issuerProfit).toBe(b.issuerProfit);
    expect(paid.trusteeCapped).toBe(b.trusteeCapped);
    expect(paid.adminCapped).toBe(b.adminCapped);
    expect(paid.seniorMgmt).toBe(b.seniorMgmt);
    expect(paid.hedge).toBe(b.hedge);
    // Overflow fields zeroed — Y/Z computed separately on residual interest.
    expect(paid.trusteeOverflow).toBe(0);
    expect(paid.adminOverflow).toBe(0);
  });

  it("round-trip: paid under ample cash equals input field-by-field", () => {
    const b = breakdown({ taxes: 12.34, issuerProfit: 250, trusteeCapped: 7.5 });
    const { paid } = applySeniorExpensesToAvailable(b, 10_000);
    expect(sumSeniorExpensesPreOverflow(paid)).toBeCloseTo(
      sumSeniorExpensesPreOverflow(b),
      10,
    );
  });

  it("tight cash: truncates in PPM order, later steps get 0 once cash exhausted", () => {
    const b = breakdown(); // taxes=100, issuerProfit=250, trusteeCapped=50, ...
    // 120 covers taxes (100) + 20 of issuer profit; everything after that = 0.
    const { remainingAvailable, paid } = applySeniorExpensesToAvailable(b, 120);
    expect(remainingAvailable).toBe(0);
    expect(paid.taxes).toBe(100);
    expect(paid.issuerProfit).toBe(20);
    expect(paid.trusteeCapped).toBe(0);
    expect(paid.adminCapped).toBe(0);
    expect(paid.seniorMgmt).toBe(0);
    expect(paid.hedge).toBe(0);
  });

  it("zero available: every deduction is 0; remaining stays 0", () => {
    const b = breakdown();
    const { remainingAvailable, paid } = applySeniorExpensesToAvailable(b, 0);
    expect(remainingAvailable).toBe(0);
    expect(sumSeniorExpensesPreOverflow(paid)).toBe(0);
  });

  it("preserves PPM strict order: A.i (taxes) consumed before A.ii (issuerProfit)", () => {
    // available = 50; taxes alone = 100. Taxes get all 50; issuerProfit (next
    // in line) gets 0 even though it's smaller than taxes.
    const b = breakdown({ taxes: 100, issuerProfit: 30 });
    const { paid } = applySeniorExpensesToAvailable(b, 50);
    expect(paid.taxes).toBe(50);
    expect(paid.issuerProfit).toBe(0);
  });
});
