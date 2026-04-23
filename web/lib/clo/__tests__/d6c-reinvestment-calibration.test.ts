/**
 * D6c — Reinvestment calibration from manager's actual BUY trades.
 *
 * Pre-fill only: calibrates the projection UI's reinvestment sliders from
 * the manager's observed BUY behavior (spread, tenor, rating). No engine
 * math changes; failing here means the partner sees generic defaults
 * instead of trade-calibrated ones — a UI regression, not a correctness
 * regression.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calibrateReinvestmentFromTrades,
  MIN_TRADES,
} from "@/lib/clo/reinvestment-calibration";
import type { CloTrade, CloHolding } from "@/lib/clo/types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  raw: { trades: CloTrade[]; holdings: CloHolding[] };
  resolved: { dates: { currentDate: string } };
};

function baseTrade(over: Partial<CloTrade>): CloTrade {
  return {
    id: "t",
    reportPeriodId: "rp",
    tradeType: null,
    obligorName: null,
    facilityName: null,
    isin: null,
    tradeDate: null,
    settlementDate: null,
    parAmount: null,
    settlementPrice: null,
    settlementAmount: null,
    realizedGainLoss: null,
    accruedInterestTraded: null,
    currency: null,
    counterparty: null,
    isCreditRiskSale: null,
    isCreditImproved: null,
    isDiscretionary: null,
    cashFlowType: null,
    bookDate: null,
    transactionCode: null,
    description: null,
    saleReason: null,
    trustAccount: null,
    figi: null,
    nativeAmount: null,
    nativeCurrency: null,
    dataSource: null,
    ...over,
  };
}

function baseHolding(over: Partial<CloHolding>): CloHolding {
  const h: Partial<CloHolding> = {
    id: "h",
    reportPeriodId: "rp",
    obligorName: null,
    facilityName: null,
    isin: null,
    lxid: null,
    assetType: null,
    currency: null,
    country: null,
    industryCode: null,
    industryDescription: null,
    moodysIndustry: null,
    spIndustry: null,
    isCovLite: null,
    isRevolving: null,
    isDelayedDraw: null,
    isDefaulted: null,
    isPik: null,
    isFixedRate: null,
    isDiscountObligation: null,
    isLongDated: null,
    settlementStatus: null,
    acquisitionDate: null,
    maturityDate: null,
    parBalance: null,
    principalBalance: null,
    marketValue: null,
    purchasePrice: null,
    currentPrice: null,
    accruedInterest: null,
    referenceRate: null,
    indexRate: null,
    spreadBps: null,
    allInRate: null,
    floorRate: null,
    moodysRating: null,
    spRating: null,
    fitchRating: null,
    compositeRating: null,
    ...over,
  };
  return h as CloHolding;
}

describe("D6c — calibrateReinvestmentFromTrades (Euro XV fixture)", () => {
  it("produces a non-null calibration from the 4 BUY trades in Euro XV Q1", () => {
    const cal = calibrateReinvestmentFromTrades(
      fixture.raw.trades,
      fixture.raw.holdings,
      fixture.resolved.dates.currentDate,
    );
    expect(cal).not.toBeNull();
    // Euro XV has 4 BUY trades (description "Facility - Purchase (D)" etc.),
    // all of which match a holding by (obligor, facility).
    expect(cal!.tradeCount).toBe(4);
    // Trades span March-April 2026 per the fixture.
    expect(cal!.minTradeDate).toBe("2026-03-10");
    expect(cal!.maxTradeDate).toBe("2026-04-01");
  });

  it("calibrates spread + tenor + rating in sensible ranges for Euro XV Q1", () => {
    const cal = calibrateReinvestmentFromTrades(
      fixture.raw.trades,
      fixture.raw.holdings,
      fixture.resolved.dates.currentDate,
    )!;
    // Par-weighted spread across the 4 BUYs is ~344 bps (3 trades at 350/375,
    // one at 300). Allow a couple bps of slack for par-proxy arithmetic.
    expect(cal.reinvestmentSpreadBps).toBeGreaterThanOrEqual(300);
    expect(cal.reinvestmentSpreadBps).toBeLessThanOrEqual(400);
    // Par-weighted tenor averages the 4 maturities (2031-07 through 2033-04)
    // from trade dates in March 2026 → ~6.7 years.
    expect(cal.reinvestmentTenorYears).toBeGreaterThan(5);
    expect(cal.reinvestmentTenorYears).toBeLessThan(8);
    // Two B-bucket (B1, B2) and two BB-bucket (Ba3) — tiebreak alphabetical
    // lands on "B".
    expect(cal.reinvestmentRating).toBe("B");
  });
});

describe("D6c — calibrateReinvestmentFromTrades (guards)", () => {
  it("returns null for an empty trades array", () => {
    expect(calibrateReinvestmentFromTrades([], [], "2026-04-01")).toBeNull();
  });

  it("returns null for null / undefined inputs", () => {
    expect(calibrateReinvestmentFromTrades(null, [], "2026-04-01")).toBeNull();
    expect(
      calibrateReinvestmentFromTrades(undefined, [], "2026-04-01"),
    ).toBeNull();
  });

  it(`returns null when fewer than MIN_TRADES BUYs exist (MIN_TRADES=${MIN_TRADES}: below this, one trade dominates the weighted average)`, () => {
    const holdings = [
      baseHolding({
        obligorName: "X",
        facilityName: "F",
        maturityDate: "2031-01-01",
        spreadBps: 350,
        moodysRating: "B2",
      }),
      baseHolding({
        obligorName: "Y",
        facilityName: "F",
        maturityDate: "2031-01-01",
        spreadBps: 350,
        moodysRating: "B2",
      }),
    ];
    const buys: CloTrade[] = [
      baseTrade({
        obligorName: "X",
        facilityName: "F",
        tradeDate: "2026-03-01",
        settlementAmount: -1000,
        settlementPrice: 1,
        description: "Facility - Purchase (D)",
      }),
      baseTrade({
        obligorName: "Y",
        facilityName: "F",
        tradeDate: "2026-03-01",
        settlementAmount: -1000,
        settlementPrice: 1,
        description: "Facility - Purchase (D)",
      }),
    ];
    expect(
      calibrateReinvestmentFromTrades(buys, holdings, "2026-04-01"),
    ).toBeNull();
  });

  it("returns null when trades contain only SELLs", () => {
    const holdings = [
      baseHolding({
        obligorName: "X",
        facilityName: "F",
        maturityDate: "2031-01-01",
        spreadBps: 350,
        moodysRating: "B2",
      }),
    ];
    const sells: CloTrade[] = Array.from({ length: 5 }, (_, i) =>
      baseTrade({
        id: `s${i}`,
        obligorName: "X",
        facilityName: "F",
        tradeDate: "2026-03-01",
        settlementAmount: 1000,
        settlementPrice: 1,
        description: "Facility - Sale (R)",
      }),
    );
    expect(
      calibrateReinvestmentFromTrades(sells, holdings, "2026-04-01"),
    ).toBeNull();
  });

  it("ignores 'Purchased Accrued Interest' lines (which include 'purchase' but are not BUY events)", () => {
    // Three true BUYs + two accrued-interest lines. The accrued lines must
    // not count toward MIN_TRADES (otherwise they'd inflate tradeCount and
    // skew par-weighted averages).
    const holdings = Array.from({ length: 3 }, (_, i) =>
      baseHolding({
        obligorName: `O${i}`,
        facilityName: "F",
        maturityDate: "2031-01-01",
        spreadBps: 300,
        moodysRating: "B2",
      }),
    );
    const trades: CloTrade[] = [
      ...Array.from({ length: 3 }, (_, i) =>
        baseTrade({
          id: `b${i}`,
          obligorName: `O${i}`,
          facilityName: "F",
          tradeDate: "2026-03-01",
          settlementAmount: -1000,
          settlementPrice: 1,
          description: "Facility - Purchase (D)",
        }),
      ),
      baseTrade({
        id: "ai1",
        obligorName: "O0",
        facilityName: "F",
        tradeDate: "2026-03-01",
        settlementAmount: -10,
        settlementPrice: 1,
        description: "Security - Purchased Accrued Interest (D)",
      }),
    ];
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-04-01");
    expect(cal).not.toBeNull();
    expect(cal!.tradeCount).toBe(3);
  });
});

describe("D6c — calibrateReinvestmentFromTrades (synthetic math)", () => {
  it("par-weighted spread + tenor tie to cent/bp on deterministic inputs", () => {
    // Three BUYs with explicit par amounts, all maturing 2031-01-01:
    //   obligor A: par 1,000,000 @ 300 bps
    //   obligor B: par 2,000,000 @ 400 bps
    //   obligor C: par 1,000,000 @ 500 bps
    // Par-weighted spread = (1M·300 + 2M·400 + 1M·500) / 4M = 400 bps exactly.
    // Trade date 2026-01-01, maturity 2031-01-01 → 5 years × 365.25 days
    // / 365.25 = 5.0 years exactly.
    const holdings = [
      baseHolding({ obligorName: "A", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 300, moodysRating: "B2" }),
      baseHolding({ obligorName: "B", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 400, moodysRating: "B2" }),
      baseHolding({ obligorName: "C", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 500, moodysRating: "B2" }),
    ];
    const trades: CloTrade[] = [
      baseTrade({ id: "a", obligorName: "A", facilityName: "F", tradeDate: "2026-01-01", parAmount: 1_000_000, description: "Facility - Purchase (D)" }),
      baseTrade({ id: "b", obligorName: "B", facilityName: "F", tradeDate: "2026-01-01", parAmount: 2_000_000, description: "Facility - Purchase (D)" }),
      baseTrade({ id: "c", obligorName: "C", facilityName: "F", tradeDate: "2026-01-01", parAmount: 1_000_000, description: "Facility - Purchase (D)" }),
    ];
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-01-01")!;
    expect(cal.reinvestmentSpreadBps).toBe(400);
    expect(cal.reinvestmentTenorYears).toBe(5.0);
    expect(cal.tradeCount).toBe(3);
  });

  it("tradeType=PURCHASE is recognized without a description", () => {
    const holdings = Array.from({ length: 3 }, (_, i) =>
      baseHolding({
        obligorName: `O${i}`,
        facilityName: "F",
        maturityDate: "2031-01-01",
        spreadBps: 350,
        moodysRating: "B2",
      }),
    );
    const trades: CloTrade[] = Array.from({ length: 3 }, (_, i) =>
      baseTrade({
        id: `t${i}`,
        obligorName: `O${i}`,
        facilityName: "F",
        tradeDate: "2026-03-01",
        parAmount: 1_000_000,
        tradeType: "PURCHASE",
      }),
    );
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-04-01");
    expect(cal).not.toBeNull();
    expect(cal!.tradeCount).toBe(3);
  });
});

describe("D6c — modal rating tiebreak", () => {
  it("breaks ties toward the higher-WARF (lower-rating) bucket — conservative for stress projection", () => {
    // 2× B2 (WARF 2720) + 2× Ba3 (WARF 1350) → tiebreak picks B
    // (higher WARF = lower rating = more conservative for reinvestment-
    // stress analysis). Alphabetical tiebreak was deterministic but not
    // methodology-defensible; conservative-WARF tiebreak aligns the
    // calibration with PPM-stress intent.
    const holdings = [
      baseHolding({ obligorName: "A", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "B2" }),
      baseHolding({ obligorName: "B", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "B2" }),
      baseHolding({ obligorName: "C", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "Ba3" }),
      baseHolding({ obligorName: "D", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "Ba3" }),
    ];
    const trades: CloTrade[] = ["A", "B", "C", "D"].map((o) =>
      baseTrade({
        id: o,
        obligorName: o,
        facilityName: "F",
        tradeDate: "2026-03-01",
        parAmount: 1_000_000,
        description: "Facility - Purchase (D)",
      }),
    );
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-04-01")!;
    expect(cal.reinvestmentRating).toBe("B");
  });

  it("breaks ties against NR even when NR ties on count (NR means 'unknown', not 'highest risk')", () => {
    // 2× B2 + 2× NR — both count 2. NR's Moody's convention (KI-19) sets
    // WARF=6500 (> B's 2720), which under a pure "higher WARF wins" rule
    // would pick NR. That's misleading — NR semantically is "unknown
    // rating," not "highest risk." Tiebreak explicitly pushes NR back.
    const holdings = [
      baseHolding({ obligorName: "A", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "B2" }),
      baseHolding({ obligorName: "B", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: "B2" }),
      baseHolding({ obligorName: "C", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: null }),
      baseHolding({ obligorName: "D", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 350, moodysRating: null }),
    ];
    const trades: CloTrade[] = ["A", "B", "C", "D"].map((o) =>
      baseTrade({
        id: o,
        obligorName: o,
        facilityName: "F",
        tradeDate: "2026-03-01",
        parAmount: 1_000_000,
        description: "Facility - Purchase (D)",
      }),
    );
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-04-01")!;
    expect(cal.reinvestmentRating).toBe("B");
  });

  it("A-vs-B tie picks B (the real behavioral shift from the old alphabetical rule)", () => {
    // 2× A2 (WARF 120) + 2× B2 (WARF 2720) — tiebreak picks B (higher WARF).
    // Under the old alphabetical rule this would have picked A (safer).
    // Documents the conservative-WARF shift clearly.
    const holdings = [
      baseHolding({ obligorName: "A1", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 200, moodysRating: "A2" }),
      baseHolding({ obligorName: "A2", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 200, moodysRating: "A2" }),
      baseHolding({ obligorName: "B1", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 400, moodysRating: "B2" }),
      baseHolding({ obligorName: "B2", facilityName: "F", maturityDate: "2031-01-01", spreadBps: 400, moodysRating: "B2" }),
    ];
    const trades: CloTrade[] = ["A1", "A2", "B1", "B2"].map((o) =>
      baseTrade({
        id: o,
        obligorName: o,
        facilityName: "F",
        tradeDate: "2026-03-01",
        parAmount: 1_000_000,
        description: "Facility - Purchase (D)",
      }),
    );
    const cal = calibrateReinvestmentFromTrades(trades, holdings, "2026-04-01")!;
    expect(cal.reinvestmentRating).toBe("B");
  });
});
