/**
 * Non-principal CLO account balances — extraction shape.
 *
 * Resolver extracts interest account, interest smoothing, supplemental
 * reserve, and expense reserve balances from `accountBalances[]` and exposes
 * them on ResolvedDealData. Engine consumption (Q1 routing per PPM Conditions
 * 3(j)(ii) / 3(j)(vi) / 3(j)(x) / 3(j)(xii)) and the resolver block on a
 * missing-section path live in their respective marker tests
 * (account-opening-balances.test.ts, blocking-extraction-failures.test.ts).
 * This file pins the case-insensitive matcher and abbreviation handling at
 * the resolver layer.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { CloAccountBalance } from "@/lib/clo/types/entities";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function runResolver(accountBalances: CloAccountBalance[]) {
  return resolveWaterfallInputs(
    fixture.raw.constraints,
    fixture.raw.complianceData,
    fixture.raw.tranches,
    fixture.raw.trancheSnapshots,
    fixture.raw.holdings,
    fixture.raw.dealDates,
    accountBalances,
    fixture.raw.parValueAdjustments,
  );
}

describe("D7 — Non-principal account balances on ResolvedDealData", () => {
  it("Euro XV fixture: extracts all four non-principal account balances", () => {
    const { resolved } = runResolver(fixture.raw.accountBalances);
    // All Euro XV non-principal balances in the fixture are 0 (the only
    // non-zero account is the Principal EUR overdraft, which lands on
    // principalAccountCash via the existing B1 extraction).
    expect(resolved.interestAccountCash).toBe(0);
    expect(resolved.interestSmoothingBalance).toBe(0);
    expect(resolved.supplementalReserveBalance).toBe(0);
    expect(resolved.expenseReserveBalance).toBe(0);
  });

  it("empty accountBalances array on a real deal: resolver still returns zeros (gate fires separately)", () => {
    // The four reserve fields zero out at the extraction layer when no rows
    // are present. The blocking gate that refuses the projection on a
    // missing-section path lives in `blocking-extraction-failures.test.ts`
    // — extraction-shape and gate-behavior are distinct surfaces, kept in
    // their own files for marker discoverability.
    const { resolved } = runResolver([]);
    expect(resolved.interestAccountCash).toBe(0);
    expect(resolved.interestSmoothingBalance).toBe(0);
    expect(resolved.supplementalReserveBalance).toBe(0);
    expect(resolved.expenseReserveBalance).toBe(0);
  });

  it("case-insensitive matching: routes mixed-case names to correct buckets", () => {
    const mk = (accountName: string, balanceAmount: number): CloAccountBalance => ({
      id: `stub-${accountName}`,
      reportPeriodId: "stub",
      accountName,
      accountType: null,
      currency: null,
      balanceAmount,
      requiredBalance: null,
      excessDeficit: null,
      accountInterest: null,
      dataSource: "test",
    });
    const balances: CloAccountBalance[] = [
      mk("Deal Interest Account EUR", 100),
      mk("DEAL INTEREST SMOOTHING ACCOUNT", 200),
      mk("deal supplemental reserve account", 300),
      mk("Deal Expense Reserve EUR", 400),
    ];
    const { resolved } = runResolver(balances);
    expect(resolved.interestAccountCash).toBe(100);
    expect(resolved.interestSmoothingBalance).toBe(200);
    expect(resolved.supplementalReserveBalance).toBe(300);
    expect(resolved.expenseReserveBalance).toBe(400);
  });

  it("abbreviated account names (SMOOTH / SUPP RES / EXP RES) route correctly", () => {
    // Euro XV fixture uses abbreviated trustee-report account names:
    //   "ARES XV INTEREST SMOOTH ACT EUR" → interestSmoothingBalance
    //   "ARES XV SUPP RES ACCOUNT EUR"    → supplementalReserveBalance
    //   "ARES XV EXP RES ACCOUNT EUR"     → expenseReserveBalance
    // Strict tokens ("smoothing" / "supplemental" / "expense") would silently
    // misroute these into the default interestAccountCash bucket. Original D7
    // matchers only caught the full-word forms; this test pins the broadened
    // substring matchers so a future "simplify tokens" regression fails loudly.
    const mk = (accountName: string, balanceAmount: number): CloAccountBalance => ({
      id: `stub-${accountName}`,
      reportPeriodId: "stub",
      accountName,
      accountType: null,
      currency: null,
      balanceAmount,
      requiredBalance: null,
      excessDeficit: null,
      accountInterest: null,
      dataSource: "test",
    });
    const balances: CloAccountBalance[] = [
      mk("ARES XV INTEREST SMOOTH ACT EUR", 111),
      mk("ARES XV SUPP RES ACCOUNT EUR", 222),
      mk("ARES XV EXP RES ACCOUNT EUR", 333),
    ];
    const { resolved } = runResolver(balances);
    expect(resolved.interestSmoothingBalance).toBe(111);
    expect(resolved.supplementalReserveBalance).toBe(222);
    expect(resolved.expenseReserveBalance).toBe(333);
    // And the default interestAccountCash bucket did NOT receive any of them.
    expect(resolved.interestAccountCash).toBe(0);
  });

  it("multi-row sum: two expense reserve rows are summed", () => {
    const mk = (accountName: string, balanceAmount: number): CloAccountBalance => ({
      id: `stub-${accountName}`,
      reportPeriodId: "stub",
      accountName,
      accountType: null,
      currency: null,
      balanceAmount,
      requiredBalance: null,
      excessDeficit: null,
      accountInterest: null,
      dataSource: "test",
    });
    const balances: CloAccountBalance[] = [
      mk("Expense Reserve EUR", 1000),
      mk("Expense Reserve USD", 2500),
    ];
    const { resolved } = runResolver(balances);
    expect(resolved.expenseReserveBalance).toBe(3500);
  });
});
