import type { ExtractedConstraints, CloPoolSummary, CloComplianceTest, CloTranche, CloTrancheSnapshot, CloHolding, CloAccountBalance, CloParValueAdjustment } from "./types";
import type { Citation, ComplianceTestType, ResolvedDealData, ResolvedTranche, ResolvedPool, ResolvedTrigger, ResolvedReinvestmentOcTrigger, ResolvedDates, ResolvedFees, ResolvedLoan, ResolvedComplianceTest, ResolvedEodTest, ResolvedMetadata, ResolutionWarning } from "./resolver-types";
import { parseSpreadToBps, normalizeWacSpread } from "./ingestion-gate";
import { isHigherBetter } from "./test-direction";
import { mapToRatingBucket, moodysWarfFactor } from "./rating-mapping";
import { isRatingSentinel, parseNumeric, parseDecoratedAmount } from "./sdf/csv-utils";
import { CLO_DEFAULTS } from "./defaults";
import { computeTopNObligorsPct } from "./pool-metrics";
import { assignDenseSeniorityRanks, classOrderBucket } from "./seniority-rank";
import { canonicalizeDayCount, type DayCountConvention } from "./day-count-canonicalize";

/** Defensive sentinel stripper for rating strings already in the DB. The SDF
 *  parser now filters these at ingest (see trimRating), but pre-fix rows can
 *  still carry "***", "NR", "--", etc. Treat any sentinel as missing. */
function cleanRating(r: string | null | undefined): string | null {
  if (r == null) return null;
  return isRatingSentinel(r) ? null : r;
}

/** Remove keys with null/undefined values to avoid JSON bloat. */
function stripNulls<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) result[k] = v;
  }
  return result as T;
}

/** E1 (Sprint 5) — convert a raw provenance source (carrying `source_pages`
 *  and/or `source_condition` from ppm.json) into the partner-facing
 *  `Citation` shape. Returns null when neither field carries useful info,
 *  so call sites can render unconditionally without a null check. */
function extractCitation(
  source: { source_pages?: number[] | null; source_condition?: string | null } | null | undefined,
): Citation | null {
  if (!source) return null;
  const pages = source.source_pages ?? null;
  const cond = source.source_condition ?? null;
  if ((pages == null || pages.length === 0) && cond == null) return null;
  return { sourcePages: pages, sourceCondition: cond };
}

function addQuartersForResolver(dateIso: string, quarters: number): string {
  const d = new Date(dateIso);
  const origDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + quarters * 3);
  // Clamp to last day of target month if day rolled forward (e.g. Jan 31 + 3mo → Apr 30)
  if (d.getUTCDate() !== origDay) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Normalize a concentration test / portfolio profile bucket name for name-based joins.
 *  Strips leading "(a)" / "(p)(i)" prefixes, collapses punctuation, lowercases. */
function normalizeConcName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^\s*\([a-z0-9]+\)(?:\([iv]+\))?\s*/i, "") // strip lettered prefix
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normClass(s: string): string {
  const lower = String(s ?? "").toLowerCase().trim();
  if (!lower) return "";
  // Subordinated / equity / income-note variants all collapse to "sub"
  if (lower.includes("subordinated") || lower.startsWith("sub ") || lower === "sub"
      || lower.includes("equity") || lower.includes("income note") || lower.includes("income-note")) {
    return "sub";
  }
  // Strip "class " prefix and trailing "-notes"/"notes" suffix
  const stripped = lower.replace(/^class(es)?\s+/i, "").replace(/[-\s]+notes?$/i, "").trim();
  // Take only the first class-letter token (e.g. "a", "b-1", "b2") —
  // collapses "A" and "A Senior Secured FRN due 2032" to the same key.
  const match = stripped.match(/^([a-z](?:[-\s]?[0-9]+)?)\b/);
  return match ? match[1].replace(/\s+/g, "-") : stripped;
}

/**
 * Per-class deferrable resolution from the interest-mechanics section.
 *
 * `capitalStructure[].deferrable` is unreliable upstream — the LLM cap-structure
 * prompt asks for it, but the cap-structure pages of a PPM rarely state
 * deferrability inline; the authoritative source is the §7 interest-mechanics
 * block. Without this fall-through, every deal whose cap-structure extraction
 * misses `deferrable` resolves Class C/D/E/F (etc.) to `isDeferrable: false`,
 * silently disabling PIK accrual under junior interest shortfall.
 *
 * Two sources, in preference order:
 *   1. `interestMechanics.deferralClasses` — schematized array of class names
 *      that ARE deferrable. Treat as authoritative when non-empty.
 *   2. `interestMechanics.interest_deferral.class_X.deferral_permitted` — raw
 *      passthrough (snake_case base class). Sub-classes (B-1, B-2) inherit
 *      from the base letter (class_b).
 *
 * Returns `undefined` when neither source has info — caller falls through to
 * the existing default (`false`).
 */
function deferrableFromMechanics(
  mechanics: ExtractedConstraints["interestMechanics"],
  className: string,
): boolean | undefined {
  if (!mechanics) return undefined;
  const target = normClass(className);
  if (!target || target === "sub") return undefined; // residuals not in scope

  // Source 1: schematized list. Non-empty list = authoritative.
  const list = mechanics.deferralClasses;
  if (list && list.length > 0) {
    return list.some((c) => normClass(c) === target);
  }

  // Source 2: raw passthrough block keyed by snake_case base letter.
  const block = (mechanics as unknown as { interest_deferral?: Record<string, { deferral_permitted?: boolean | string }> }).interest_deferral;
  if (block) {
    const base = target.match(/^([a-z])/)?.[1];
    if (!base) return undefined;
    const entry = block[`class_${base}`];
    if (entry && typeof entry.deferral_permitted === "boolean") {
      return entry.deferral_permitted;
    }
  }

  return undefined;
}

function parseAmount(s: string | undefined | null): number {
  if (!s) return 0;
  // Range like "100,000,000-200,000,000" or "100,000,000 - 200,000,000": take
  // the first (lower-bound) value. The regex captures locale-permissive groups
  // ([\d,._]+) and the locale-aware parser handles American/European disambiguation.
  const rangeMatch = s.match(/^[^0-9]*?([\d,._]+)\s*[-–—]\s*([\d,._]+)/);
  if (rangeMatch) return parseNumeric(rangeMatch[1]) ?? 0;
  return parseDecoratedAmount(s) ?? 0;
}

/** Classifies a compliance-test row into one of the canonical types the
 *  engine and downstream filters reason about. The four "real" types map
 *  to load-bearing compliance triggers (Moody's WARF cap, Min WAS, Moody's
 *  Caa concentration, Fitch CCC concentration). All other rows — per-class
 *  OC/IC, WAL, diversity, recovery, lettered concentration buckets — fall
 *  through to "other" and are surfaced for UI display only. The regex set
 *  is intentionally tolerant of trustee report wording variations
 *  ("Min" vs "Minimum", "Floating Spread" vs "Spread"). New canonical types
 *  must extend `ComplianceTestType` and add a branch here. */
export function classifyComplianceTest(testName: string | null | undefined): ComplianceTestType {
  const name = (testName ?? "").toLowerCase();
  if (/moody.*maximum.*weighted average rating factor/.test(name)) return "moodys_max_warf";
  if (/min(?:imum)?.*weighted average.*(?:floating )?spread/.test(name)) return "min_was";
  if (/moody.*caa.*obligation/.test(name)) return "moodys_caa_concentration";
  if (/fitch.*ccc.*obligation/.test(name)) return "fitch_ccc_concentration";
  return "other";
}

function isOcTest(t: { testType?: string | null; testName?: string | null }): boolean {
  const tt = (t.testType ?? "").toLowerCase();
  if (tt === "oc_par" || tt === "oc_mv" || tt === "overcollateralization" || tt.startsWith("oc")) return true;
  const name = (t.testName ?? "").toLowerCase();
  return name.includes("overcollateral") || name.includes("par value") || (name.includes("oc") && name.includes("ratio"));
}

function isIcTest(t: { testType?: string | null; testName?: string | null }): boolean {
  if (t.testType === "IC") return true;
  const name = (t.testName ?? "").toLowerCase();
  return name.includes("interest coverage") || (name.includes("ic") && name.includes("ratio"));
}

/**
 * Compute cushion polarity from direction. Returns null when direction is
 * unknown rather than silently defaulting to a (potentially wrong-sign)
 * formula. Used as a fallback when an upstream `cushion_pct` is null —
 * legacy DB rows ingested before per-row direction classification carry
 * null cushions; the lookup below restores the correct sign without
 * requiring a re-ingest. New ingest writes correct cushions in the SDF
 * parser so this fallback is dormant on fresh data.
 */
function directionalCushion(
  testType: string | null | undefined,
  testName: string | null | undefined,
  actual: number | null,
  trigger: number | null,
): number | null {
  if (actual == null || trigger == null) return null;
  const dir = isHigherBetter(testType ?? null, testName ?? null);
  if (dir === true) return actual - trigger;
  if (dir === false) return trigger - actual;
  return null;
}

function dedupTriggers(triggers: { className: string; triggerLevel: number; source: "compliance" | "ppm" }[], warnings: ResolutionWarning[]): { className: string; triggerLevel: number; source: "compliance" | "ppm" }[] {
  const byClass = new Map<string, { className: string; triggerLevel: number; source: "compliance" | "ppm" }>();
  for (const t of triggers) {
    const key = normClass(t.className);
    const existing = byClass.get(key);
    if (!existing) {
      byClass.set(key, t);
    } else if (t.triggerLevel !== existing.triggerLevel) {
      // Keep the higher (more restrictive) trigger but warn about the discrepancy
      warnings.push({
        field: `trigger.${t.className}`,
        message: `Duplicate trigger for ${t.className}: ${existing.triggerLevel}% vs ${t.triggerLevel}% — keeping ${Math.max(existing.triggerLevel, t.triggerLevel)}%`,
        severity: "warn", blocking: false,
      });
      if (t.triggerLevel > existing.triggerLevel) {
        byClass.set(key, t);
      }
    }
  }
  return Array.from(byClass.values());
}

