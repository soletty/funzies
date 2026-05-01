// Magnitude assertions at the parser→resolver boundary.
//
// CLAUDE.md principle 5 ("boundaries assert sign and scale") + principle 3
// ("silent fallbacks on extraction failures are bugs, not defaults"): a
// numeric value crossing into the resolver carries an implicit magnitude
// invariant. A par balance < €1,000 OR a market value > 200 OR a coupon > 50%
// is almost certainly a parser failure (locale mis-parse, column shift,
// currency confusion).
//
// This is defense-in-depth: the locale-aware parseNumeric (KI-50) cures the
// known bug shape; the magnitude validator catches future ones we haven't
// anticipated. Returns null on out-of-range — the caller treats it as "this
// field could not be safely parsed," which propagates downstream as missing
// data rather than as a wrong number.
//
// EVERY rejection logs (no dedup). A previous module-scoped Set deduped by
// (field, direction) but leaked across deal ingests in long-running
// processes — the first deal would log, every subsequent deal with the same
// problem would be silent. Per principle 3, log noise on a problematic
// ingest is a recoverable cost; lost diagnostic visibility is not.

interface Bound {
  min?: number;
  max?: number;
  description: string;
}

const BOUNDS: Record<string, Bound> = {
  // Per-loan par balance in deal currency. CLO loans are typically €100k–€100M
  // (denomination-side floor: €1M; we set €1k to catch 1,000× mis-parse on a
  // €1M loan without false-positive risk on legitimate small balances).
  par_balance: {
    min: 1_000,
    description: "par balance in deal currency (CLO loans typically ≥ €100k)",
  },
  // Market value as percent of par. Real range 0–110 (distressed loans, recent
  // origination at small premium). 200 catches an absolute-vs-percent shape
  // confusion (a €1M MV recorded as "1000000" instead of "98.5").
  market_value: {
    max: 200,
    description: "market value as percent of par (typical 0-110)",
  },
  // Coupon / all-in / index rate as percent. Real range 1–15% (EURIBOR-driven
  // floating). 50 catches a 100× locale mis-parse (e.g. "3,25" parsed as 325).
  rate_pct: {
    max: 50,
    description: "coupon / index / all-in rate as percent (typical 1-15)",
  },
};

export function validateMagnitude(
  field: keyof typeof BOUNDS,
  value: number | null,
): number | null {
  if (value == null) return value;
  const bound = BOUNDS[field];
  if (!bound) return value;

  const belowMin = bound.min != null && value < bound.min;
  const aboveMax = bound.max != null && value > bound.max;
  if (!belowMin && !aboveMax) return value;

  const direction = belowMin ? "below" : "above";
  const limit = belowMin ? `min=${bound.min}` : `max=${bound.max}`;
  console.warn(
    `[magnitude-validator] ${field}=${value} ${direction} ${limit} ` +
      `(${bound.description}). Likely parser failure — value rejected (null).`,
  );
  return null;
}
