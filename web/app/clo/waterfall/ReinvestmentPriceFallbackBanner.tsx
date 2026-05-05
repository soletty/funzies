/** Reinvestment-price par-fallback transparency banner.
 *
 *  Mechanically bound: when `result.initialState.reinvestmentPriceSource`
 *  is `"par_fallback"`, the engine had no priced positions in the pool
 *  to derive a par-weighted reinvestment price from, so it silently
 *  defaulted to par (100). This disables the price-aware reinvestment
 *  math (no cure leverage, no discount-obligation classification on
 *  synthesised loans), which can materially under-state cure cash sizing
 *  and over-state OC headroom on a deal still in reinvestment.
 *
 *  On Euro XV today the banner does not render (`pool_was_derived`).
 *  Renders only on a deal whose SDF / Intex pool ingest produced no
 *  current-price column for any active position. */

import type { ProjectionResult } from "@/lib/clo/projection";

export function ReinvestmentPriceFallbackBanner({
  result,
}: {
  result: ProjectionResult | null | undefined;
}) {
  if (result == null) return null;
  if (result.initialState.reinvestmentPriceSource !== "par_fallback") return null;
  return (
    <div
      style={{
        padding: "0.6rem 0.9rem",
        marginBottom: "0.75rem",
        background: "var(--color-warning-bg, rgba(255, 193, 7, 0.08))",
        border: "1px solid var(--color-warning-border, rgba(255, 193, 7, 0.4))",
        borderRadius: "4px",
        fontSize: "0.72rem",
        lineHeight: 1.45,
      }}
    >
      <strong>Reinvestment price defaulted to par (100c).</strong>{" "}
      The pool ingest produced no current-price data for any active
      position, so the engine could not derive a pool-weighted-average
      reinvestment price and fell back to par. The price-aware
      reinvestment cure math (cure leverage at non-par prices,
      discount-obligation classification on synthesised loans) is
      effectively disabled for this projection. On a deal still in
      its reinvestment period whose underlying market is trading
      sub-par, OC cure cash sizing is over-stated and equity
      distributions are under-stated. Override the slider with the
      partner&apos;s assumed reinvestment price, or fix the upstream
      pricing extraction.
    </div>
  );
}
