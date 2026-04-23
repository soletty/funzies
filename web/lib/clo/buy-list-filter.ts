/**
 * D5 — Buy-list compliance filter (Sprint 4).
 *
 * Pure helpers that filter `BuyListItem[]` against PPM-style compliance
 * thresholds. Shipped so partner can see "which buy-list candidates pass
 * Euro XV's Moody's WARF / Minimum WAS / Caa concentration / cov-lite
 * constraints" without manually cross-referencing.
 *
 * Scope (what this module enforces):
 *   ✅ `maxWarfFactor` — drop items whose moodysRating maps to a WARF factor
 *      above the cap. Unrated items pass (can't evaluate; partner decides).
 *   ✅ `minSpreadBps` — drop items whose spreadBps is below the floor.
 *   ✅ `excludeCaa` — drop items whose moodysRating is Caa1/Caa2/Caa3/Ca/C.
 *   ✅ `excludeCovLite` — drop items with `isCovLite === true`. Null-isCovLite
 *      items pass (unknown; don't over-claim).
 *
 * Out of scope (deferred, tracked as [KI-23](../docs/clo-model-known-issues.md#ki-23)):
 *   ❌ Industry cap — `BuyListItem.sector` is free-text; CLO industry
 *      taxonomy requires normalization (Moody's 35-industry list, S&P
 *      35-industry list, PPM-specific mapping). Not scoped for D5.
 *
 * Pre-fill: `buyListFiltersFromResolved(resolved)` extracts the two
 * numeric caps (WARF + WAS) from `resolved.qualityTests` by test-name match.
 * Binary flags (`excludeCaa` / `excludeCovLite`) are left undefined — the
 * partner sets them via UI based on pool-state and intent, not auto-enabled
 * from trigger existence.
 */

import type { BuyListItem } from "./types";
import type { ResolvedDealData } from "./resolver-types";
import { moodysWarfFactor } from "./rating-mapping";
import { BUCKET_WARF_FALLBACK } from "./pool-metrics";

export interface BuyListFilterParams {
  /** Moody's WARF cap — items above this factor are dropped. Typically the
   *  Moody's Maximum WARF trigger (Euro XV: 3148). Null/undefined disables. */
  maxWarfFactor?: number | null;
  /** Minimum spread in bps — items below are dropped. Typically the
   *  Minimum WAS trigger × 100 (Euro XV: 365 bps from 3.65%). Null disables. */
  minSpreadBps?: number | null;
  /** If true, drop any item whose Moody's rating is Caa1/Caa2/Caa3/Ca/C.
   *  Default false — partner opts in. */
  excludeCaa?: boolean;
  /** If true, drop items with `isCovLite === true`. Items with null
   *  isCovLite pass (unknown; don't over-claim). Default false. */
  excludeCovLite?: boolean;
}

/**
 * Pre-fill precedence policy: **user overrides are authoritative**. When a
 * caller passes `BuyListFilterParams` with a user-set value, the helper
 * uses it verbatim — no clamping to PPM, no warning on divergence. Rationale:
 * scenario analysis is a legitimate use case ("what if I were stricter than
 * the PPM?" / "what if I stressed a deal with 4000 WARF cap?"). The filter
 * is NOT a compliance validator; it's a filter. If the caller wants PPM
 * defaults, it calls `buyListFiltersFromResolved(resolved)` and uses the
 * result as-is; if it wants user values, it passes those. Merging is the
 * caller's responsibility.
 */

export interface FilterResult {
  passed: BuyListItem[];
  /** Items dropped by at least one filter, with the reason strings for each
   *  failing filter. Partner UI can render this as "why was X excluded?" */
  dropped: Array<{ item: BuyListItem; reasons: string[] }>;
}

/** Check whether a Moody's rating is in the Caa/Ca/C band. Case + suffix
 *  tolerant — matches "Caa2", "Caa2 (sf)", "ca", "C". */
function isCaaOrBelow(moodysRating: string | null | undefined): boolean {
  if (!moodysRating) return false;
  const key = moodysRating.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/\*.*$/, "").trim();
  return key.startsWith("caa") || key === "ca" || key === "c";
}

/** Apply filters to a buy-list. Returns both passed + dropped-with-reasons
 *  so partner UI can show "here's what was excluded and why". */
export function filterBuyList(items: BuyListItem[], filters: BuyListFilterParams): FilterResult {
  const passed: BuyListItem[] = [];
  const dropped: FilterResult["dropped"] = [];

  for (const item of items) {
    const reasons: string[] = [];

    if (filters.maxWarfFactor != null) {
      // KI-19 consistency: unrated items get Caa2 fallback (6500) per Moody's
      // CLO methodology — same treatment as the projection engine's WARF
      // computation. Filter would otherwise silently pass unrated candidates
      // that Moody's treats as high-risk, diverging from engine-side math.
      const wf = item.moodysRating != null
        ? moodysWarfFactor(item.moodysRating)
        : BUCKET_WARF_FALLBACK.NR;
      const effectiveWf = wf ?? BUCKET_WARF_FALLBACK.NR;
      if (effectiveWf > filters.maxWarfFactor) {
        const ratingLabel = item.moodysRating ?? "NR (→ Caa2 per Moody's convention, KI-19)";
        reasons.push(`WARF ${effectiveWf} > cap ${filters.maxWarfFactor} (${ratingLabel})`);
      }
    }

    if (filters.minSpreadBps != null && item.spreadBps != null) {
      if (item.spreadBps < filters.minSpreadBps) {
        reasons.push(`spread ${item.spreadBps} bps < floor ${filters.minSpreadBps} bps`);
      }
    }

    if (filters.excludeCaa && isCaaOrBelow(item.moodysRating)) {
      reasons.push(`Caa-or-below rating (${item.moodysRating})`);
    }

    if (filters.excludeCovLite && item.isCovLite === true) {
      reasons.push("cov-lite");
    }

    if (reasons.length === 0) passed.push(item);
    else dropped.push({ item, reasons });
  }

  return { passed, dropped };
}

/** Pre-fill filter thresholds from resolved PPM data. Matches Moody's
 *  Maximum WARF test and Minimum Weighted Average Floating Spread Test by
 *  loose name regex. Null when the resolver didn't extract the test (UI
 *  falls back to user-entered values). Binary flags intentionally NOT
 *  auto-set — partner opts into excludeCaa / excludeCovLite explicitly. */
export function buyListFiltersFromResolved(resolved: ResolvedDealData): BuyListFilterParams {
  const warfTest = resolved.qualityTests.find((t) =>
    /moody.*maximum.*weighted average rating factor/i.test(t.testName),
  );
  const wasTest = resolved.qualityTests.find((t) =>
    /minimum.*weighted average.*(floating )?spread/i.test(t.testName),
  );
  return {
    maxWarfFactor: warfTest?.triggerLevel ?? null,
    // Minimum WAS trigger is reported in % (e.g. 3.65); filter field is bps.
    // Convert via × 100. Null if trigger absent.
    minSpreadBps: wasTest?.triggerLevel != null ? wasTest.triggerLevel * 100 : null,
  };
}