function resolveTranches(
  constraints: ExtractedConstraints,
  dbTranches: CloTranche[],
  snapshots: CloTrancheSnapshot[],
  warnings: ResolutionWarning[],
): ResolvedTranche[] {
  const snapshotByTrancheId = new Map(snapshots.map(s => [s.trancheId, s]));

  // Default amort start: "second Payment Date" = one quarter after firstPaymentDate
  const firstPayment = constraints.keyDates?.firstPaymentDate;
  const defaultAmortStartDate = firstPayment ? addQuartersForResolver(firstPayment, 1) : null;

  // Build PPM per-tranche lookups
  const ppmSpreadByClass = new Map<string, number>();
  const ppmBalanceByClass = new Map<string, number>();
  const ppmDeferrableByClass = new Map<string, boolean>();
  const ppmSubByClass = new Map<string, boolean>();
  const ppmAmortByClass = new Map<string, number>();
  const ppmAmortStartByClass = new Map<string, string>();

  for (const e of constraints.capitalStructure ?? []) {
    if (!e.class) continue; // skip malformed entries lacking a class identifier
    const key = normClass(e.class);
    const bps = parseSpreadToBps(e.spreadBps, e.spread);
    if (bps != null && bps > 0) ppmSpreadByClass.set(key, bps);
    ppmBalanceByClass.set(key, parseAmount(e.principalAmount));
    if (e.deferrable != null) ppmDeferrableByClass.set(key, e.deferrable);
    ppmSubByClass.set(key, e.isSubordinated ?? e.class.toLowerCase().includes("sub"));
    if (e.amortisationPerPeriod) {
      const amt = parseAmount(e.amortisationPerPeriod);
      if (amt > 0) ppmAmortByClass.set(key, amt);
    }
    if (e.amortStartDate) ppmAmortStartByClass.set(key, e.amortStartDate);
  }

  // If DB tranches exist, use them as the primary source
  if (dbTranches.length > 0) {
    return [...dbTranches]
      .sort((a, b) => (a.seniorityRank ?? 99) - (b.seniorityRank ?? 99))
      .map(t => {
        const snap = snapshotByTrancheId.get(t.id);
        const key = normClass(t.className);
        const isSub = t.isIncomeNote ?? t.isSubordinate ?? ppmSubByClass.get(key) ?? t.className.toLowerCase().includes("sub");
        const ppmAmort = ppmAmortByClass.get(key) ?? null;
        // Prefer compliance report's actual principal paid over PPM's contractual schedule.
        // If snapshot reports 0, keep PPM schedule (one zero-payment period doesn't cancel the schedule).
        const snapshotAmort = snap?.principalPaid != null && snap.principalPaid > 0 ? snap.principalPaid : null;
        const amortPerPeriod = snapshotAmort ?? ppmAmort;
        const hasAmort = amortPerPeriod != null;
        if (snapshotAmort != null && ppmAmort != null && snapshotAmort !== ppmAmort) {
          warnings.push({
            field: `${t.className}.amortisationPerPeriod`,
            message: `Compliance report principal paid (${snapshotAmort.toLocaleString()}) differs from PPM schedule (${ppmAmort.toLocaleString()}) — using compliance report`,
            severity: "info", blocking: false,
            resolvedFrom: "snapshot",
          });
        }

        let spreadBps = t.spreadBps ?? ppmSpreadByClass.get(key) ?? 0;
        // Defense-in-depth: if spread looks like a percentage (< 20) after DB read, convert.
        // This should not fire if ingestion is correct — if it does, log a warning.
        if (spreadBps > 0 && spreadBps < 20 && !isSub) {
          warnings.push({ field: `${t.className}.spreadBps`, message: `Spread ${spreadBps} looks like percentage (not bps) — converting to ${Math.round(spreadBps * 100)} bps. Check ingestion.`, severity: "warn", blocking: false });
          spreadBps = Math.round(spreadBps * 100);
        }
        if (spreadBps === 0 && !isSub) {
          warnings.push({
            field: `${t.className}.spreadBps`,
            message: `No spread found for ${t.className} in DB or PPM constraints`,
            severity: "error",
            blocking: true,
          });
        }
        if (t.spreadBps == null && ppmSpreadByClass.has(key)) {
          warnings.push({
            field: `${t.className}.spreadBps`,
            message: `Using PPM spread (${ppmSpreadByClass.get(key)} bps) — DB tranche has null`,
            severity: "info", blocking: false,
            resolvedFrom: "ppm_constraints",
          });
        }

        // Per-tranche accrual convention. Two-axis decision:
        //   1. carveOut = isSub || hasAmort. Income notes don't accrue a
        //      coupon; amortising tranches (Class X) ride the engine's
        //      `isFloating ? actual_360 : 30_360` fallback. Both cases
        //      bypass the blocking-on-null rule below.
        //   2. The canonicalizer is invoked iff `t.dayCountConvention`
        //      is non-null OR carveOut is false. When carveOut is true
        //      AND the source is null, the resolved field is left
        //      undefined so the engine fallback fires (preserves pre-fix
        //      accrual on null-DCC Class X / Sub). When the source is
        //      non-null, canonicalization runs regardless of carveOut so
        //      an explicit DCC on a Sub note (Euro XV's "Actual/360") is
        //      preserved as `actual_360` rather than dropped.
        // Outside the carve-out: explicit DCC canonicalizes; null DCC
        // blocks for fixed-rate (no market default) and falls back to
        // Actual/360 with severity:"warn" for floating (Euro default).
        const isFloating = t.isFloating ?? true;
        const carveOut = isSub || hasAmort;
        let trancheDayCountConvention: DayCountConvention | undefined;
        if (carveOut && t.dayCountConvention == null) {
          trancheDayCountConvention = undefined;
        } else {
          const dccResult = canonicalizeDayCount(t.dayCountConvention, {
            isFixedRate: !isFloating && !carveOut,
            field: `${t.className}.dayCountConvention`,
          });
          if (dccResult.warning) {
            warnings.push(
              dccResult.blocking
                ? { field: "dayCountConvention", message: dccResult.warning, severity: "error", blocking: true }
                : { field: "dayCountConvention", message: dccResult.warning, severity: "warn", blocking: false },
            );
          }
          trancheDayCountConvention = dccResult.convention;
        }

        return {
          className: t.className,
          currentBalance: snap?.endingBalance ?? snap?.currentBalance ?? t.originalBalance ?? ppmBalanceByClass.get(key) ?? 0,
          originalBalance: ppmBalanceByClass.get(key) ?? t.originalBalance ?? 0,
          spreadBps,
          seniorityRank: t.seniorityRank ?? 99,
          isFloating,
          isIncomeNote: isSub,
          isDeferrable: t.isDeferrable
            ?? ppmDeferrableByClass.get(key)
            ?? deferrableFromMechanics(constraints.interestMechanics, t.className)
            ?? false,
          isAmortising: hasAmort,
          amortisationPerPeriod: amortPerPeriod,
          amortStartDate: hasAmort ? (ppmAmortStartByClass.get(key) ?? defaultAmortStartDate) : null,
          // PPM § 10(a)(i) prior-period state — null until trustee extraction
          // populates the carried-shortfall and consecutive-period-count
          // fields. Engine treats null as 0 (no prior carry) which is the
          // healthy-start default; populating from a real trustee snapshot
          // is the path-to-close for distressed deals.
          priorInterestShortfall: null,
          priorShortfallCount: null,
          // PPM Condition 6(c) opening Deferred Interest balance — sourced
          // directly from the trustee snapshot. Semantics gated by the
          // deal's `deferredInterestCompounds` flag downstream; see the
          // `ResolvedTranche.deferredInterestBalance` JSDoc and the
          // build-projection-inputs gate for the cause-tree on populated
          // values under compounding PPMs.
          deferredInterestBalance: snap?.deferredInterestBalance ?? null,
          dayCountConvention: trancheDayCountConvention,
          source: snap ? "snapshot" as const : "db_tranche" as const,
        };
      });
  }

  // Fallback: build from PPM capital structure
  const entries = (constraints.capitalStructure ?? []).filter(e => e.class); // skip class-less entries
  const byClass = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    const key = normClass(e.class);
    const existing = byClass.get(key);
    if (!existing || (parseAmount(e.principalAmount) > 0 && (!existing.principalAmount || parseAmount(existing.principalAmount) === 0))) {
      byClass.set(key, e);
    }
  }

  // Sort by class-letter bucket so seniority survives LLM extraction-order
  // shuffle. Pari-passu collapse (A-1+A-2 → rank 1, B-1+B-2 → rank 2) is
  // produced by `assignDenseSeniorityRanks` below — same shared helper used
  // by the DB write sites (`extraction/persist-ppm.ts`, `extraction/runner.ts`)
  // so the rank value can't drift between layers.
  const sortedEntries = Array.from(byClass.values()).sort(
    (a, b) =>
      classOrderBucket(a.class, a.isSubordinated) -
      classOrderBucket(b.class, b.isSubordinated),
  );
  const denseRanks = assignDenseSeniorityRanks(
    sortedEntries.map((e) => ({ className: e.class, isSubordinated: e.isSubordinated })),
  );

  return sortedEntries.map((e, idx) => {
    const className = e.class ?? "";
    const isSub = e.isSubordinated ?? className.toLowerCase().includes("sub");
    const isFloating = e.rateType
      ? e.rateType.toLowerCase().includes("float")
      : (e.spread?.toLowerCase().includes("euribor") || e.spread?.toLowerCase().includes("sofr") || false);
    const key = normClass(className);
    const amortPerPeriod = ppmAmortByClass.get(key) ?? null;
    const hasAmort = amortPerPeriod != null;
    const spreadBps = parseSpreadToBps(e.spreadBps, e.spread) ?? 0;

    if (spreadBps === 0 && !isSub) {
      warnings.push({
        field: `${className}.spreadBps`,
        message: `No spread found for ${className} in PPM constraints`,
        severity: "error",
        blocking: true,
      });
    }

    // PPM capital structure carries no day-count convention column. Same
    // tier rule as the DB-tranche branch: income notes don't accrue and
    // amortising tranches (Class X) ride the engine `isFloating ?
    // actual_360 : 30_360` fallback; floating defaults to A/360; fixed
    // non-amortising non-income tranches block (no market default).
    const carveOut = isSub || hasAmort;
    let ppmTrancheDayCountConvention: DayCountConvention | undefined;
    if (carveOut) {
      ppmTrancheDayCountConvention = undefined;
    } else {
      const dccResult = canonicalizeDayCount(undefined, {
        isFixedRate: !isFloating,
        field: `${className}.dayCountConvention`,
      });
      if (dccResult.warning) {
        warnings.push(
          dccResult.blocking
            ? { field: "dayCountConvention", message: dccResult.warning, severity: "error", blocking: true }
            : { field: "dayCountConvention", message: dccResult.warning, severity: "warn", blocking: false },
        );
      }
      ppmTrancheDayCountConvention = dccResult.convention;
    }

    return {
      className,
      currentBalance: parseAmount(e.principalAmount),
      originalBalance: parseAmount(e.principalAmount),
      spreadBps,
      seniorityRank: denseRanks[idx],
      isFloating,
      isIncomeNote: isSub,
      isDeferrable: e.deferrable ?? deferrableFromMechanics(constraints.interestMechanics, className) ?? false,
      isAmortising: hasAmort,
      amortisationPerPeriod: amortPerPeriod,
      amortStartDate: hasAmort ? (ppmAmortStartByClass.get(key) ?? defaultAmortStartDate) : null,
      // PPM § 10(a)(i) prior-period state — null until trustee extraction populates.
      priorInterestShortfall: null,
      priorShortfallCount: null,
      // No trustee snapshot available on this PPM-fallback path → null.
      deferredInterestBalance: null,
      dayCountConvention: ppmTrancheDayCountConvention,
      source: "ppm" as const,
    };
  });
}

/** Per-class merge: use compliance trigger when available, fill gaps from PPM. */
function mergeTriggersPerClass(
  fromTests: { className: string; triggerLevel: number; source: "compliance" | "ppm" }[],
  fromPpm: { className: string; triggerLevel: number; source: "compliance" | "ppm" }[],
  testType: string,
  warnings: ResolutionWarning[],
): { className: string; triggerLevel: number; source: "compliance" | "ppm" }[] {
  if (fromTests.length === 0) return fromPpm;
  if (fromPpm.length === 0) return fromTests;

  const testsByClass = new Map(fromTests.map(t => [normClass(t.className), t]));
  const merged = [...fromTests];

  for (const ppm of fromPpm) {
    const key = normClass(ppm.className);
    if (!testsByClass.has(key)) {
      merged.push(ppm);
      warnings.push({
        field: `${testType}Trigger.${ppm.className}`,
        message: `${testType} trigger for ${ppm.className} not found in compliance report — using PPM value (${ppm.triggerLevel})`,
        severity: "info", blocking: false,
        resolvedFrom: "ppm_constraints",
      });
    }
  }

  return merged;
}

function resolveTriggers(
  complianceTests: CloComplianceTest[],
  constraints: ExtractedConstraints,
  resolvedTranches: ResolvedTranche[],
  warnings: ResolutionWarning[],
  eventOfDefaultConstraint: { required_ratio_pct?: number; source_pages?: number[]; source_condition?: string } | null | undefined,
): { oc: ResolvedTrigger[]; ic: ResolvedTrigger[]; eventOfDefaultTest: ResolvedEodTest | null } {
  // Resolve a class name (possibly compound like "A/B") to its most junior seniority rank
  function resolveRank(cls: string): number {
    const parts = cls.split("/").map(s => s.trim());
    let maxRank = 0;
    for (const part of parts) {
      const base = part.replace(/-RR$/i, "").trim();
      const exact = resolvedTranches.find(t => normClass(t.className) === normClass(base));
      if (exact) { maxRank = Math.max(maxRank, exact.seniorityRank); continue; }
      const prefix = resolvedTranches.filter(t =>
        normClass(t.className).startsWith(normClass(base)) || normClass(t.className).startsWith(base.toLowerCase())
      );
      if (prefix.length > 0) { maxRank = Math.max(maxRank, ...prefix.map(t => t.seniorityRank)); continue; }
    }
    return maxRank || 99;
  }

  type TriggerEntry = { className: string; triggerLevel: number; source: "compliance" | "ppm" };

  // From compliance tests
  const ocFromTests: TriggerEntry[] = complianceTests
    .filter(t => isOcTest(t) && t.triggerLevel != null && t.testClass)
    .map(t => ({ className: t.testClass!, triggerLevel: t.triggerLevel!, source: "compliance" as const }));
  const icFromTests: TriggerEntry[] = complianceTests
    .filter(t => isIcTest(t) && t.triggerLevel != null && t.testClass)
    .map(t => ({ className: t.testClass!, triggerLevel: t.triggerLevel!, source: "compliance" as const }));

  // From PPM constraints (fallback). Real CLO PV triggers are >=103.24% for the
  // most junior class (Class F is typically 103-106%). The 102.5% value the
  // PPM extractor sometimes returns labeled as "Class A" is actually the
  // Event of Default test (§10(a)(iv)) misassigned to a class column. Filter
  // out implausibly-low (<103%) class triggers so they don't poison the
  // ocTriggers list AND the reinvestmentOcTrigger fallback.
  const ocFromPpm: TriggerEntry[] = (constraints.coverageTestEntries ?? [])
    .filter(e => e.class && e.parValueRatio && parseFloat(e.parValueRatio))
    .filter(e => {
      const v = parseFloat(e.parValueRatio!);
      if (v < 103 && v > 1) {
        warnings.push({
          field: `coverageTest.${e.class}`,
          message: `PPM coverage test for ${e.class} has parValueRatio ${v}% — implausibly low for a class PV trigger (minimum is ~103% for Class F). Likely the EoD threshold (102.5%) misassigned to a class column. Ignoring.`,
          severity: "warn", blocking: false,
        });
        return false;
      }
      return true;
    })
    .map(e => ({ className: e.class!, triggerLevel: parseFloat(e.parValueRatio!), source: "ppm" as const }));
  const icFromPpm: TriggerEntry[] = (constraints.coverageTestEntries ?? [])
    .filter(e => e.class && e.interestCoverageRatio && parseFloat(e.interestCoverageRatio))
    .map(e => ({ className: e.class!, triggerLevel: parseFloat(e.interestCoverageRatio!), source: "ppm" as const }));

  // Per-class merge: prefer compliance trigger for each class, fill gaps from PPM
  const ocRaw = mergeTriggersPerClass(ocFromTests, ocFromPpm, "OC", warnings);
  const icRaw = mergeTriggersPerClass(icFromTests, icFromPpm, "IC", warnings);

  if (ocRaw.length === 0) {
    warnings.push({
      field: "ocTriggers",
      message: "No OC triggers found in compliance tests or PPM. Engine cannot fire any class-level OC test, divert interest under PPM Step V, or detect Event of Default on class paths — every period would silently pass an absent test. Verify extraction or set triggers manually if data is genuinely missing.",
      severity: "error",
      // Empty trigger set looks innocuous but disables the entire OC
      // enforcement pipeline; refuse rather than project as if every
      // test passes.
      blocking: true,
    });
  }

  const oc: ResolvedTrigger[] = dedupTriggers(ocRaw, warnings).map(t => {
    let triggerLevel = t.triggerLevel;
    // Values < 10 are almost certainly ratios (e.g. 1.05 → 105%).
    // Values >= 90 are treated as percentages (e.g. 105.0% stays 105.0%).
    // Values 10–90 are in no-man's land: no real OC trigger is 10-90%.
    // Both interpretations (as-is = too low, ×100 = too high) are wrong,
    // so we warn at error severity and leave as-is (perpetually-passing is
    // safer than perpetually-failing, which would wipe out equity).
    if (triggerLevel > 0 && triggerLevel < 10) {
      triggerLevel = triggerLevel * 100;
      warnings.push({ field: `ocTrigger.${t.className}`, message: `OC trigger ${t.triggerLevel} looks like a ratio, converting to ${triggerLevel}%`, severity: "warn", blocking: false });
    } else if (triggerLevel >= 10 && triggerLevel < 90) {
      warnings.push({
        field: `ocTrigger.${t.className}`,
        message: `OC trigger ${triggerLevel}% for ${t.className} is implausible — no CLO OC trigger is 10-90%. Check extraction and set manually.`,
        severity: "error",
        // The "perpetually-passing" reasoning above is fine for the
        // warning shape but wrong as a run-with-it choice; refuse instead.
        blocking: true,
      });
    }
    if (triggerLevel > 200) {
      warnings.push({ field: `ocTrigger.${t.className}`, message: `OC trigger ${triggerLevel}% for ${t.className} seems unusually high`, severity: "warn", blocking: false });
    }
    return { className: t.className, triggerLevel, rank: resolveRank(t.className), testType: "OC" as const, source: t.source };
  });

  const ic: ResolvedTrigger[] = dedupTriggers(icRaw, warnings).map(t => {
    let triggerLevel = t.triggerLevel;
    // IC triggers: values < 10 are ratios (e.g. 1.20 → 120%). IC triggers are
    // typically 100-200%. Values >= 10 are treated as percentages.
    if (triggerLevel > 0 && triggerLevel < 10) {
      triggerLevel = triggerLevel * 100;
      warnings.push({ field: `icTrigger.${t.className}`, message: `IC trigger ${t.triggerLevel} looks like a ratio, converting to ${triggerLevel}%`, severity: "warn", blocking: false });
    } else if (triggerLevel >= 10 && triggerLevel < 90) {
      warnings.push({
        field: `icTrigger.${t.className}`,
        message: `IC trigger ${triggerLevel}% for ${t.className} is implausible — IC triggers are typically 100-200%, never 10-90%. Likely an extractor column mis-read. Check extraction and set manually.`,
        severity: "error",
        // Sibling shape to the OC band gate at L388-397: a misextracted
        // IC trigger of 50% means the actual ratio of ~150% always passes,
        // IC test silently always-on, no diversion ever fires. Refuse
        // rather than ship a projection against an always-passing test.
        blocking: true,
      });
    }
    if (triggerLevel > 500) {
      warnings.push({ field: `icTrigger.${t.className}`, message: `IC trigger ${triggerLevel}% for ${t.className} seems unusually high`, severity: "warn", blocking: false });
    }
    return { className: t.className, triggerLevel, rank: resolveRank(t.className), testType: "IC" as const, source: t.source };
  });

  // B1: Extract Event of Default Par Value Test (PPM Condition 10(a)(iv)) as
  // a distinct artifact, not a class-level OC trigger. The compliance test is
  // emitted with testClass "EOD" → rank 99 by resolveRank fallback. Filter
  // that entry out of the OC list and carry it on its own field with spec
  // metadata from raw.constraints when available.
  const eodEntries = oc.filter((t) => normClass(t.className) === "eod");
  const ocWithoutEod = oc.filter((t) => normClass(t.className) !== "eod");
  let eventOfDefaultTest: ResolvedEodTest | null = null;
  const constraintTrigger = eventOfDefaultConstraint?.required_ratio_pct;
  const eodCitation = extractCitation(eventOfDefaultConstraint);
  if (eodEntries.length > 0) {
    // Prefer compliance-reported level; fall back to PPM constraint if somehow missing.
    const eodLevel = eodEntries[0].triggerLevel;
    const sourcePage = eventOfDefaultConstraint?.source_pages?.[0] ?? null;
    eventOfDefaultTest = { triggerLevel: eodLevel, sourcePage, citation: eodCitation };
    if (constraintTrigger != null && Math.abs(constraintTrigger - eodLevel) > 0.01) {
      warnings.push({
        field: "eventOfDefaultTest",
        message: `EoD trigger mismatch: compliance reports ${eodLevel}%, PPM constraint reports ${constraintTrigger}%. Using compliance value.`,
        severity: "warn", blocking: false,
      });
    }
  } else if (constraintTrigger != null) {
    // No compliance row (older reports), fall back to PPM constraint.
    eventOfDefaultTest = {
      triggerLevel: constraintTrigger,
      sourcePage: eventOfDefaultConstraint?.source_pages?.[0] ?? null,
      citation: eodCitation,
    };
  }

  return { oc: ocWithoutEod, ic, eventOfDefaultTest };
}

