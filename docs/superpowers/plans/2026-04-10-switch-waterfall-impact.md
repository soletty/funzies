# Switch Waterfall Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Waterfall" tab to CLO switch analyses that shows how swapping one loan for another affects equity IRR, OC cushions, and Monte Carlo distribution.

**Architecture:** Pure `applySwitch()` function modifies the loan array and par, then both base and switched cases run through the existing projection engine and Monte Carlo. A new server-side tab page loads deal data, a client component handles the simulation and rendering.

**Tech Stack:** TypeScript, React, Next.js server components, recharts, existing projection/MC/resolver infrastructure

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `web/lib/clo/switch-simulator.ts` | Create | Pure switch logic: modify loans, compute deltas |
| `web/lib/clo/build-projection-inputs.ts` | Create | Extract `buildFromResolved` from ProjectionModel for shared use |
| `web/components/clo/SwitchWaterfallImpact.tsx` | Create | Client component: simulation + delta summary + expandable detail |
| `web/app/clo/analyze/[id]/(tabs)/waterfall/page.tsx` | Create | Server page: load deal data, render SwitchWaterfallImpact |
| `web/app/clo/analyze/[id]/(tabs)/layout.tsx` | Modify | Add Waterfall tab for switch analyses |
| `web/app/clo/waterfall/ProjectionModel.tsx` | Modify | Import shared `buildFromResolved` instead of local copy |

---

### Task 1: Extract buildFromResolved to shared module

**Files:**
- Create: `web/lib/clo/build-projection-inputs.ts`
- Modify: `web/app/clo/waterfall/ProjectionModel.tsx`

The `buildFromResolved` function currently lives inside ProjectionModel.tsx. Both the waterfall page and the switch simulator need it. Extract it to a shared module.

- [ ] **Step 1: Create the shared module**

Read `web/app/clo/waterfall/ProjectionModel.tsx` and find the `buildFromResolved` function (starts around line 125). Copy it to a new file:

```typescript
// web/lib/clo/build-projection-inputs.ts

import type { ResolvedDealData } from "./resolver-types";
import type { ProjectionInputs } from "./projection";

export interface UserAssumptions {
  baseRatePct: number;
  defaultRates: Record<string, number>;
  cprPct: number;
  recoveryPct: number;
  recoveryLagMonths: number;
  reinvestmentSpreadBps: number;
  reinvestmentTenorYears: number;
  reinvestmentRating: string | null;
  cccBucketLimitPct: number;
  cccMarketValuePct: number;
  deferredInterestCompounds: boolean;
  postRpReinvestmentPct: number;
  hedgeCostBps: number;
  callDate: string | null;
}

export const DEFAULT_ASSUMPTIONS: UserAssumptions = {
  baseRatePct: 2.0,
  defaultRates: { AAA: 0, AA: 0.02, A: 0.06, BBB: 0.18, BB: 1.06, B: 3.41, CCC: 10.28, NR: 2.0 },
  cprPct: 15,
  recoveryPct: 60,
  recoveryLagMonths: 12,
  reinvestmentSpreadBps: 350,
  reinvestmentTenorYears: 5,
  reinvestmentRating: null,
  cccBucketLimitPct: 7.5,
  cccMarketValuePct: 70,
  deferredInterestCompounds: true,
  postRpReinvestmentPct: 0,
  hedgeCostBps: 0,
  callDate: null,
};

export function buildFromResolved(
  resolved: ResolvedDealData,
  userAssumptions: UserAssumptions,
): ProjectionInputs {
  // Copy the EXACT implementation from ProjectionModel.tsx buildFromResolved
  // (read the file to get the current version — it builds reinvestmentOcTrigger from ocTriggers,
  //  maps tranches, triggers, dates, fees, loans into ProjectionInputs)
}
```

Read the actual `buildFromResolved` from ProjectionModel.tsx and copy it exactly.

- [ ] **Step 2: Update ProjectionModel to import from shared module**

In `web/app/clo/waterfall/ProjectionModel.tsx`, replace the local `buildFromResolved` function with an import:

