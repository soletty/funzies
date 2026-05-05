/** KI-29 — long-dated valuation static-scalar banner.
 *
 *  Mechanically bound to the residual: if `resolved.longDatedObligationHaircut
 *  > 0` the deal carries trustee-reported long-dated positions that the
 *  engine values via the static scalar (forward-period valuation rule
 *  not yet modeled). Banner surfaces this to the partner so a non-zero
 *  long-dated haircut on a stress projection does not silently ride a
 *  stale value as the original cohort amortizes / matures / defaults.
 *
 *  On Euro XV today the banner does not render (scalar = 0). When the
 *  long-dated forward-period valuation rule is implemented (per-deal
 *  extraction + per-position dynamic valuation), this file is deleted
 *  in the same change as the KI-29 closure; the disclosure-bijection
 *  scanner enforces the lockstep. */

import type { ResolvedDealData } from "@/lib/clo/resolver-types";
import { useFormatAmount } from "./CurrencyContext";

export function LongDatedStaticBanner({ resolved }: { resolved: ResolvedDealData | null | undefined }) {
  const formatAmount = useFormatAmount();
  if (resolved == null) return null;
  if (resolved.longDatedObligationHaircut <= 0) return null;
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
      <strong>Long-dated valuation held static — KI-29 residual.</strong>{" "}
      Trustee reports {formatAmount(resolved.longDatedObligationHaircut)} of
      long-dated obligation haircut at T=0. Per-position classification
      (loan.maturityDate &gt; deal.maturityDate) is modeled forward, but the
      per-deal valuation rule (e.g. Ares XV: 5% of APB cap, excess deemed
      zero; other PPMs vary) is not yet extracted — the haircut continues
      to ride the trustee&apos;s T=0 scalar at every period. Bias direction:
      runoff of the original cohort over-states haircut as positions
      amortize. See KI-29 in the known-issues ledger.
    </div>
  );
}