function resolveFees(constraints: ExtractedConstraints, warnings: ResolutionWarning[]): ResolvedFees {
  let seniorFeePct: number = CLO_DEFAULTS.seniorFeePct;
  let subFeePct: number = CLO_DEFAULTS.subFeePct;
  let trusteeFeeBps: number = CLO_DEFAULTS.trusteeFeeBps;
  let incentiveFeePct: number = CLO_DEFAULTS.incentiveFeePct;
  let incentiveFeeHurdleIrr: number = CLO_DEFAULTS.incentiveFeeHurdleIrr;

  for (const fee of constraints.fees ?? []) {
    const name = fee.name?.toLowerCase() ?? "";
    const rate = parseFloat(fee.rate ?? "");
    if (isNaN(rate)) continue;
    const unit = fee.rateUnit ?? null;

    // Helper: convert rate to percentage, handling bps_pa unit or heuristic fallback
    const toPctPa = (r: number, fieldName: string): number => {
      if (unit === "bps_pa") {
        warnings.push({ field: fieldName, message: `Converted ${r} bps to ${r / 100}% (rateUnit: bps_pa)`, severity: "info", blocking: false });
        return r / 100;
      }
      if (unit === "pct_pa") return r;
      // No explicit unit — heuristic-only path. The wrong guess produces a 100×
      // error in fee accrual (rate of 6 read as bps becomes 0.06%, when the deal
      // genuinely paid 6% p.a.). Refuse rather than apply the heuristic silently;
      // partner sets rateUnit explicitly upstream and re-runs.
      if (r > 5) {
        warnings.push({
          field: fieldName,
          message: `Fee rate ${r} extracted with no rateUnit — heuristic would treat it as bps and convert to ${r / 100}%, but this is a guess. Wrong-direction interpretation produces a 100× error in fee accrual. Set rateUnit explicitly ("bps_pa" or "pct_pa") in the source data.`,
          severity: "error",
          blocking: true,
        });
        return r / 100;
      }
      return r;
    };

    if (name.includes("senior") && (name.includes("mgmt") || name.includes("management"))) {
      seniorFeePct = toPctPa(rate, "fees.seniorFeePct");
    } else if (name.includes("sub") && (name.includes("mgmt") || name.includes("management"))) {
      subFeePct = toPctPa(rate, "fees.subFeePct");
    } else if (name.includes("trustee") || name.includes("admin")) {
      // Trustee fees are in bps — if unit says pct_pa, convert
      if (unit === "pct_pa") {
        trusteeFeeBps = rate * 100;
        warnings.push({ field: "fees.trusteeFeeBps", message: `Converted trustee fee ${rate}% to ${rate * 100} bps (rateUnit: pct_pa)`, severity: "info", blocking: false });
      } else {
        trusteeFeeBps = rate;
      }
      if (trusteeFeeBps > 50) {
        warnings.push({ field: "fees.trusteeFeeBps", message: `Trustee fee ${trusteeFeeBps} bps seems unusually high`, severity: "warn", blocking: false });
      }
    } else if (name.includes("incentive") || name.includes("performance")) {
      incentiveFeePct = rate;
      if (rate > 50) {
        warnings.push({ field: "fees.incentiveFeePct", message: `Incentive fee ${rate}% seems unusually high`, severity: "warn", blocking: false });
      }
      const hurdleRaw = parseFloat(fee.hurdleRate ?? "");
      if (!isNaN(hurdleRaw) && hurdleRaw > 0) {
        incentiveFeeHurdleIrr = hurdleRaw > 1 ? hurdleRaw / 100 : hurdleRaw;
      } else if (incentiveFeePct > 0) {
        // Standard European CLO equity hurdle is ~12% IRR. Using 0% would mean
        // the incentive fee fires on any positive return, which is too aggressive.
        incentiveFeeHurdleIrr = 0.12;
        warnings.push({
          field: "fees.incentiveFeeHurdleIrr",
          message: `Incentive fee present (${incentiveFeePct}%) but no hurdle rate found — assuming 12% IRR hurdle. This directly affects equity IRR calculation. Set manually if different.`,
          severity: "error",
          resolvedFrom: "not extracted → defaulted to 12%",
          // Value still set to 0.12 so non-engine reads (debug
          // serialization, type-safety) don't see undefined; gate
          // refuses before the engine consumes.
          blocking: true,
        });
      }
    }
  }

  // Warn if trustee fee is 0 but the PPM mentions one — "per agreement" means we couldn't extract the rate
  if (trusteeFeeBps === 0 && (constraints.fees ?? []).some(f => {
    const n = (f.name ?? "").toLowerCase();
    return n.includes("trustee") || n.includes("admin");
  })) {
    warnings.push({
      field: "fees.trusteeFeeBps",
      message: "Trustee/admin fee found in PPM but rate is 'per agreement' (or otherwise unparseable) — `trusteeFeeBps` stayed at the CLO_DEFAULTS zero, so engine would accrue no trustee fee per period. Refusing to run rather than ship a projection that silently under-states senior expenses by the full trustee accrual. Set the rate manually from the compliance report fee schedule (typically 1-5 bps).",
      severity: "error",
      // Same shape as the senior/sub mgmt fee zero-on-recognized-name sites
      // at L546/556: trustee name found in extraction, rate failed to
      // parse, value silently defaults to 0, engine consumes zero. Refuse.
      blocking: true,
    });
  }

  // Sanity: every CLO has a Senior Collateral Management Fee (~0.10-0.20% p.a.)
  // and a Subordinated CMF (~0.30-0.50% p.a.). If either is exactly 0, the PPM
  // fees extraction likely regressed (LLM dropped the row or returned rate=null).
  // Downstream waterfall math with zero mgmt fees dramatically overstates Sub
  // Note distributions — warn loudly so the user catches it.
  const feeNames = (constraints.fees ?? []).map(f => (f.name ?? "").toLowerCase());
  const hasSeniorMgmtFeeName = feeNames.some(n => n.includes("senior") && (n.includes("mgmt") || n.includes("management")));
  const hasSubMgmtFeeName = feeNames.some(n => n.includes("sub") && (n.includes("mgmt") || n.includes("management")));
  if (seniorFeePct === 0) {
    warnings.push({
      field: "fees.seniorFeePct",
      message: hasSeniorMgmtFeeName
        ? `Senior Management Fee entry found but rate extracted as 0 — likely a PPM extraction regression (LLM returned rate=null or "per_agreement"). Check raw.constraints.fees. Typical Senior CMF is 0.10-0.20% p.a. — set manually.`
        : `No Senior Management Fee found in extracted constraints.fees[]. PPM extraction may have dropped the row. Typical Senior CMF is 0.10-0.20% p.a. — set manually.`,
      severity: "error",
      blocking: true,
    });
  }
  if (subFeePct === 0) {
    warnings.push({
      field: "fees.subFeePct",
      message: hasSubMgmtFeeName
        ? `Subordinated Management Fee entry found but rate extracted as 0 — likely a PPM extraction regression. Typical Sub CMF is 0.30-0.50% p.a. — set manually.`
        : `No Subordinated Management Fee found in extracted constraints.fees[]. Typical Sub CMF is 0.30-0.50% p.a. — set manually.`,
      severity: "error",
      blocking: true,
    });
  }

  // E1 (Sprint 5) — surface PPM section provenance for the fees block.
  // ppm-mapper.ts attaches `_feesProvenance` to constraints from
  // section_5_fees_and_hurdle.source_pages.
  const feesProvenance = (constraints as unknown as { _feesProvenance?: { source_pages?: number[] | null; source_condition?: string | null } | null })._feesProvenance ?? null;
  const citation = extractCitation(feesProvenance);

  return { seniorFeePct, subFeePct, trusteeFeeBps, incentiveFeePct, incentiveFeeHurdleIrr, citation };
}

/** Resolve PPM Condition 1 / 10(a)(iv) Excess CCC Adjustment Amount.
 *  Outer-nullable, inner-required: when the constraint object is missing or
 *  null, both fields emit blocking warnings rather than silently falling back
 *  to a global default — the partner-facing OC numerator depends on per-deal
 *  values (typical European CLO is 7.5% / 70% but ranges are 5–17.5% / 60–80%).
 *  The slider is not an override path: the gate fires before userAssumptions
 *  are read, so any unblock must happen upstream of the resolver. */