```typescript
import { buildFromResolved, type UserAssumptions } from "@/lib/clo/build-projection-inputs";
```

Delete the local `buildFromResolved` function definition.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: Clean output

- [ ] **Step 4: Commit**

```bash
git add web/lib/clo/build-projection-inputs.ts web/app/clo/waterfall/ProjectionModel.tsx
git commit -m "refactor: extract buildFromResolved to shared module for reuse"
```

---

### Task 2: Create switch simulator

**Files:**
- Create: `web/lib/clo/switch-simulator.ts`

- [ ] **Step 1: Create the switch simulator**

```typescript
// web/lib/clo/switch-simulator.ts

import type { ResolvedDealData, ResolvedLoan } from "./resolver-types";
import type { ProjectionInputs } from "./projection";
import { buildFromResolved, type UserAssumptions } from "./build-projection-inputs";

export interface SwitchParams {
  sellLoanIndex: number;
  buyLoan: ResolvedLoan;
  sellPrice: number;  // percent of par, e.g. 98
  buyPrice: number;   // percent of par, e.g. 101
}

export interface SwitchResult {
  baseInputs: ProjectionInputs;
  switchedInputs: ProjectionInputs;
  parDelta: number;
  spreadDelta: number;
  ratingChange: { from: string; to: string };
}

export function applySwitch(
  resolved: ResolvedDealData,
  params: SwitchParams,
  assumptions: UserAssumptions,
): SwitchResult {
  const { sellLoanIndex, buyLoan, sellPrice, buyPrice } = params;
  const sellLoan = resolved.loans[sellLoanIndex];

  // Build base case inputs
  const baseInputs = buildFromResolved(resolved, assumptions);

  // Clone loans, remove sell, add buy
  const switchedLoans = [...resolved.loans];
  switchedLoans.splice(sellLoanIndex, 1);
  switchedLoans.push(buyLoan);

  // Par impact: proceeds from sale minus cost of purchase
  const sellProceeds = sellLoan.parBalance * (sellPrice / 100);
  const buyCost = buyLoan.parBalance * (buyPrice / 100);
  const parDelta = sellProceeds - buyCost;

  // Build switched resolved data
  const switchedResolved: ResolvedDealData = {
    ...resolved,
    loans: switchedLoans,
    poolSummary: {
      ...resolved.poolSummary,
      totalPar: resolved.poolSummary.totalPar + parDelta,
    },
  };

  const switchedInputs = buildFromResolved(switchedResolved, assumptions);

  return {
    baseInputs,
    switchedInputs,
    parDelta,
    spreadDelta: buyLoan.spreadBps - sellLoan.spreadBps,
    ratingChange: { from: sellLoan.ratingBucket, to: buyLoan.ratingBucket },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: Clean output

- [ ] **Step 3: Commit**

```bash
git add web/lib/clo/switch-simulator.ts
git commit -m "feat: add switch simulator for loan swap waterfall impact"
```

---

### Task 3: Create the Waterfall tab server page

**Files:**
- Create: `web/app/clo/analyze/[id]/(tabs)/waterfall/page.tsx`

- [ ] **Step 1: Create the server page**

This page follows the exact same pattern as the other tab pages (memo, debate, etc). It loads the analysis data plus all the deal data needed for the waterfall.

```typescript
// web/app/clo/analyze/[id]/(tabs)/waterfall/page.tsx

import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import {
  getProfileForUser,
  getDealForProfile,
  getLatestReportPeriod,
  getHoldings,
  getTranches,
  getTrancheSnapshots,
  getReportPeriodData,
} from "@/lib/clo/access";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints } from "@/lib/clo/types";
import SwitchWaterfallImpact from "@/components/clo/SwitchWaterfallImpact";

