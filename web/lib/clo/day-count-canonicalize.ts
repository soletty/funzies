/**
 * Canonicalizes the free-form `day_count_convention` strings carried on
 * `clo_holdings` and `clo_tranches` (e.g. "30/360 (European)", "Actual/365",
 * "30E/360 (ISDA)") into the four-element union the engine's
 * `dayCountFraction` helper consumes.
 *
 * The boundary contract (per CLAUDE.md anti-pattern #5: boundaries assert
 * sign and scale) is that an unrecognized non-empty string is a parser
 * defect or upstream data corruption — silent fallback is the failure
 * shape anti-pattern #3 prohibits. The three-tier blocking rule below
 * scopes the carve-out to the one place market practice gives a safe
 * default: a missing convention on a floating-rate instrument, where
 * Actual/360 is the universal Euro-leveraged-loan convention.
 */

export type DayCountConvention = "actual_360" | "30_360" | "30e_360" | "actual_365";

export interface CanonicalizeResult {
  convention: DayCountConvention;
  warning: string | null;
  blocking: boolean;
}

export interface CanonicalizeContext {
  /** Whether the position is fixed-rate. Drives the null-handling tier:
   *  null + floating is acceptable (Actual/360 is the market default for
   *  floating instruments); null + fixed has no safe default and must
   *  block (30/360 US vs 30E/360 vs 30/360-EOM all diverge by single-day
   *  amounts that compound into wrong partner-facing accruals). */
  isFixedRate: boolean;
  /** Field name for warning attribution (e.g. "Class B-2.dayCountConvention"
   *  or `${obligorName}.dayCountConvention`). */
  field: string;
}

/**
 * Canonicalize a raw `day_count_convention` string into the engine's union.
 *
 * Tiering:
 *   - non-empty unrecognized → blocking error (parser bug / data corruption)
 *   - null + isFixedRate     → blocking error (no market default for fixed)
 *   - null + floating        → fallback Actual/360 + warn (market default)
 *   - "30/360 (EOM)"         → 30_360. The EOM rule diverges from US 30/360
 *                              only on Feb-end starts — single-day, single-
 *                              period effect on a fraction of fixed positions.
 *                              Documented as immaterial.
 *   - "Actual/365L"          → fallback actual_365 + warn. Sterling/yen
 *                              edge convention; precision downgrade.
 */
export function canonicalizeDayCount(
  raw: string | null | undefined,
  ctx: CanonicalizeContext,
): CanonicalizeResult {
  if (raw == null || raw.trim() === "") {
    if (ctx.isFixedRate) {
      return {
        convention: "actual_360",
        warning: `${ctx.field}: fixed-rate position has no day_count_convention. No market default exists for fixed-rate (30/360 US, 30E/360, 30/360 EOM all diverge). Refuse and populate upstream.`,
        blocking: true,
      };
    }
    return {
      convention: "actual_360",
      warning: `${ctx.field}: missing day_count_convention on floating position; defaulting to Actual/360 (market default for Euro-denominated leveraged loans).`,
      blocking: false,
    };
  }

  const norm = raw.trim().toLowerCase();

  // Actual/360 — single canonical match. ACT/360 also accepted.
  if (norm === "actual/360" || norm === "act/360") {
    return { convention: "actual_360", warning: null, blocking: false };
  }

  // 30E/360 (European bond basis). Both endpoints capped at 30, no anchor
  // rule. ISDA §4.16(g). "30/360 (European)" is the market label for the
  // same convention; "30E/360" and "30E/360 (ISDA)" are the formal labels.
  if (
    norm === "30/360 (european)" ||
    norm === "30e/360" ||
    norm === "30e/360 (isda)"
  ) {
    return { convention: "30e_360", warning: null, blocking: false };
  }

  // 30/360 US (Bond Basis). The "30/360 (EOM)" variant is mapped here:
  // the End-Of-Month rule diverges from US 30/360 only when the start
  // date is the last day of February — a single-day delta on a single
  // period for a fraction of fixed positions. Calling it 30_360 trades
  // a precise but rarely-active edge case for shared mainline code; the
  // alternative (a `30_360_eom` branch) buys ~€0/quarter on Euro XV
  // (4 EOM positions, none with Feb-end start dates in the projection
  // window) at the cost of additional surface to maintain.
  if (
    norm === "30/360" ||
    norm === "30/360 (us" ||
    norm === "30/360 (us)" ||
    norm === "30/360 (eom)"
  ) {
    return { convention: "30_360", warning: null, blocking: false };
  }

  // Actual/365 (Fixed). Days / 365 calendar.
  if (norm === "actual/365" || norm === "act/365" || norm === "actual/365 (fixed)") {
    return { convention: "actual_365", warning: null, blocking: false };
  }

  // Actual/365L — Sterling/Yen edge convention (denominator depends on
  // whether the period contains Feb 29). Precision downgrade to plain
  // Actual/365 — divergence is single-day on leap-year-spanning periods,
  // measured in basis points × 1/365. Warn so the partner sees that the
  // engine is approximating.
  if (norm === "actual/365l" || norm === "act/365l") {
    return {
      convention: "actual_365",
      warning: `${ctx.field}: Actual/365L treated as Actual/365 (precision downgrade — leap-day denominator handling not modeled). Magnitude: single-day × rate × par on leap-year-spanning periods.`,
      blocking: false,
    };
  }

  // Unrecognized non-empty string. Per anti-pattern #3 this must block —
  // silent re-interpretation of a string we don't understand is the
  // canonical failure shape (locale-blind numeric parsers turning
  // "1.500.000,00" into 1.5, gates defaulting wrong-direction comparisons
  // on lower-is-better tests, etc.).
  return {
    convention: "actual_360",
    warning: `${ctx.field}: unrecognized day_count_convention "${raw}". Either the parser doesn't handle this convention or upstream data is corrupt. Engine refuses to project against an unknown accrual convention; extend canonicalizeDayCount or fix the data.`,
    blocking: true,
  };
}