function resolveCccThresholds(
  constraints: ExtractedConstraints,
  warnings: ResolutionWarning[],
): { cccBucketLimitPct: number | null; cccMarketValuePct: number | null } {
  const adj = constraints.excessCccAdjustment;
  if (adj == null) {
    warnings.push({
      field: "cccBucketLimitPct",
      message: `Excess CCC Adjustment Amount not extracted from PPM (Condition 1 / 10(a)(iv)). The CCC bucket limit is per-deal; refusing to run rather than apply a global default.`,
      severity: "error",
      blocking: true,
    });
    warnings.push({
      field: "cccMarketValuePct",
      message: `Excess CCC Adjustment Amount not extracted from PPM (Condition 1 / 10(a)(iv)). The CCC market-value floor is per-deal; refusing to run rather than apply a global default.`,
      severity: "error",
      blocking: true,
    });
    return { cccBucketLimitPct: null, cccMarketValuePct: null };
  }
  const threshold = parseFloat(adj.thresholdPct);
  const marketValue = parseFloat(adj.marketValuePct);

  // Plausibility bounds: catches fraction-shape mis-extraction (LLM emits
  // "0.075" when the PPM says "7.5 per cent" → parseFloat passes 0.075
  // through silently, and the engine applies a 100× too-tight haircut cap
  // with no surface signal). Range chosen to bracket every PPM the model
  // might encounter (typical 5–17.5 / 60–80; widened to 1–50 / 1–100 for
  // headroom). Same defensive shape as the OC trigger 10–90% band block.
  const thresholdValid = !isNaN(threshold) && threshold >= 1 && threshold <= 50;
  const marketValueValid = !isNaN(marketValue) && marketValue >= 1 && marketValue <= 100;

  if (isNaN(threshold)) {
    warnings.push({
      field: "cccBucketLimitPct",
      message: `Excess CCC Adjustment thresholdPct extracted but unparseable: "${adj.thresholdPct}". Refusing to run rather than apply a global default.`,
      severity: "error",
      blocking: true,
    });
  } else if (!thresholdValid) {
    warnings.push({
      field: "cccBucketLimitPct",
      message: `Excess CCC Adjustment thresholdPct extracted as ${threshold} — outside plausible range [1, 50]. Likely a fraction-shape mis-extraction (e.g., "0.075" instead of "7.5") or a malformed value. Refusing to run rather than apply an implausible threshold.`,
      severity: "error",
      blocking: true,
    });
  }
  if (isNaN(marketValue)) {
    warnings.push({
      field: "cccMarketValuePct",
      message: `Excess CCC Adjustment marketValuePct extracted but unparseable: "${adj.marketValuePct}". Refusing to run rather than apply a global default.`,
      severity: "error",
      blocking: true,
    });
  } else if (!marketValueValid) {
    warnings.push({
      field: "cccMarketValuePct",
      message: `Excess CCC Adjustment marketValuePct extracted as ${marketValue} — outside plausible range [1, 100]. Likely a fraction-shape mis-extraction (e.g., "0.7" instead of "70") or an impossible value (>100% of par). Refusing to run rather than apply an implausible floor.`,
      severity: "error",
      blocking: true,
    });
  }
  // Atomic return: half-good output (one field parses, the other doesn't)
  // would let a downstream caller bypass the gate and consume a per-deal
  // value alongside the global default for the other — silently producing
  // a hybrid haircut. The per-field blocking warnings above are independent
  // of this atomicity; both still fire when only one field is invalid.
  if (!thresholdValid || !marketValueValid) {
    return { cccBucketLimitPct: null, cccMarketValuePct: null };
  }
  return { cccBucketLimitPct: threshold, cccMarketValuePct: marketValue };
}