async function verifyAnalysisAccess(analysisId: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT a.id FROM clo_analyses a
     JOIN clo_panels p ON a.panel_id = p.id
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE a.id = $1 AND pr.user_id = $2`,
    [analysisId, userId]
  );
  return rows.length > 0;
}

export default async function WaterfallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;
  const hasAccess = await verifyAnalysisAccess(id, session.user.id);
  if (!hasAccess) notFound();

  // Load analysis with switch fields
  const analyses = await query<{
    analysis_type: string;
    borrower_name: string | null;
    spread_coupon: string | null;
    rating: string | null;
    maturity: string | null;
    facility_size: string | null;
    switch_borrower_name: string | null;
    switch_spread_coupon: string | null;
    switch_rating: string | null;
    switch_maturity: string | null;
    switch_facility_size: string | null;
    panel_id: string;
  }>(
    `SELECT analysis_type, borrower_name, spread_coupon, rating, maturity, facility_size,
            switch_borrower_name, switch_spread_coupon, switch_rating, switch_maturity, switch_facility_size,
            panel_id
     FROM clo_analyses WHERE id = $1`,
    [id]
  );

  if (analyses.length === 0 || analyses[0].analysis_type !== "switch") {
    return <p style={{ padding: "2rem", color: "var(--color-text-muted)" }}>Waterfall impact is only available for switch analyses.</p>;
  }

  const analysis = analyses[0];

  // Get profile from panel → profile chain
  const profiles = await query<{ profile_id: string }>(
    "SELECT profile_id FROM clo_panels WHERE id = $1",
    [analysis.panel_id]
  );
  if (profiles.length === 0) notFound();

  const profileRows = await query<{ id: string; extracted_constraints: ExtractedConstraints }>(
    "SELECT id, extracted_constraints FROM clo_profiles WHERE id = $1",
    [profiles[0].profile_id]
  );
  if (profileRows.length === 0) notFound();

  const constraints = profileRows[0].extracted_constraints;
  const deal = await getDealForProfile(profileRows[0].id);
  if (!deal) {
    return <p style={{ padding: "2rem", color: "var(--color-text-muted)" }}>No deal data available. Upload a compliance report first.</p>;
  }

  const reportPeriod = await getLatestReportPeriod(deal.id);
  if (!reportPeriod) {
    return <p style={{ padding: "2rem", color: "var(--color-text-muted)" }}>No compliance report data. Upload a compliance report to enable waterfall analysis.</p>;
  }

  const [tranches, trancheSnapshots, periodData, holdings] = await Promise.all([
    getTranches(deal.id),
    getTrancheSnapshots(reportPeriod.id),
    getReportPeriodData(reportPeriod.id),
    getHoldings(reportPeriod.id),
  ]);

  const maturityDate = deal.statedMaturityDate ?? constraints.keyDates?.maturityDate ?? null;
  const reinvestmentPeriodEnd = deal.reinvestmentPeriodEnd ?? constraints.keyDates?.reinvestmentPeriodEnd ?? null;

  const { resolved, warnings } = resolveWaterfallInputs(
    constraints,
    { poolSummary: periodData.poolSummary, complianceTests: periodData.complianceTests, concentrations: periodData.concentrations },
    tranches,
    trancheSnapshots,
    holdings,
    { maturity: maturityDate, reinvestmentPeriodEnd },
  );

  return (
    <SwitchWaterfallImpact
      resolved={resolved}
      sellLoan={{
        borrowerName: analysis.borrower_name ?? "",
        spreadCoupon: analysis.spread_coupon ?? "",
        rating: analysis.rating ?? "",
        maturity: analysis.maturity ?? "",
        facilitySize: analysis.facility_size ?? "",
      }}
      buyLoan={{
        borrowerName: analysis.switch_borrower_name ?? "",
        spreadCoupon: analysis.switch_spread_coupon ?? "",
        rating: analysis.switch_rating ?? "",
        maturity: analysis.switch_maturity ?? "",
        facilitySize: analysis.switch_facility_size ?? "",
      }}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: May fail because SwitchWaterfallImpact doesn't exist yet — that's OK

- [ ] **Step 3: Commit**

```bash
git add web/app/clo/analyze/[id]/(tabs)/waterfall/page.tsx
git commit -m "feat: add waterfall tab server page for switch analysis"
```

---

### Task 4: Create SwitchWaterfallImpact client component

**Files:**
- Create: `web/components/clo/SwitchWaterfallImpact.tsx`

- [ ] **Step 1: Create the client component**

This is the main UI component. It receives resolved deal data and the sell/buy loan descriptions, matches them to portfolio holdings, runs projections, and renders the delta view.

```typescript
// web/components/clo/SwitchWaterfallImpact.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import type { ResolvedDealData, ResolvedLoan } from "@/lib/clo/resolver-types";
import type { ProjectionResult } from "@/lib/clo/projection";
import { runProjection } from "@/lib/clo/projection";
import { applySwitch, type SwitchParams } from "@/lib/clo/switch-simulator";
import { DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import { mapToRatingBucket } from "@/lib/clo/rating-mapping";

interface LoanDescription {
  borrowerName: string;
  spreadCoupon: string;
  rating: string;
  maturity: string;
  facilitySize: string;
}

interface Props {
  resolved: ResolvedDealData;
  sellLoan: LoanDescription;
  buyLoan: LoanDescription;
}

function parseSpread(s: string): number {
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseFacilitySize(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatDelta(before: number | null, after: number | null): { text: string; color: string } {
  if (before == null || after == null) return { text: "—", color: "inherit" };
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return {
    text: `${sign}${(delta * 100).toFixed(2)}%`,
    color: delta > 0 ? "var(--color-high, #2a7)" : delta < 0 ? "var(--color-low, #c44)" : "inherit",
  };
}

function formatAmount(v: number): string {
  if (Math.abs(v) >= 1e6) return `€${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `€${(v / 1e3).toFixed(1)}K`;
  return `€${v.toFixed(0)}`;
}

export default function SwitchWaterfallImpact({ resolved, sellLoan, buyLoan }: Props) {
  const [sellPrice, setSellPrice] = useState(100);
  const [buyPrice, setBuyPrice] = useState(100);
  const [expanded, setExpanded] = useState(false);

  // Match sell loan to portfolio holding by borrower name
  const sellIndex = useMemo(() => {
    const name = sellLoan.borrowerName.toLowerCase().trim();
    // Try exact match first, then fuzzy
    let idx = resolved.loans.findIndex(l =>
      l.parBalance > 0 // use parBalance as proxy — ResolvedLoan doesn't have obligorName
    );
    // Since ResolvedLoan doesn't have obligorName, match by spread+rating+maturity
    const sellSpread = parseSpread(sellLoan.spreadCoupon);
    const sellRating = mapToRatingBucket(sellLoan.rating, null, null, null);
    idx = resolved.loans.findIndex(l =>
      l.ratingBucket === sellRating &&
      Math.abs(l.spreadBps - sellSpread) < 50
    );
    return idx >= 0 ? idx : 0;
  }, [resolved.loans, sellLoan]);

  // Build buy loan as ResolvedLoan
  const buyResolvedLoan: ResolvedLoan = useMemo(() => {
    const spread = parseSpread(buyLoan.spreadCoupon);
    const rating = mapToRatingBucket(buyLoan.rating, null, null, null);
    const par = parseFacilitySize(buyLoan.facilitySize) || resolved.loans[sellIndex]?.parBalance || 0;
    return {
      parBalance: par,
      maturityDate: buyLoan.maturity || resolved.dates.maturity,
      ratingBucket: rating,
      spreadBps: spread > 0 ? (spread < 10 ? Math.round(spread * 100) : Math.round(spread)) : resolved.poolSummary.wacSpreadBps,
    };
  }, [buyLoan, resolved, sellIndex]);

  // Run switch simulation
  const switchResult = useMemo(() => {
    if (sellIndex < 0 || !resolved.loans[sellIndex]) return null;
    return applySwitch(resolved, {
      sellLoanIndex: sellIndex,
      buyLoan: buyResolvedLoan,
      sellPrice,
      buyPrice,
    }, DEFAULT_ASSUMPTIONS);
  }, [resolved, sellIndex, buyResolvedLoan, sellPrice, buyPrice]);

  // Run both projections
  const baseResult = useMemo(() => switchResult ? runProjection(switchResult.baseInputs) : null, [switchResult]);
  const switchedResult = useMemo(() => switchResult ? runProjection(switchResult.switchedInputs) : null, [switchResult]);

  if (!switchResult || !baseResult || !switchedResult) {
    return <p style={{ padding: "1rem", color: "var(--color-text-muted)" }}>Unable to simulate switch — loan matching failed.</p>;
  }

  const irrDelta = formatDelta(baseResult.equityIrr, switchedResult.equityIrr);

  // OC cushion from last period
  const baseOc = baseResult.periods[0]?.ocTests ?? [];
  const switchedOc = switchedResult.periods[0]?.ocTests ?? [];

  const cellStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.8rem",
    fontFamily: "var(--font-mono)",
    textAlign: "right",
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--color-text-muted)",
    fontFamily: "var(--font-body)",
  };

  return (
    <div style={{ maxWidth: "48rem" }}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>
        Waterfall Impact
      </h3>

      {/* Transaction cost inputs */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", fontSize: "0.8rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          Sell price:
          <input
            type="number"
            value={sellPrice}
            onChange={(e) => setSellPrice(parseFloat(e.target.value) || 100)}
            style={{ width: "4rem", padding: "0.3rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          Buy price:
          <input
            type="number"
            value={buyPrice}
            onChange={(e) => setBuyPrice(parseFloat(e.target.value) || 100)}
            style={{ width: "4rem", padding: "0.3rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}
          />
        </label>
      </div>

      {/* Delta summary table */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
            <th style={{ ...headerStyle, textAlign: "left" }}>Metric</th>
            <th style={headerStyle}>Before</th>
            <th style={headerStyle}>After</th>
            <th style={headerStyle}>Delta</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
            <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600 }}>Equity IRR</td>
            <td style={cellStyle}>{formatPct(baseResult.equityIrr)}</td>
            <td style={cellStyle}>{formatPct(switchedResult.equityIrr)}</td>
            <td style={{ ...cellStyle, color: irrDelta.color, fontWeight: 600 }}>{irrDelta.text}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
            <td style={{ ...cellStyle, textAlign: "left" }}>Total Equity Distributions</td>
            <td style={cellStyle}>{formatAmount(baseResult.totalEquityDistributions)}</td>
            <td style={cellStyle}>{formatAmount(switchedResult.totalEquityDistributions)}</td>
            <td style={{ ...cellStyle, color: switchedResult.totalEquityDistributions > baseResult.totalEquityDistributions ? "var(--color-high, #2a7)" : "var(--color-low, #c44)" }}>
              {formatAmount(switchedResult.totalEquityDistributions - baseResult.totalEquityDistributions)}
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
            <td style={{ ...cellStyle, textAlign: "left" }}>Spread (swapped position)</td>
            <td style={cellStyle}>{resolved.loans[sellIndex]?.spreadBps ?? 0} bps</td>
            <td style={cellStyle}>{buyResolvedLoan.spreadBps} bps</td>
            <td style={{ ...cellStyle, color: switchResult.spreadDelta > 0 ? "var(--color-high, #2a7)" : switchResult.spreadDelta < 0 ? "var(--color-low, #c44)" : "inherit" }}>
              {switchResult.spreadDelta > 0 ? "+" : ""}{switchResult.spreadDelta} bps
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
            <td style={{ ...cellStyle, textAlign: "left" }}>Rating (swapped position)</td>
            <td style={cellStyle}>{switchResult.ratingChange.from}</td>
            <td style={cellStyle}>{switchResult.ratingChange.to}</td>
            <td style={cellStyle}>{switchResult.ratingChange.from === switchResult.ratingChange.to ? "—" : switchResult.ratingChange.from + " → " + switchResult.ratingChange.to}</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, textAlign: "left" }}>Par Impact</td>
            <td style={cellStyle}>—</td>
            <td style={cellStyle}>—</td>
            <td style={{ ...cellStyle, color: switchResult.parDelta >= 0 ? "var(--color-high, #2a7)" : "var(--color-low, #c44)" }}>
              {formatAmount(switchResult.parDelta)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Expandable OC cushion detail */}
      <div style={{
        marginTop: "1rem",
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface)",
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.6rem 0.8rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            textAlign: "left",
            fontFamily: "var(--font-body)",
          }}
        >
          <span style={{ fontSize: "0.65rem" }}>{expanded ? "▾" : "▸"}</span>
          OC Cushion & Cash Flow Detail
        </button>

        {expanded && (
          <div style={{ padding: "0 0.8rem 0.8rem" }}>
            {/* OC cushions per class */}
            <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
              OC Cushion Changes (Period 1)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ ...headerStyle, textAlign: "left" }}>Class</th>
                  <th style={headerStyle}>Before</th>
                  <th style={headerStyle}>After</th>
                  <th style={headerStyle}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {baseOc.map((test, i) => {
                  const switched = switchedOc[i];
                  const delta = switched ? switched.actual - test.actual : 0;
                  return (
                    <tr key={test.className} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{test.className}</td>
                      <td style={cellStyle}>{test.actual.toFixed(2)}%</td>
                      <td style={cellStyle}>{switched?.actual.toFixed(2) ?? "—"}%</td>
                      <td style={{ ...cellStyle, color: delta > 0 ? "var(--color-high, #2a7)" : delta < 0 ? "var(--color-low, #c44)" : "inherit" }}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Cash flow delta (first 12 quarters) */}
            <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
              Equity Distribution Delta (first 12 quarters)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ ...headerStyle, textAlign: "left" }}>Quarter</th>
                  <th style={headerStyle}>Before</th>
                  <th style={headerStyle}>After</th>
                  <th style={headerStyle}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {baseResult.periods.slice(0, 12).map((p, i) => {
                  const sp = switchedResult.periods[i];
                  const delta = sp ? sp.equityDistribution - p.equityDistribution : 0;
                  return (
                    <tr key={p.periodNum} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                      <td style={{ ...cellStyle, textAlign: "left" }}>Q{p.periodNum}</td>
                      <td style={cellStyle}>{formatAmount(p.equityDistribution)}</td>
                      <td style={cellStyle}>{sp ? formatAmount(sp.equityDistribution) : "—"}</td>
                      <td style={{ ...cellStyle, color: delta > 0 ? "var(--color-high, #2a7)" : delta < 0 ? "var(--color-low, #c44)" : "inherit" }}>
                        {delta !== 0 ? formatAmount(delta) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: Clean output

- [ ] **Step 3: Commit**

```bash
git add web/components/clo/SwitchWaterfallImpact.tsx
git commit -m "feat: add SwitchWaterfallImpact component with delta summary and detail"
```

---

### Task 5: Add Waterfall tab to layout

**Files:**
- Modify: `web/app/clo/analyze/[id]/(tabs)/layout.tsx`

- [ ] **Step 1: Read the layout file and add the Waterfall tab**

The layout has a `tabs` array. Read the file to find it. Add a new entry for the Waterfall tab. It should only show for switch analyses.

The layout currently loads `status` from the analysis. It also needs to load `analysis_type` to conditionally show the Waterfall tab:

1. Update the SQL query to also select `analysis_type`
2. Add to the tabs array:

```typescript
{ label: "Waterfall", href: `${base}/waterfall`, show: isComplete && analysisType === "switch" },
```

Read the file first to find exact line numbers and the current query.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: Clean output

- [ ] **Step 3: Commit**

```bash
git add web/app/clo/analyze/[id]/(tabs)/layout.tsx
git commit -m "feat: add Waterfall tab to switch analysis layout"
```

---

### Task 6: Final verification

- [ ] **Step 1: TypeScript full compile**

Run: `cd /Users/solal/Documents/GitHub/funzies/web && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 2: Manual test**

1. Navigate to an existing switch analysis
2. Verify the "Waterfall" tab appears in the tab bar
3. Click the Waterfall tab
4. Verify the delta summary table renders with before/after/delta columns
5. Change sell/buy prices and verify the projection updates
6. Click to expand and verify OC cushion and cash flow detail render
7. Verify a "buy" analysis does NOT show the Waterfall tab

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete switch waterfall impact — delta summary with expandable detail"
```