export function resolveWaterfallInputs(
  constraints: ExtractedConstraints,
  complianceData: {
    poolSummary: CloPoolSummary | null;
    complianceTests: CloComplianceTest[];
    concentrations: unknown[];
  } | null,
  dbTranches: CloTranche[],
  trancheSnapshots: CloTrancheSnapshot[],
  holdings: CloHolding[],
  dealDates?: { maturity?: string | null; reinvestmentPeriodEnd?: string | null; reportDate?: string | null; dealCurrency?: string | null },
  accountBalances?: CloAccountBalance[],
  parValueAdjustments?: CloParValueAdjustment[],
): { resolved: ResolvedDealData; warnings: ResolutionWarning[] } {
  const warnings: ResolutionWarning[] = [];

  // --- Tranches ---
  const rawTranches = resolveTranches(constraints, dbTranches, trancheSnapshots, warnings);

  // Deduplicate by normalized class name — keep the entry with the lower seniority rank
  // (more authoritative). This handles "Subordinated Notes" vs "Sub" from different sources.
  const seenClasses = new Map<string, number>();
  const tranches: ResolvedTranche[] = [];
  for (const t of rawTranches) {
    const key = normClass(t.className);
    const existingIdx = seenClasses.get(key);
    if (existingIdx != null) {
      const existing = tranches[existingIdx];
      // Prefer snapshot > db_tranche > ppm (snapshot has current balances)
      const sourcePriority: Record<string, number> = { snapshot: 3, db_tranche: 2, ppm: 1, manual: 4 };
      const tPrio = sourcePriority[t.source] ?? 0;
      const ePrio = sourcePriority[existing.source] ?? 0;
      if (tPrio > ePrio || (tPrio === ePrio && t.seniorityRank < existing.seniorityRank)) {
        tranches[existingIdx] = t;
      }
      warnings.push({
        field: `${t.className}`,
        message: `Duplicate tranche "${t.className}" (source: ${t.source}) merged with "${existing.className}" (source: ${existing.source})`,
        severity: "info", blocking: false,
      });
    } else {
      seenClasses.set(key, tranches.length);
      tranches.push(t);
    }
  }

  // --- Pool Summary ---
  const pool = complianceData?.poolSummary;
  const { bps: wacSpreadBps, fix: wacFix } = normalizeWacSpread(pool?.wacSpread ?? null);
  if (wacFix) warnings.push({ field: wacFix.field, message: wacFix.message, severity: "info", blocking: false, resolvedFrom: `${wacFix.before} → ${wacFix.after}` });

  // Derive fallbacks from holdings when compliance_summary / CQ tests didn't populate.
  // Numeric zero is treated as "unset" for counts + WARF so the fallbacks kick in.
  const uniqueObligors = new Set(holdings.map(h => (h.obligorName ?? "").toLowerCase().trim()).filter(s => s.length > 0));
  const numberOfObligorsDerived = uniqueObligors.size;
  const numberOfObligors = (pool?.numberOfObligors != null && pool.numberOfObligors > 0)
    ? pool.numberOfObligors
    : numberOfObligorsDerived;

  // Derive composition percentages from concentrations[] when the poolSummary
  // columns (pctFixedRate, pctCovLite, etc.) are null. concentrations.actualValue
  // is a decimal fraction (0.0742 = 7.42%); we emit percentage values.
  const concentrationsList = (complianceData?.concentrations ?? []) as Array<Record<string, unknown>>;
  const concByName = new Map<string, number>();
  for (const c of concentrationsList) {
    const name = normalizeConcName(String(c.bucketName ?? c.concentrationType ?? ""));
    if (!name) continue;
    const actualPct = typeof c.actualPct === "number" ? c.actualPct : null;
    const raw = actualPct ?? (typeof c.actualValue === "number" ? c.actualValue : null);
    if (raw == null) continue;
    // Concentrations.actualValue is always a decimal fraction (1.0 = 100%,
    // 0.0742 = 7.42%). Multiply by 100 for fractions ≤ 1.5 (tolerance for
    // rounding); values above that are assumed to already be percentages.
    const pct = raw >= 0 && raw <= 1.5 ? raw * 100 : raw;
    if (!concByName.has(name)) concByName.set(name, pct);
  }
  const pickConc = (...names: string[]): number | null => {
    for (const n of names) {
      const v = concByName.get(n);
      if (v != null) return v;
    }
    return null;
  };
  /** Round to 4 decimal places to tame float artifacts (0.0093 × 100 =
   *  0.9299999999999999). Null passes through. */
  const round4 = (v: number | null): number | null =>
    v == null ? null : Math.round(v * 1e4) / 1e4;
  // Prefer poolSummary.pct* when populated, else derive from concentrations.
  const num = (x: unknown): number | null => (typeof x === "number" && !isNaN(x) ? x : null);
  const derivedPctFixedRate     = round4(num(pool?.pctFixedRate) ?? pickConc("fixed rate cdos", "fixed rate collateral debt obligations"));
  const derivedPctCovLite       = round4(num(pool?.pctCovLite) ?? pickConc("cov lite loans", "covenant lite loans"));
  // pctPik isn't on CloPoolSummary — concentrations-only.
  const derivedPctPik           = round4(pickConc("pik securities", "pik obligations"));
  const moodysCaa = pickConc("moody s caa obligations");
  const fitchCcc = pickConc("fitch ccc obligations");
  // CCC bucket: OC cares about the worse read — take the higher of the two agencies.
  const derivedPctCccAndBelow   = round4(num(pool?.pctCccAndBelow)
    ?? (moodysCaa != null || fitchCcc != null ? Math.max(moodysCaa ?? 0, fitchCcc ?? 0) : null));
  const derivedPctBonds         = round4(num(pool?.pctBonds) ?? pickConc("sr secured bonds hy bonds mezz"));
  const derivedPctSeniorSecured = round4(num(pool?.pctSeniorSecured) ?? pickConc("senior secured obligations"));
  // pctSecondLien intentionally NOT mapped from "Unsecured / HY / Mezz / 2nd Lien"
  // — that's a 4-category combined bucket; using it as second-lien only would
  // overclaim on deals with any HY/mezz. Prefer pool?.pctSecondLien if the
  // source provides it directly. Soft inference when senior-secured = 100%:
  // all par is senior-secured ⇒ second-lien is 0 by definition (mutually
  // exclusive lien categories). Lets partners see "0% second-lien" on deals
  // like Euro XV rather than "unknown" where the complement arithmetic makes
  // the answer certain.
  const directSecondLien = num(pool?.pctSecondLien);
  const derivedPctSecondLien = round4(
    directSecondLien != null
      ? directSecondLien
      : (derivedPctSeniorSecured === 100 ? 0 : null),
  );
  const derivedPctCurrentPay    = round4(num(pool?.pctCurrentPay) ?? pickConc("current pay obligations"));

  // E1 (Sprint 5) — surface PPM section provenance for the pool-summary block.
  // ppm-mapper.ts attaches `_poolProvenance` to constraints from
  // section_8_portfolio_and_quality_tests.source_pages (portfolio_profile +
  // collateral_quality_tests pages).
  const poolProvenance = (constraints as unknown as { _poolProvenance?: { source_pages?: number[] | null; source_condition?: string | null } | null })._poolProvenance ?? null;
  const poolCitation = extractCitation(poolProvenance);

  const poolSummary: ResolvedPool = {
    totalPar: pool?.totalPar ?? 0,
    totalPrincipalBalance: pool?.totalPrincipalBalance ?? 0,
    wacSpreadBps,
    warf: pool?.warf ?? 0,
    walYears: pool?.walYears ?? 0,
    diversityScore: pool?.diversityScore ?? 0,
    numberOfObligors,
    numberOfAssets: num(pool?.numberOfAssets),
    totalMarketValue: num(pool?.totalMarketValue),
    waRecoveryRate: num(pool?.waRecoveryRate),
    pctFixedRate: derivedPctFixedRate,
    pctCovLite: derivedPctCovLite,
    pctPik: derivedPctPik,
    pctCccAndBelow: derivedPctCccAndBelow,
    pctBonds: derivedPctBonds,
    pctSeniorSecured: derivedPctSeniorSecured,
    pctSecondLien: derivedPctSecondLien,
    pctCurrentPay: derivedPctCurrentPay,
    // D4 — populated after `loans` is constructed below (the helper needs
    // `loans[].obligorName` + `parBalance`). Placeholder null here; patched
    // into the literal once the loan list is ready.
    top10ObligorsPct: null,
    citation: poolCitation,
  };

  if (poolSummary.totalPar === 0) {
    warnings.push({
      field: "poolSummary.totalPar",
      message: "Total par is 0 — no pool summary data",
      severity: "error",
      // Empty pool produces an all-zero projection that's visible
      // only as "everything is strange"; refuse instead.
      blocking: true,
    });
  }

  // F3 canary — extracted pool.pct* fields are silent-null when extraction
  // misses them; resolver back-fills from concentrations. Loud-warn when
  // upstream extraction missed >2 of 7 to surface partial-extraction drift.
  const rawPctNullCount = [
    pool?.pctFixedRate, pool?.pctCovLite, pool?.pctBonds, pool?.pctCccAndBelow,
    pool?.pctSeniorSecured, pool?.pctSecondLien, pool?.pctCurrentPay,
  ].filter((v) => v == null).length;
  if (rawPctNullCount > 2) {
    warnings.push({
      field: "poolSummary.pct*",
      message: `${rawPctNullCount}/7 pool composition pct fields null in upstream extraction; resolver re-derived from concentrations. Verify ingest is reading the concentration table correctly.`,
      severity: "warn", blocking: false,
    });
  }

  // --- Triggers ---
  const eodConstraint =
    (constraints as unknown as { eventOfDefaultParValueTest?: { required_ratio_pct?: number; source_pages?: number[]; source_condition?: string } | null })
      .eventOfDefaultParValueTest ?? null;
  const { oc: ocTriggers, ic: icTriggers, eventOfDefaultTest } = resolveTriggers(
    complianceData?.complianceTests ?? [],
    constraints,
    tranches,
    warnings,
    eodConstraint,
  );

  // --- Dates ---
  // currentDate is the projection start. When the compliance report provides
  // a determination date (dealDates.reportDate), use it directly — it's the
  // authoritative "as of" date for every number in the report. Snapping to
  // the previous quarterly payment date (which the prior implementation did)
  // silently backdated currentDate by up to 3 months (e.g. a 2026-04-01
  // determination date was snapping to 2026-01-15, misaligning every
  // downstream projection period). Only fall back to the payment-schedule
  // snap when we don't have a report date.
  const today = new Date().toISOString().slice(0, 10);
  const firstPayment = constraints.keyDates?.firstPaymentDate ?? null;
  const reportPaymentDate = dealDates?.reportDate ?? null;
  let currentDate = today;
  if (reportPaymentDate) {
    currentDate = reportPaymentDate;
  } else if (firstPayment) {
    // No report — snap today to the nearest payment date
    const fp = new Date(firstPayment);
    const now = new Date(today);
    const cursor = new Date(fp);
    while (cursor <= now) {
      currentDate = cursor.toISOString().slice(0, 10);
      cursor.setUTCMonth(cursor.getUTCMonth() + 3);
    }
  }
  const maturity = dealDates?.maturity ?? constraints.keyDates?.maturityDate ?? null;
  // Dynamic fallback: currentDate + defaultMaxTenorYears (instead of hardcoded date)
  let resolvedMaturity = maturity;
  if (!resolvedMaturity) {
    const fallbackYear = new Date().getFullYear() + CLO_DEFAULTS.defaultMaxTenorYears;
    resolvedMaturity = `${fallbackYear}-01-15`;
    warnings.push({
      field: "dates.maturity",
      message: `No maturity date found — using fallback ${resolvedMaturity} (current date + ${CLO_DEFAULTS.defaultMaxTenorYears} years). Set maturity manually.`,
      severity: "error",
      // Fallback horizon ≠ true maturity → wrong period count and
      // wrong cumulative interest; refuse.
      blocking: true,
    });
  }

  const resolvedNonCallPeriodEnd = constraints.keyDates?.nonCallPeriodEnd ?? null;
  if (resolvedNonCallPeriodEnd == null) {
    warnings.push({
      field: "dates.nonCallPeriodEnd",
      message:
        "Non-Call Period End not extracted. Every CLO has a PPM-defined " +
        "Non-Call Period (Condition 7.2); a missing value indicates an " +
        "extraction gap, not a deal without one. The runtime guard on " +
        "pre-NCP callDates is gated on this field — without it, a user " +
        "modelling a call could silently produce IRR for an economically " +
        "impossible scenario. Refusing to project until NCP is resolved.",
      severity: "error",
      blocking: true,
    });
  }

  const dates: ResolvedDates = {
    maturity: resolvedMaturity,
    reinvestmentPeriodEnd: dealDates?.reinvestmentPeriodEnd ?? constraints.keyDates?.reinvestmentPeriodEnd ?? null,
    nonCallPeriodEnd: resolvedNonCallPeriodEnd,
    firstPaymentDate: constraints.keyDates?.firstPaymentDate ?? null,
    currentDate,
  };

  // Quarters between compliance report date and projection start.
  // Used to adjust recovery timing for pre-existing defaults — if the report flagged
  // a loan as defaulted N quarters ago, the recovery is N quarters closer than a fresh default.
  const reportDate = dealDates?.reportDate ?? null;
  let quartersSinceReport = 0;
  if (reportDate) {
    const reportD = new Date(reportDate);
    const currentD = new Date(currentDate);
    const monthsDiff = (currentD.getFullYear() - reportD.getFullYear()) * 12 + (currentD.getMonth() - reportD.getMonth());
    quartersSinceReport = Math.max(0, Math.floor(monthsDiff / 3));
  }

  // --- Fees ---
  const fees = resolveFees(constraints, warnings);

  // --- Excess CCC Adjustment Amount (per-deal CCC haircut params) ---
  const { cccBucketLimitPct, cccMarketValuePct } = resolveCccThresholds(constraints, warnings);

  // --- Reinvestment OC Trigger ---
  // Priority: (1) compliance test explicitly named "Reinvestment OC" with
  // testType INTEREST_DIVERSION — authoritative; (2) PPM's reinvestmentOcTest
  // gated to >=103% (PPM extractor sometimes conflates the §10(a)(iv) EoD
  // threshold of 102.5% with the Reinvestment OC trigger); (3) most junior
  // class OC trigger as last resort.
  let reinvestmentOcTrigger: ResolvedReinvestmentOcTrigger | null = null;
  const reinvOcRaw = constraints.reinvestmentOcTest;

  let diversionPct = 50; // common default
  if (reinvOcRaw?.diversionAmount) {
    const pctMatch = reinvOcRaw.diversionAmount.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      diversionPct = parseFloat(pctMatch[1]);
    } else {
      warnings.push({
        field: "reinvestmentOcTrigger.diversionPct",
        message: `Could not parse diversion percentage from "${reinvOcRaw.diversionAmount}" — defaulting to 50%`,
        severity: "error",
        blocking: true,
      });
    }
  } else if (reinvOcRaw?.trigger) {
    warnings.push({
      field: "reinvestmentOcTrigger.diversionPct",
      message: `Reinvestment OC trigger found but no diversion amount specified — defaulting to 50%`,
      severity: "error",
      blocking: true,
    });
  }

  const mostJuniorOcRank = ocTriggers.length > 0
    ? [...ocTriggers].sort((a, b) => b.rank - a.rank)[0].rank
    : 99;

  const complianceReinvOc = (complianceData?.complianceTests ?? []).find(t => {
    const name = (t.testName ?? "").toLowerCase();
    return t.triggerLevel != null
      && t.triggerLevel > 0
      && name.includes("reinvestment")
      && (t.testType === "INTEREST_DIVERSION" || name.includes("oc") || name.includes("overcollateral"));
  });
  if (complianceReinvOc?.triggerLevel != null) {
    reinvestmentOcTrigger = {
      triggerLevel: complianceReinvOc.triggerLevel,
      rank: mostJuniorOcRank,
      diversionPct,
    };
  }

  if (!reinvestmentOcTrigger && reinvOcRaw?.trigger) {
    let triggerLevel = parseFloat(reinvOcRaw.trigger);
    if (!isNaN(triggerLevel) && triggerLevel > 0) {
      if (triggerLevel < 10) {
        warnings.push({ field: "reinvestmentOcTrigger", message: `Reinvestment OC trigger ${triggerLevel} looks like a ratio, converting to ${triggerLevel * 100}%`, severity: "warn", blocking: false });
        triggerLevel = triggerLevel * 100;
      }
      if (triggerLevel < 103) {
        warnings.push({
          field: "reinvestmentOcTrigger",
          message: `PPM reinvestmentOcTest.trigger is ${triggerLevel}% — implausibly low (typical range 103-106%). Likely the §10(a)(iv) EoD threshold (102.5%) misassigned. Ignoring PPM value.`,
          severity: "warn", blocking: false,
        });
      } else {
        if (triggerLevel > 200) {
          warnings.push({ field: "reinvestmentOcTrigger", message: `Reinvestment OC trigger ${triggerLevel}% seems unusually high`, severity: "warn", blocking: false });
        }
        reinvestmentOcTrigger = { triggerLevel, rank: mostJuniorOcRank, diversionPct };
      }
    }
  }

  if (!reinvestmentOcTrigger && ocTriggers.length > 0) {
    const sortedOc = [...ocTriggers].filter(t => t.triggerLevel >= 103).sort((a, b) => b.rank - a.rank);
    if (sortedOc.length > 0) {
      reinvestmentOcTrigger = { triggerLevel: sortedOc[0].triggerLevel, rank: sortedOc[0].rank, diversionPct };
    }
  }

  // Catch the residual non-portability shape the L374 blocking gate doesn't
  // subsume: PPM mentioned a reinvestment OC test (compliance test row OR PPM
  // raw constraint) but no fall-through path produced a usable trigger
  // (compliance triggerLevel null, PPM trigger filtered as implausibly low,
  // AND no class OC trigger >= 103). Engine `projection.ts:2505` gates Step V
  // diversion behind a truthy check on `reinvestmentOcTrigger` — a null
  // trigger silently disables the diversion mechanism the PPM specified.
  // Refuse rather than emit a "passing" projection computed against an
  // absent test.
  if (!reinvestmentOcTrigger && (complianceReinvOc != null || reinvOcRaw != null)) {
    warnings.push({
      field: "reinvestmentOcTrigger",
      message: "PPM mentioned a reinvestment OC test (compliance test row or PPM raw constraint) but no fall-through path produced a usable trigger — compliance triggerLevel was null, PPM trigger was filtered as implausibly low, AND no class OC trigger ≥ 103. Engine would silently skip Step V diversion. Refuse and verify the reinvestment-OC threshold extraction upstream.",
      severity: "error",
      blocking: true,
    });
  }

  // --- Loans ---
  const fallbackMaturity = resolvedMaturity;
  // Bonds carry parBalance=0 by SDF convention (the "funded balance" concept
  // doesn't apply — their outstanding par lives in principalBalance). Use the
  // higher of the two so bonds aren't silently dropped. The SDF parser now
  // handles this at ingestion time; this fallback protects already-ingested
  // rows and any other source that mirrors the SDF convention.
  const holdingPar = (h: typeof holdings[number]): number =>
    (h.parBalance && h.parBalance > 0) ? h.parBalance
    : (h.principalBalance && h.principalBalance > 0) ? h.principalBalance
    : 0;
  const activeHoldings = holdings.filter(h => holdingPar(h) > 0 && !h.isDefaulted);
  const nonDdtlHoldings = activeHoldings.filter(h => !h.isDelayedDraw);

  const loans: ResolvedLoan[] = activeHoldings.map(h => {
    const isFixed = h.isFixedRate === true;
    const isDdtl = h.isDelayedDraw === true;
    // Clean rating sentinels defensively — pre-fix rows in the DB still carry
    // "***" / "NR" / "--" etc. from the SDF; trimRating handles new ingests.
    const moodys = cleanRating(h.moodysRating);
    const sp = cleanRating(h.spRating);
    const fitch = cleanRating(h.fitchRating);
    const moodysFinal = cleanRating(h.moodysRatingFinal);
    const spFinal = cleanRating(h.spRatingFinal);
    const fitchFinal = cleanRating(h.fitchRatingFinal);
    const moodysDp = cleanRating(h.moodysDpRating);
    const ratingBucket = mapToRatingBucket(moodys, sp, fitch, cleanRating(h.compositeRating));

    let fixedCouponPct: number | undefined;
    if (isFixed) {
      if (h.allInRate != null) {
        fixedCouponPct = h.allInRate;
      } else if (h.spreadBps != null) {
        fixedCouponPct = h.spreadBps / 100;
        warnings.push({
          field: "fixedCouponPct",
          message: `Fixed-rate loan "${h.obligorName ?? "unknown"}" has no allInRate — engine would proxy via spreadBps (${h.spreadBps} bps → ${fixedCouponPct}% coupon), but spread is the basis-rate-add of a floater, not a fixed coupon. Wrong substitution yields per-period coupon-accrual error of (true_coupon − spread/100) × par on this position. Refuse and set allInRate explicitly upstream.`,
          severity: "error",
          blocking: true,
        });
      } else {
        fixedCouponPct = wacSpreadBps / 100;
        warnings.push({
          field: "fixedCouponPct",
          message: `Fixed-rate loan "${h.obligorName ?? "unknown"}" has neither allInRate nor spreadBps — engine would fall back to pool WAC (${fixedCouponPct}% coupon). Magnitude unbounded: a fixed-rate bond paying 8% with WAC of 4% would accrue at 4% every period, understating coupon by 50% × par on this position. Refuse and set allInRate explicitly upstream.`,
          severity: "error",
          blocking: true,
        });
      }
    }

    let ddtlSpreadBps: number | undefined;
    if (isDdtl) {
      const candidates = nonDdtlHoldings.filter(c => c.obligorName != null && c.obligorName === h.obligorName);
      if (candidates.length > 1) {
        warnings.push({ field: "ddtlSpreadBps", message: `DDTL "${h.obligorName ?? "unknown"}" matched ${candidates.length} parent facilities — using largest par with closest maturity as tiebreaker.`, severity: "warn", blocking: false });
      }
      if (candidates.length > 0) {
        const ddtlMaturity = h.maturityDate ?? fallbackMaturity;
        const parent = [...candidates].sort((a, b) => {
          const parDiff = (b.parBalance ?? 0) - (a.parBalance ?? 0);
          if (parDiff !== 0) return parDiff;
          const aDist = Math.abs(new Date(a.maturityDate ?? fallbackMaturity).getTime() - new Date(ddtlMaturity).getTime());
          const bDist = Math.abs(new Date(b.maturityDate ?? fallbackMaturity).getTime() - new Date(ddtlMaturity).getTime());
          return aDist - bDist;
        })[0];
        ddtlSpreadBps = parent.spreadBps ?? wacSpreadBps;
      } else {
        ddtlSpreadBps = wacSpreadBps;
        warnings.push({
          field: "ddtlSpreadBps",
          message: `DDTL "${h.obligorName ?? "unknown"}" has no matching parent facility (no funded holding shares its obligorName) — engine would assign the pool WAC (${wacSpreadBps} bps) as the draw spread. On a deal where the DDTL's true facility spread diverges from WAC, every period after draw accrues at the wrong rate; magnitude is per-loan and unbounded. Refuse and verify the parent-facility obligorName upstream.`,
          severity: "error",
          blocking: true,
        });
      }
    }

    // Moody's uses its DP (Default Probability) rating for WARF when available,
    // falling back to the final/published rating, then the raw Moody's rating.
    const warfFactor =
      moodysWarfFactor(moodysDp)
      ?? moodysWarfFactor(moodysFinal)
      ?? moodysWarfFactor(moodys)
      ?? undefined;

    // Per-loan accrual convention. Block if non-empty unrecognized OR if
    // null on a fixed-rate position (no market default for fixed). Floating
    // null falls back to Actual/360 with severity:"warn" (data-quality
    // signal: market default IS Actual/360 for Euro paper, but non-Euro
    // floating positions use other conventions, so a missing DCC merits
    // more than an FYI).
    const dccResult = canonicalizeDayCount(h.dayCountConvention, {
      isFixedRate: isFixed,
      field: `${h.obligorName ?? "unknown"}.dayCountConvention`,
    });
    if (dccResult.warning) {
      warnings.push(
        dccResult.blocking
          ? { field: "dayCountConvention", message: dccResult.warning, severity: "error", blocking: true }
          : { field: "dayCountConvention", message: dccResult.warning, severity: "warn", blocking: false },
      );
    }

    // Per-loan EURIBOR floor sign + scale invariants (anti-pattern #5).
    // Source convention is PERCENT (e.g. 0.5 = 50bp) on the SDF
    // Collateral File path; magnitude validator rejects > 50%. Sign
    // invariant: a negative floor is structurally meaningless (a floor
    // below zero is no floor at all). Catching it here rather than in
    // the engine because the boundary is the right place to enforce
    // type-system gaps.
    if (h.floorRate != null && h.floorRate < 0) {
      warnings.push({
        field: "floorRate",
        message: `Holding "${h.obligorName ?? "unknown"}": floorRate=${h.floorRate} is negative. Per-position EURIBOR floors are non-negative by construction; a negative value indicates a parser failure or upstream sign-convention error. Refuse and verify the floor_rate ingestion.`,
        severity: "error",
        blocking: true,
      });
    } else if (h.floorRate != null && h.floorRate > 5) {
      warnings.push({
        field: "floorRate",
        message: `Holding "${h.obligorName ?? "unknown"}": floorRate=${h.floorRate}% is implausibly high (typical Euro CLO floors 0.0–1.0%). Likely scale or locale mis-parse.`,
        severity: "warn",
        blocking: false,
      });
    }

    // PIK classification. Three-tier blocking rule (anti-pattern #3):
    //   (1) `isPik === true` (explicit) OR (`isPik == null AND pikAmount > 0`)
    //       → treat as PIK. The fallback derivation matches the parser-side
    //       derivation in `parse-asset-level.ts`; resolver-side fallback
    //       handles existing DB rows that predate the parser change.
    //   (2) `isPik === false AND pikAmount > 0` → block (data-shape
    //       contradiction: explicit-false claim contradicts the source's
    //       reported per-period PIK accrual).
    //   (3) `pikAmount < 0` → block (sign invariant — negative PIK is
    //       structurally meaningless).
    // The engine consumes only the boolean dispatch flag; pikAmount is
    // strictly observability for a future Q1 audit harness.
    let derivedIsPik: boolean | undefined;
    if (h.pikAmount != null && h.pikAmount < 0) {
      warnings.push({
        field: "pikAmount",
        message: `Holding "${h.obligorName ?? "unknown"}": pikAmount=${h.pikAmount} is negative. PIK accruals are non-negative by construction; a negative value indicates a parser failure or upstream sign-convention error. Refuse and verify the pik_amount ingestion.`,
        severity: "error",
        blocking: true,
      });
    } else if (h.isPik === false && (h.pikAmount ?? 0) > 0) {
      warnings.push({
        field: "isPik",
        message: `Holding "${h.obligorName ?? "unknown"}": isPik=false but pikAmount=${h.pikAmount} > 0. The source reports per-period PIK accrual on a position the structural flag claims is non-PIK; one of the two is wrong. Engine cannot dispatch correctly under this contradiction (treating as cash-paying would over-state interestCollected by ${h.pikAmount} this period). Refuse and reconcile upstream.`,
        severity: "error",
        blocking: true,
      });
    } else if (h.isPik === true) {
      derivedIsPik = true;
    } else if (h.isPik == null && (h.pikAmount ?? 0) > 0) {
      // Parser-side derivation should already have set is_pik=true on this
      // row; fallback covers DB rows ingested before the parser change.
      derivedIsPik = true;
    } else if (h.isPik === false) {
      derivedIsPik = false;
    }
    // h.isPik == null AND pikAmount in {null, 0} → leave undefined
    // (no PIK behavior demonstrated; default-to-cash is safe).

    return stripNulls({
      parBalance: holdingPar(h),
      maturityDate: h.maturityDate ?? fallbackMaturity,
      ratingBucket,
      spreadBps: isFixed ? 0 : (isDdtl ? 0 : (h.spreadBps ?? wacSpreadBps)),
      obligorName: h.obligorName ?? undefined,
      isFixedRate: isFixed || undefined,
      fixedCouponPct,
      isDelayedDraw: isDdtl || undefined,
      ddtlSpreadBps,
      // Full ratings (sentinel-cleaned)
      moodysRating: moodys ?? undefined,
      spRating: sp ?? undefined,
      fitchRating: fitch ?? undefined,
      // Derived ratings (sentinel-cleaned)
      moodysRatingFinal: moodysFinal ?? undefined,
      spRatingFinal: spFinal ?? undefined,
      fitchRatingFinal: fitchFinal ?? undefined,
      // Market data
      currentPrice: h.currentPrice ?? undefined,
      marketValue: h.marketValue ?? undefined,
      // Structural
      lienType: h.lienType ?? undefined,
      isDefaulted: h.isDefaulted ?? undefined,
      defaultDate: h.defaultDate ?? undefined,
      floorRate: h.floorRate ?? undefined,
      isCovLite: h.isCovLite ?? undefined,
      isPik: derivedIsPik,
      warfFactor,
      // Floating WAS denominator excludes Non-Euro Obligations per PPM
      // Condition 1 (PDF p. 302). Sourced from holding's `currency` (post-
      // enrichment) or `nativeCurrency` (raw); upper-cased. Undefined means
      // the loan is assumed deal-currency-denominated.
      currency: (h.currency ?? h.nativeCurrency ?? undefined)?.trim().toUpperCase() || undefined,
      // isDeferring / isLossMitigationLoan are CM-designation flags not
      // present in the SDF. Resolver leaves undefined; only relevant for
      // distressed deals where the source extends to populate them.
      dayCountConvention: dccResult.convention,
    });
  });

  // --- Pre-existing Defaults ---
  // Defaulted holdings are excluded from the loan list (no interest income).
  // For each holding: use market price recovery if available, track unpriced par
  // separately so the engine can apply its model recoveryPct to the remainder.
  const defaultedHoldings = holdings.filter(h => h.isDefaulted && holdingPar(h) > 0);
  const preExistingDefaultedPar = defaultedHoldings.reduce((s, h) => s + holdingPar(h), 0);
  let preExistingDefaultRecovery = 0; // market-price-based recovery for priced holdings
  let unpricedDefaultedPar = 0; // par of holdings without market price (engine applies recoveryPct)
  for (const h of defaultedHoldings) {
    const par = holdingPar(h);
    if (h.currentPrice != null && h.currentPrice > 0) {
      // currentPrice in percentage format (e.g. 31.29 = 31.29% of par).
      // Ambiguity: values in (0, 1) could be 0.5% or 50% — we treat as decimal (50%).
      // True fix requires normalizing at the extraction layer based on source format.
      preExistingDefaultRecovery += par * (h.currentPrice >= 1 ? h.currentPrice / 100 : h.currentPrice);
    } else {
      unpricedDefaultedPar += par;
    }
  }
  // Agency recovery value for OC numerator — the indenture uses the LESSER of available
  // agency recovery rates (e.g. "Lesser of Fitch Collateral Value and S&P Collateral Value").
  const preExistingDefaultOcValue = defaultedHoldings.reduce((s, h) => {
    const par = holdingPar(h);
    const rates = [h.recoveryRateMoodys, h.recoveryRateSp, h.recoveryRateFitch]
      .filter((r): r is number => r != null && r > 0);
    if (rates.length > 0) {
      const minRate = Math.min(...rates);
      // Agency rates in percentage format (e.g. 28.5 = 28.5%)
      return s + par * (minRate >= 1 ? minRate / 100 : minRate);
    }
    // No agency rates — fall back to market price
    if (h.currentPrice != null && h.currentPrice > 0) {
      return s + par * (h.currentPrice >= 1 ? h.currentPrice / 100 : h.currentPrice);
    }
    // No data — return 0 so engine uses model recoveryPct
    return s;
  }, 0);

  // --- Principal Account Cash ---
  // Uninvested principal sitting in the Principal Account. Counts toward the
  // OC numerator per PPM 10(a)(iv) — SIGNED: credits positive, overdrafts
  // negative. Euro XV Q1 fixture carries a −€1,817,413 overdraft which the
  // trustee correctly deducts from the numerator (158.52% tie-out). A
  // positive-only filter under-reports in exactly this case.
  //
  // Name match also covers the "Principle" typo variant (some ingest paths
  // produce it) without requiring data cleanup upstream.
  const principalAccountCash = (accountBalances ?? [])
    .filter((a) => {
      if (a.balanceAmount == null) return false;
      if (a.accountType === "PRINCIPAL") return true;
      const name = (a.accountName ?? "").toLowerCase();
      return name.includes("principal") || name.includes("principle");
    })
    .reduce((s, a) => s + a.balanceAmount!, 0);

  // --- D7: Non-principal account balances ---
  // Group remaining account rows by case-insensitive name match so downstream
  // consumers (UI, projection engine callers) can reference each PPM account
  // balance. Exposure only — NOT wired into the engine OC numerator, since
  // which accounts flow into the CPA is deal-specific per the PPM.
  // Rows with null balanceAmount are skipped; multiple matching rows are summed.
  //
  // Token matchers are broadened to handle abbreviated names — trustee reports
  // often use "SMOOTH" / "SUPP RES" / "EXP RES" instead of the full "Smoothing"
  // / "Supplemental" / "Expense Reserve". Strict "smoothing"/"supplemental"/
  // "expense" tokens would silently misroute abbreviated accounts into
  // `interestAccountCash` (the default interest bucket). Caught during Sprint 4
  // D7 review against Euro XV fixture which uses all three abbreviations.
  let interestAccountCash = 0;
  let interestSmoothingBalance = 0;
  let supplementalReserveBalance = 0;
  let expenseReserveBalance = 0;
  for (const a of accountBalances ?? []) {
    if (a.balanceAmount == null) continue;
    const name = (a.accountName ?? "").toLowerCase();
    // "smooth" matches both "smoothing" and "SMOOTH ACT".
    const isSmoothing = name.includes("smooth");
    // "supp" matches "supplemental" + "SUPP RES". Would also match "supply" /
    // "support" — not expected in PPM account taxonomy; revisit if it surfaces.
    const isSupplemental = name.includes("supp");
    // "exp res" / "expense" both match. The compound "exp res" token is
    // specific enough to avoid colliding with unrelated "exp"/"expiration"
    // account names.
    const isExpense = name.includes("expense") || name.includes("exp res");
    const isPrincipal = name.includes("principal") || name.includes("principle");
    if (isSmoothing) {
      interestSmoothingBalance += a.balanceAmount;
    } else if (isSupplemental) {
      supplementalReserveBalance += a.balanceAmount;
    } else if (isExpense) {
      expenseReserveBalance += a.balanceAmount;
    } else if (name.includes("interest") && !isPrincipal) {
      interestAccountCash += a.balanceAmount;
    }
  }

  // --- Discount & Long-Dated Obligation Haircuts ---
  // The trustee's Adjusted CPA deducts par of discount/long-dated obligations and adds back
  // their recovery values. The NET haircut is the OC numerator reduction. Extract from the
  // par value adjustments section (already in DB from compliance report extraction).
  const pvAdj = parValueAdjustments ?? [];
  const discountObligationHaircut = pvAdj
    .filter(a => a.adjustmentType === "DISCOUNT_OBLIGATION_HAIRCUT" && a.netAmount != null)
    .reduce((s, a) => s + Math.abs(a.netAmount!), 0);
  const longDatedObligationHaircut = pvAdj
    .filter(a => a.adjustmentType === "LONG_DATED_HAIRCUT" && a.netAmount != null)
    .reduce((s, a) => s + Math.abs(a.netAmount!), 0);

  // --- Implied OC Adjustment ---
  // Residual between the trustee's Adjusted CPA and the components we can now identify
  // (principal balance + cash - defaulted haircut - discount haircut - long-dated haircut).
  // Captures any remaining trustee adjustments we haven't explicitly modeled.
  // Sanity-checked: if implausibly large (>5% of par) or negative, discard and warn.
  const totalPar = pool?.totalPar ?? 0;
  const totalPrincipalBalance = pool?.totalPrincipalBalance ?? 0;
  let impliedOcAdjustment = 0;
  if (totalPar > 0 && totalPrincipalBalance > 0) {
    const defaultedHaircut = preExistingDefaultedPar - preExistingDefaultOcValue;
    const implied = totalPrincipalBalance + principalAccountCash - defaultedHaircut - discountObligationHaircut - longDatedObligationHaircut - totalPar;
    if (implied < -100) {
      // Only warn if the residual is meaningfully negative (not just floating point noise)
      warnings.push({ field: "impliedOcAdjustment", message: `Adjusted CPA reconciliation has negative residual (${Math.round(implied).toLocaleString()}). Unmodeled trustee adjustments may be inflating the Adjusted CPA. OC adjustment set to 0.`, severity: "info", blocking: false });
    } else if (implied < 0) {
      // Negligible negative residual (rounding) — reconciliation effectively closes. No warning.
    } else if (implied > totalPar * 0.05) {
      warnings.push({ field: "impliedOcAdjustment", message: `Derived OC adjustment (${Math.round(implied).toLocaleString()}) is >5% of par — likely includes adjustments beyond unfunded revolvers. Capping at 0.`, severity: "warn", blocking: false });
    } else {
      impliedOcAdjustment = implied;
    }
  }

  const ddtlUnfundedPar = loans
    .filter(l => l.isDelayedDraw)
    .reduce((s, l) => s + l.parBalance, 0);
  if (ddtlUnfundedPar > 0 && impliedOcAdjustment > 0) {
    impliedOcAdjustment = Math.max(0, impliedOcAdjustment - ddtlUnfundedPar);
  }

  // --- Base Rate Floor ---
  // Extracted from interest mechanics section. null = not extracted (use default from CLO_DEFAULTS).
  // Guard against string "null" from loose extraction typing.
  const rawFloor = constraints.interestMechanics?.referenceRateFloorPct;
  const baseRateFloorPct = (typeof rawFloor === "number") ? rawFloor : null;

  // --- Deferred Interest Compounding ---
  // Extracted from interest mechanics section. Defaults to true (standard CLO convention).
  // Guard against string "null" from loose extraction typing.
  let deferredInterestCompounds = true;
  const rawCompounds = constraints.interestMechanics?.deferredInterestCompounds;
  if (typeof rawCompounds === "boolean") {
    deferredInterestCompounds = rawCompounds;
  } else if (tranches.some(t => t.isDeferrable)) {
    warnings.push({
      field: "deferredInterestCompounds",
      message: "Deal has deferrable tranches but PIK compounding info was not extracted as a boolean — engine would default to `true` (compound deferred interest). On a deal whose indenture specifies non-compounding, every period over-states the deferred balance, and the over-statement compounds across periods. Refuse and set interestMechanics.deferredInterestCompounds explicitly upstream.",
      severity: "error",
      blocking: true,
    });
  }

  // --- Interest Non-Payment Grace Period (PPM § 10(a)(i)) ---
  // Null = "use the engine's PPM-correct default" (0 periods). PPM § 10(a)(i)
  // cure windows are typically 5 business days post-payment-date — sub-period
  // in a quarterly model, so if a missed payment is still missed at the next
  // period checkpoint the cure has lapsed. Override only when modelling a
  // non-standard deal whose PPM grants a multi-period grace.
  //
  // Severity is `warn`, non-blocking: surfaced in the partner-facing
  // warnings panel (`ProjectionModel.tsx` filters only `info`), but the
  // projection is allowed to run because the wrong-direction error is
  // over-trigger (false EoD under stress), never under-trigger — the
  // displayed numbers are conservative-correct. When extraction lands,
  // flip this site to `severity: "error", blocking: true` — same shape
  // as the other computational-input blocking gates in this resolver.
  const interestNonPaymentGracePeriods: number | null = null;
  warnings.push({
    field: "interestNonPaymentGracePeriods",
    message:
      "PPM § 10(a)(i) interest-non-payment grace period not extracted; engine defaults to 0 (any senior-interest shortfall fires Event of Default immediately). This is the conservative PPM-correct default for the modal quarterly-payment CLO (sub-period cure windows lapse before the next checkpoint). A deal whose PPM grants a multi-period grace would over-trigger acceleration under stress; verify PPM § 10(a)(i) before relying on stress-scenario IRRs.",
    severity: "warn",
    blocking: false,
  });

  // --- Quality & Concentration Tests ---
  // Quality tests (WARF/WAL/WAS/diversity/recovery) come from clo_compliance_tests
  // (populated by §6 Collateral Quality Tests section extraction).
  //
  // Concentration tests (63 portfolio-profile buckets from §7) live in their own
  // table clo_concentrations, NOT in compliance_tests. The resolver had been
  // filtering compliance_tests for testType=CONCENTRATION which only ever
  // surfaced stray rows — the real 63 buckets were invisible. Surface them
  // from complianceData.concentrations[] directly.
  const allComplianceTests = complianceData?.complianceTests ?? [];
  const qualityTestTypes = new Set(['WARF', 'WAL', 'WAS', 'DIVERSITY', 'RECOVERY']);

  const qualityTests: ResolvedComplianceTest[] = allComplianceTests
    .filter(t => t.testType && qualityTestTypes.has(t.testType))
    .map(t => ({
      testName: t.testName,
      testClass: t.testClass,
      actualValue: t.actualValue,
      triggerLevel: t.triggerLevel,
      cushion: round4(t.cushionPct),
      isPassing: t.isPassing,
      canonicalType: classifyComplianceTest(t.testName),
    }));

  // Concentration tests come from three sources of varying completeness:
  //   (1) clo_concentrations — 63 buckets with bucketName + actualValue (no limit)
  //   (2) clo_compliance_tests (testType=CONCENTRATION) — ~36 rows with both
  //       actual and trigger, but only covers lettered sections (a)–(dd)
  //   (3) PPM portfolioProfileTests — constraint limits by bucket name
  //
  // The concentrationType letter ("a", "b", "p(i)") in source (1) matches the
  // "(a) ...", "(b) ...", "(p)(i) ..." prefix in source (2), giving a clean
  // join for the lettered buckets. Per-rating Fitch/Moody's buckets all use
  // concentrationType="z" and have no simple PPM limit (matrix-governed).
  const concentrationsRaw = (complianceData?.concentrations ?? []) as Array<Record<string, unknown>>;
  const concTestsByLetter = new Map<string, CloComplianceTest>();
  for (const t of allComplianceTests) {
    if (t.testType !== "CONCENTRATION") continue;
    // Match leading "(a)", "(p)(i)", "(dd)" patterns
    const m = (t.testName ?? "").match(/^\s*\(([a-z]+)\)(?:\(([iv]+)\))?/i);
    if (!m) continue;
    const letter = m[1].toLowerCase();
    const roman = (m[2] ?? "").toLowerCase();
    const key = roman ? `${letter}(${roman})` : letter;
    concTestsByLetter.set(key, t);
  }

  const ppmProfile = constraints.portfolioProfileTests ?? {};
  const ppmByKey = new Map<string, { max: number | null; min: number | null }>();
  for (const [name, limits] of Object.entries(ppmProfile)) {
    const max = parseFloat((limits as { max?: string | null }).max ?? "");
    const min = parseFloat((limits as { min?: string | null }).min ?? "");
    ppmByKey.set(normalizeConcName(name), {
      max: isNaN(max) ? null : max,
      min: isNaN(min) ? null : min,
    });
  }

  const concentrationTests: ResolvedComplianceTest[] = concentrationsRaw.map(c => {
    const bucketName = (c.bucketName ?? c.concentrationType ?? "") as string;
    const concType = (c.concentrationType ?? "") as string;

    // Prefer compliance test (has both actual + trigger + passing flag)
    const ct = concTestsByLetter.get(concType.toLowerCase());
    if (ct) {
      const resolvedName = bucketName || ct.testName;
      // Classify on the richest available name. `bucketName` falls through to
      // `concentrationType` (e.g. "n", "o") on deals where `concentrations.bucketName`
      // is null, so a single-letter `resolvedName` would silently classify as
      // "other" and the silent-skip gate would then refuse to project. The
      // compliance-test row carries the lettered + English form ("(n) Moody's
      // Caa Obligations") which is unambiguous to the classifier; prefer it.
      return {
        testName: resolvedName,
        testClass: null,
        actualValue: ct.actualValue,
        triggerLevel: ct.triggerLevel,
        cushion: round4(ct.cushionPct ?? directionalCushion(ct.testType, ct.testName, ct.actualValue, ct.triggerLevel)),
        isPassing: ct.isPassing,
        canonicalType: classifyComplianceTest(ct.testName || bucketName),
      };
    }

    // Fall back to concentrations row + PPM limit join by normalized name
    const actualPct = typeof c.actualPct === "number" ? c.actualPct : null;
    const rawActual = actualPct ?? (typeof c.actualValue === "number" ? c.actualValue : null);
    // concentrations.actualValue is a decimal ratio (0.0692 = 6.92%). PPM limits
    // are percentages (7.5 = 7.5%). Normalize actual to percentage for cushion math.
    const actualValue = rawActual != null && rawActual > 0 && rawActual < 1 ? rawActual * 100 : rawActual;

    const ppmLimit = ppmByKey.get(normalizeConcName(bucketName));
    const limitPct = typeof c.limitPct === "number" ? c.limitPct : null;
    const limitValue = typeof c.limitValue === "number" ? c.limitValue : null;
    const triggerLevel = limitPct ?? limitValue ?? ppmLimit?.max ?? ppmLimit?.min ?? null;

    return {
      testName: bucketName,
      testClass: null,
      actualValue: round4(actualValue),
      triggerLevel,
      // Concentrations-row path has no testType — pass null so isHigherBetter
      // falls through to name-pattern + clause-letter dispatch on bucketName.
      cushion: round4(directionalCushion(null, bucketName, actualValue, triggerLevel)),
      isPassing: typeof c.isPassing === "boolean" ? c.isPassing : null,
      canonicalType: classifyComplianceTest(bucketName),
    };
  });

  // Per-deal rating-agency presence — drives the silent-skip blocking-gate
  // predicate so missing agency-tagged compliance triggers block on
  // rated-by-that-agency deals but are silently absent on not-rated deals.
  //
  // Derivation: OR across two evidence sources so the predicate fails CLOSED
  // (correctly Moody's-rated) whenever either the PPM capital structure OR
  // the SDF compliance data carries Moody's evidence. PPM-only would fail
  // OPEN on a deal whose extraction populated `capitalStructure` rows but
  // dropped the per-tranche `rating` subobjects — silently disabling all
  // three Moody's gates on a Moody's-rated deal. The qualityTests /
  // concentrationTests rows are independent SDF-sourced evidence; a row
  // matching `/moody/i` is conclusive even if PPM extraction missed.
  // Symmetric for Fitch via concentrationTests (Fitch CCC Concentration is
  // the canonical Fitch-tagged compliance test).
  const isMoodysRated =
    (constraints.capitalStructure ?? []).some(
      (e) => e.rating?.moodys != null && e.rating.moodys.trim() !== "",
    ) ||
    qualityTests.some((q) => /moody/i.test(q.testName)) ||
    concentrationTests.some((c) => /moody/i.test(c.testName));
  const isFitchRated =
    (constraints.capitalStructure ?? []).some(
      (e) => e.rating?.fitch != null && e.rating.fitch.trim() !== "",
    ) ||
    qualityTests.some((q) => /fitch/i.test(q.testName)) ||
    concentrationTests.some((c) => /fitch/i.test(c.testName));

  // C1 — silent-skip blocking gate for compliance triggers. Per PPM Section 8
  // (Collateral Quality Tests, PDF p. 287) the Moody's WARF Test, Moody's
  // Minimum Diversity Test, Moody's Recovery Rate Test, and Min Weighted
  // Average Floating Spread Test all apply "while Moody's-rated Notes are
  // outstanding"; the Fitch WARF / Recovery / CCC Concentration tests apply
  // "while Fitch-rated Notes are outstanding". A deal that IS rated by an
  // agency but has its trigger missing from extraction is an extraction
  // failure (silent-fallback per CLAUDE.md principle 3). On such a deal we
  // refuse to project rather than running with no enforcement on a test that
  // PPM-correct math would block. Deals NOT rated by the agency legitimately
  // omit the test → silent-skip is correct.
  const findQualityTrigger = (type: ComplianceTestType) => {
    const t = qualityTests.find((q) => q.canonicalType === type);
    return t?.triggerLevel ?? null;
  };
  const findConcentrationTrigger = (type: ComplianceTestType) => {
    const t = concentrationTests.find((q) => q.canonicalType === type);
    return t?.triggerLevel ?? null;
  };
  if (isMoodysRated) {
    if (findQualityTrigger("moodys_max_warf") == null) {
      warnings.push({
        field: "moodysWarfTriggerLevel",
        message:
          "Moody's-rated deal but Moody's Maximum WARF Test trigger not found in compliance qualityTests. " +
          "C1 reinvestment compliance cannot enforce against the WARF cap without it. Verify trustee report " +
          "exposes the test row, or extend extraction to surface the matrix-elected WARF trigger.",
        severity: "error", blocking: true,
      });
    }
    if (findQualityTrigger("min_was") == null) {
      warnings.push({
        field: "minWasBps",
        message:
          "Moody's-rated deal but Minimum Weighted Average Floating Spread Test trigger not found in " +
          "compliance qualityTests. C1 cannot enforce Min WAS without it. Verify trustee report exposes " +
          "the test row.",
        severity: "error", blocking: true,
      });
    }
    if (findConcentrationTrigger("moodys_caa_concentration") == null) {
      warnings.push({
        field: "moodysCaaLimitPct",
        message:
          "Moody's-rated deal but Moody's Caa Obligations concentration trigger not found in " +
          "concentrationTests. C1 cannot enforce Caa concentration without it. Verify trustee report " +
          "exposes test row '(n) Moody's Caa Obligations' (or equivalent).",
        severity: "error", blocking: true,
      });
    }
  }
  if (isFitchRated) {
    if (findConcentrationTrigger("fitch_ccc_concentration") == null) {
      warnings.push({
        field: "fitchCccLimitPct",
        message:
          "Fitch-rated deal but Fitch CCC Obligations concentration trigger not found in " +
          "concentrationTests. C1 cannot enforce Fitch CCC concentration without it. Verify trustee " +
          "report exposes test row '(o) Fitch - CCC Obligations' (or equivalent).",
        severity: "error", blocking: true,
      });
    }
  }

  // --- Data Source Metadata ---
  // Per-row data_source tags are a single literal "sdf" today, which is too coarse
  // to answer "which SDF files were ingested?". Infer the answer from the shape of
  // data the resolver can see: each SDF file populates a distinctive surface.
  // Note: transactions and accruals are not passed to the resolver — the caller
  // (ContextEditor) can merge those in separately if needed.
  const rowTags = new Set<string>();
  for (const h of holdings) { if (h.dataSource) rowTags.add(h.dataSource); }
  for (const t of allComplianceTests) { if (t.dataSource) rowTags.add(t.dataSource); }
  for (const s of trancheSnapshots) { if (s.dataSource) rowTags.add(s.dataSource); }
  for (const a of accountBalances ?? []) { if (a.dataSource) rowTags.add(a.dataSource); }

  const sdfFilesIngested: string[] = [];
  if (trancheSnapshots.length > 0) sdfFilesIngested.push("sdf_notes");
  if (holdings.length > 0) sdfFilesIngested.push("sdf_collateral");
  // Asset Level enriches holdings with fields the Collateral File doesn't carry
  // (moodys_dp_rating, watchlist flags, derived ratings). Presence of any enrichment
  // field is a reliable fingerprint that Asset Level was ingested.
  if (holdings.some(h => h.moodysRatingFinal || h.moodysDpRating || h.moodysIssuerWatch || h.moodysSecurityWatch)) {
    sdfFilesIngested.push("sdf_asset_level");
  }
  if (allComplianceTests.length > 0) sdfFilesIngested.push("sdf_test_results");
  if ((accountBalances ?? []).length > 0) sdfFilesIngested.push("sdf_accounts");

  // PPM ingest was invisible to the previous detection because constraints don't
  // carry a per-row data_source. Detect presence by checking the structural shape.
  const pdfExtracted: string[] = [];
  const hasPpm =
    (constraints.capitalStructure ?? []).length > 0
    || (constraints.fees ?? []).length > 0
    || !!constraints.keyDates?.maturityDate
    || !!constraints.dealIdentity?.dealName
    || !!constraints.interestMechanics;
  if (hasPpm) pdfExtracted.push("ppm");

  // Carry any non-"sdf" row tags through. Some upserts produce composite tags
  // like "sdf+intex_past_cashflows" when a later ingest appends to an existing
  // snapshot — split on "+" so each source ends up in the right bucket rather
  // than emitting the literal composite string.
  for (const tag of rowTags) {
    if (!tag || tag === "sdf") continue;
    for (const part of tag.split("+").map(s => s.trim()).filter(Boolean)) {
      if (part === "sdf") continue; // already covered by shape detection
      if (part.startsWith("sdf")) {
        if (!sdfFilesIngested.includes(part)) sdfFilesIngested.push(part);
      } else if (part.startsWith("pdf") || part === "ppm") {
        if (!pdfExtracted.includes(part)) pdfExtracted.push(part);
      } else if (part.startsWith("intex")) {
        // Intex backfill is a historical-cashflow source. Not PDF, not SDF CSV.
        // Record in pdfExtracted as the closest non-sdf bucket; downstream
        // consumers that want to distinguish can read the full tag.
        if (!pdfExtracted.includes(part)) pdfExtracted.push(part);
      }
    }
  }

  let dataSource: ResolvedMetadata["dataSource"] = null;
  const hasSdf = sdfFilesIngested.length > 0;
  const hasPdf = pdfExtracted.length > 0;
  if (hasSdf && hasPdf) dataSource = "mixed";
  else if (hasSdf) dataSource = "sdf";
  else if (hasPdf) dataSource = "pdf";

  const metadata: ResolvedMetadata = {
    reportDate: dealDates?.reportDate ?? null,
    dataSource,
    sdfFilesIngested,
    pdfExtracted,
  };

  // --- Diagnostic warnings ---
  // (a) Duplicate holdings rows from the SDF Collateral File. Two scales of
  // duplication matter to consumers:
  //   - strict (obligor, facilityCode, parBalance) identical clusters:
  //     trustee sometimes emits the same lot multiple times
  //   - aggregated (obligor, facilityCode) pairs: purchase-lot fragmentation —
  //     same facility bought across multiple tranches at different par sizes
  // Consumers rendering a per-facility view (memo, UI) care about the
  // aggregated number, which is typically much larger. Pool totals already
  // include both kinds, so we never dedup at ingest (would break the SDF
  // reconciliation); surface both counts so consumers know what to collapse.
  {
    const totalWithKeys = holdings.filter(h => h.obligorName && h.facilityCode && h.parBalance).length;
    const strictCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    for (const h of holdings) {
      if (!h.obligorName || !h.facilityCode || !h.parBalance) continue;
      const strictKey = `${h.obligorName}|${h.facilityCode}|${h.parBalance}`;
      strictCounts.set(strictKey, (strictCounts.get(strictKey) ?? 0) + 1);
      const pairKey = `${h.obligorName}|${h.facilityCode}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }
    let strictClusters = 0;
    let strictRows = 0;
    for (const n of strictCounts.values()) if (n > 1) { strictClusters++; strictRows += n; }
    const uniquePairs = pairCounts.size;
    const pairDelta = totalWithKeys - uniquePairs;
    if (strictClusters > 0 || pairDelta > 0) {
      warnings.push({
        field: "holdings.duplicateClusters",
        message: `${totalWithKeys} raw holdings collapse to ${uniquePairs} unique (obligor, facilityCode) pairs — ${pairDelta} rows are purchase-lot fragments. Of those, ${strictRows} row(s) in ${strictClusters} cluster(s) are identical on (obligor, facilityCode, parBalance). Pool totals include all rows; per-facility consumers should aggregate by (obligorName, facilityCode) and sum par.`,
        severity: "info", blocking: false,
      });
    }
  }

  // (b) Compliance tests with an actual value but no trigger AND isPassing is
  // not explicitly true. Without a trigger, downstream consumers that filter
  // on trigger != null will silently drop them — hiding the WAS-excl-floor
  // and Frequency Switch tests that the PPM expects but the SDF leaves
  // uncompleted. "Not true" catches both explicit-fail and "Not Calculated".
  {
    const uncomputed = allComplianceTests.filter(t =>
      t.triggerLevel == null
      && t.actualValue != null
      && t.isPassing !== true
    );
    if (uncomputed.length > 0) {
      const names = uncomputed.map(t => t.testName).filter(Boolean).slice(0, 5).join("; ");
      warnings.push({
        field: "complianceTests.uncomputedTests",
        message: `${uncomputed.length} test(s) have an actual value but no trigger and are not marked passing — consumers filtering on triggerLevel != null will hide them. Examples: ${names}`,
        severity: "warn", blocking: false,
      });
    }
  }

  // (c) Compliance tests with both actualValue AND triggerLevel populated but
  // isPassing is null AND direction is genuinely unknown. The partner-
  // facing PASS/FAIL badge at `app/clo/page.tsx:143-146` reads off this
  // field directly and hides itself when null, so these rows show up to
  // the partner without a pass/fail signal. The direction predicate is
  // load-bearing: `isPassing == null` has multiple non-direction sources
  // (SDF `parsePassFail` returns null on its "Not Calculated" branch
  // and on its catch-all for unrecognized Pass_Fail strings — see
  // `sdf/parse-test-results.ts`); without the predicate, those rows
  // fire this warning with a misleading "direction could not be
  // determined" message. The cleaner signal — the SDF parser's
  // `isActive: false` flag — is not plumbed through to the resolver-
  // side compliance test type, so we can't distinguish "vendor declined
  // to compute" from "direction unknown" except by re-running the
  // classifier here. Display-side gap
  // only — no engine arithmetic depends on isPassing — so the warning is
  // severity warn, non-blocking, surfaced via the generic resolution-
  // warnings panel (`ProjectionModel.tsx:1101`, `ContextEditor.tsx:909`).
  {
    const ambiguousDirection = allComplianceTests.filter(t =>
      t.actualValue != null
      && t.triggerLevel != null
      && t.isPassing == null
      && isHigherBetter(t.testType, t.testName) === null
    );
    if (ambiguousDirection.length > 0) {
      const names = ambiguousDirection.map(t => t.testName).filter(Boolean).slice(0, 5).join("; ");
      warnings.push({
        field: "complianceTests.ambiguousDirection",
        message: `${ambiguousDirection.length} compliance test(s) have both actual value and trigger populated but no PASS/FAIL signal — direction (higher-is-better vs lower-is-better) could not be determined from testType / testName / clause-letter. PASS/FAIL badge unavailable on these rows. Examples: ${names}`,
        severity: "warn", blocking: false,
      });
    }
  }

  // (d) Join-vocabulary drift guard. The concentration-trigger join relies on
  // "(a)"..."(dd)" lettered prefixes in compliance test names. If the SDF ever
  // changes that convention (or we ingest a different trustee's variant),
  // fall loud here rather than silently producing zero matches.
  {
    const concCount = allComplianceTests.filter(t => t.testType === "CONCENTRATION").length;
    const matchedLetters = concTestsByLetter.size;
    if (concCount >= 10 && matchedLetters < 20) {
      const samples = allComplianceTests
        .filter(t => t.testType === "CONCENTRATION")
        .slice(0, 3)
        .map(t => t.testName)
        .join("; ");
      warnings.push({
        field: "concentrationJoin.vocabulary",
        message: `Concentration letter-prefix join matched only ${matchedLetters} of ${concCount} CONCENTRATION tests. The "(a)", "(b)", "(p)(i)" naming convention may have changed. Sample names: ${samples}`,
        severity: "error",
        // Display-only: this field does not enter ProjectionInputs or
        // any waterfall computation. The partner sees an out-of-date
        // concentration taxonomy in the table, never a wrong number.
        // Explicit `blocking: false` so the carve-out is mechanical,
        // not a comment-explained exception.
        blocking: false,
      });
    }
  }

  // D4 — compute top10ObligorsPct from the assembled loan list. Relies on
  // `obligorName` being populated on most positions (resolver does populate
  // it when the SDF row has it). Positions without an obligorName still
  // contribute to total par but not to any obligor bucket — so the metric
  // reflects only identifiable-obligor concentration.
  poolSummary.top10ObligorsPct = loans.length > 0 ? computeTopNObligorsPct(loans, 10) : null;

  // Deal currency. Prefer the deal-level field (CloDeal.dealCurrency) when
  // populated; otherwise derive from the par-weighted modal native_currency
  // across non-defaulted holdings. Null when neither is determinable — UI
  // surfaces a "Set deal currency" banner. Per CLAUDE.md § "Recurring
  // failure modes" principle 1, formatting code MUST read this field; never
  // hardcode `€`/`$`. Enforced by the `ui-hardcodes-currency-symbol` AST
  // rule in architecture-boundary.test.ts.
  let currency: string | null = dealDates?.dealCurrency?.trim() || null;
  if (!currency) {
    // Par-weighted modal — row-count would mis-call deals with a few
    // large foreign-currency positions among many small native-currency
    // ones (principle 1 — don't overfit Euro XV's mostly-uniform sizes).
    const parByCurrency = new Map<string, number>();
    for (const h of holdings) {
      if (h.isDefaulted) continue;
      const c = h.nativeCurrency?.trim().toUpperCase();
      if (!c) continue;
      parByCurrency.set(c, (parByCurrency.get(c) ?? 0) + holdingPar(h));
    }
    if (parByCurrency.size > 0) {
      let best = "";
      let bestPar = 0;
      for (const [c, p] of parByCurrency) {
        if (p > bestPar) { best = c; bestPar = p; }
      }
      currency = best;
    }
  }
  if (!currency) {
    warnings.push({
      field: "currency",
      message: "Deal currency could not be determined from dealCurrency or holdings. UI will display a 'Set deal currency' banner. Multi-currency modeling tracked under KI-38.",
      severity: "warn", blocking: false,
    });
  } else {
    currency = currency.toUpperCase();
  }

  // PPM Target Par Amount (Aggregate Excess Funded Spread denominator term).
  // Source priority: PPM `constraints.dealSizing.targetParAmount` (current
  // schema), else legacy top-level `constraints.targetParAmount`, else DB
  // `pool.targetPar` (number). Null when none — treated as zero in WAS
  // arithmetic with no blocking warning per the type docstring.
  const parseTargetParStr = (s: string | null | undefined): number | null => {
    if (!s || s.trim() === "") return null;
    const v = parseFloat(s.replace(/[^\d.-]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const targetParAmount =
    parseTargetParStr(constraints.dealSizing?.targetParAmount) ??
    parseTargetParStr(constraints.targetParAmount) ??
    (pool?.targetPar != null && pool.targetPar > 0 ? pool.targetPar : null);

  // PPM Reference Weighted Average Fixed Coupon (Excess WAC term, PPM
  // Condition 1, PDF p. 305). Per-deal extracted from PPM section 7
  // (interest mechanics). The prior implementation hardcoded 4.0% as a
  // "European CLO market standard" with an info-level warning — that
  // silent fallback is the exact CLAUDE.md principle 3 violation: a
  // partner-facing computational input (feeds Excess WAC → Min WAS
  // compliance gate) defaulting to a deal-family constant. Wrong on every
  // non-Ares deal whose reference WAFC is anything other than 4.0%. Now
  // reads from `interestMechanics.referenceWeightedAverageFixedCoupon`
  // (typed) or the raw passthrough `reference_weighted_average_fixed_coupon`
  // (snake_case from JSON ingest); blocks if missing.
  const ifmRaw = constraints.interestMechanics as unknown as Record<string, unknown> | undefined;
  const referenceWeightedAverageFixedCoupon: number | null =
    typeof constraints.interestMechanics?.referenceWeightedAverageFixedCoupon === "number"
      ? constraints.interestMechanics.referenceWeightedAverageFixedCoupon
      : typeof ifmRaw?.reference_weighted_average_fixed_coupon === "number"
        ? (ifmRaw.reference_weighted_average_fixed_coupon as number)
        : null;
  if (referenceWeightedAverageFixedCoupon == null) {
    // Excess WAC = (wafc − refWAFC) × 100 × (fixedPar / floatingPar). When
    // the deal has no fixed-rate loans, fixedPar = 0 and the term is zero
    // regardless of refWAFC — the absent extraction has no computational
    // effect and blocking would refuse a valid all-floating-rate CLO. The
    // engine never introduces fixed-rate loans during reinvestment (every
    // reinvestment row is `isFixedRate: false`, see projection.ts), so a
    // deal that starts all-floating stays all-floating. Block only when
    // any loan is fixed-rate; otherwise emit a non-blocking warn so the
    // partner sees the gap but the projection runs (with refWAFC defaulted
    // in the engine via `?? 4.0`, which is multiplied by zero anyway).
    const hasFixedRate = loans.some((l) => l.isFixedRate === true);
    if (hasFixedRate) {
      warnings.push({
        field: "referenceWeightedAverageFixedCoupon",
        message:
          "PPM Reference Weighted Average Fixed Coupon (Condition 1, PDF p. 305) is not extracted — required as the anchor for the Excess WAC term in Floating WAS compliance arithmetic on a deal that holds fixed-rate obligations. Without it, the per-period engine-vs-trustee Floating WAS would drift on any deal whose true reference differs from the previously-hardcoded 4.0% (Ares-family default). Refusing to run rather than ship a projection that silently mis-anchors the Excess WAC.",
        severity: "error",
        blocking: true,
      });
    } else {
      warnings.push({
        field: "referenceWeightedAverageFixedCoupon",
        message:
          "PPM Reference Weighted Average Fixed Coupon (Condition 1, PDF p. 305) is not extracted, but the deal currently has no fixed-rate obligations — Excess WAC term is identically zero so the absent anchor has no computational effect. Projection proceeds; if a future ingest introduces fixed-rate positions, this warning escalates to blocking.",
        severity: "warn",
        blocking: false,
      });
    }
  }

  return {
    resolved: { tranches, poolSummary, ocTriggers, icTriggers, qualityTests, concentrationTests, reinvestmentOcTrigger, eventOfDefaultTest, dates, fees, loans, metadata, principalAccountCash, interestAccountCash, interestSmoothingBalance, supplementalReserveBalance, expenseReserveBalance, preExistingDefaultedPar, preExistingDefaultRecovery, unpricedDefaultedPar, preExistingDefaultOcValue, discountObligationHaircut, longDatedObligationHaircut, cccBucketLimitPct, cccMarketValuePct, targetParAmount, referenceWeightedAverageFixedCoupon, isMoodysRated, isFitchRated, impliedOcAdjustment, quartersSinceReport, ddtlUnfundedPar, deferredInterestCompounds, interestNonPaymentGracePeriods, baseRateFloorPct, currency },
    warnings,
  };
}
