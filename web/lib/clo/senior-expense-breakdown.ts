/**
 * KI-21 Scope 2 closure — canonical representation of per-period senior
 * expense amounts.
 *
 * The IC numerator and the cash-flow waterfall in `projection.ts` both
 * consume THIS object instead of re-implementing the sum / iteration. Adding
 * a new field here propagates to BOTH consumers automatically — drift-by-
 * construction impossible.
 *
 * Same template as D4's `pool-metrics.ts` extraction (which collapsed three
 * parallel quality-metric implementations).
 */

/** Per-period senior expenses, broken out per PPM step. */
export interface SeniorExpenseBreakdown {
  /** PPM step (A)(i) — issuer taxes. */
  taxes: number;
  /** PPM step (A)(ii) — issuer profit (fixed absolute € per period). */
  issuerProfit: number;
  /** PPM step (B) — trustee fee, CAPPED portion. Overflow above cap routes
   *  to `trusteeOverflow` below. */
  trusteeCapped: number;
  /** PPM step (C) — admin expenses, CAPPED portion. Overflow above cap
   *  routes to `adminOverflow` below. */
  adminCapped: number;
  /** PPM step (E) — senior management fee. NOT capped. */
  seniorMgmt: number;
  /** PPM step (F) — hedge payments. NOT capped. */
  hedge: number;
  /** PPM step (Y) — trustee fee overflow above cap, paid from residual
   *  interest AFTER tranche interest + sub mgmt fee. Zero when capped
   *  request fits entirely under the cap. */
  trusteeOverflow: number;
  /** PPM step (Z) — admin expense overflow above cap. */
  adminOverflow: number;
}

/** Sum of the CAPPED + non-capped portion of senior expenses that flows
 *  through the IC numerator + the top of the `availableInterest -=` chain.
 *  Excludes Y/Z overflow (those pay from residual interest, not from the
 *  top of the waterfall). */
export function sumSeniorExpensesPreOverflow(x: SeniorExpenseBreakdown): number {
  return x.taxes + x.issuerProfit + x.trusteeCapped + x.adminCapped + x.seniorMgmt + x.hedge;
}

/** Deduct the pre-overflow senior expenses from an `available` cash pool, in
 *  strict PPM order (A.i → A.ii → B → C → E → F). Returns the remaining
 *  available cash AND the per-bucket paid amounts (which match the input
 *  values 1:1 when `available` is sufficient, else truncate when cash runs
 *  out in an unusual distress scenario).
 *
 *  The `paid` return matches the breakdown shape so callers can drive
 *  stepTrace emission from a single object. CALLERS MUST CONSUME `paid`
 *  for partner-visible trace emission — emitting the input `x` (requested)
 *  overstates payment under stress and breaks the invariant
 *  `Σ stepTrace.*(interest waterfall) ≤ interestCollected`. The two return
 *  keys are asymmetric on purpose: `remainingAvailable` is the cash-flow
 *  output (consumed by the next waterfall step); `paid` is the trace
 *  output (consumed by `PeriodStepTrace`). The loud name is so the next
 *  reviewer notices if a destructure picks up `remainingAvailable` and
 *  silently drops `paid`.
 *
 *  Under normal-mode inputs (`available >= sum`), returns `available − sum`
 *  AND `paid` equals the input breakdown field-by-field (with overflow
 *  fields ZERO — overflow is computed separately on residual interest
 *  AFTER tranche interest, a different code path).
 */
export function applySeniorExpensesToAvailable(
  x: SeniorExpenseBreakdown,
  available: number,
): { remainingAvailable: number; paid: SeniorExpenseBreakdown } {
  let remaining = available;

  const taxesPaid = Math.min(x.taxes, remaining);
  remaining -= taxesPaid;
  const issuerProfitPaid = Math.min(x.issuerProfit, remaining);
  remaining -= issuerProfitPaid;
  const trusteeCappedPaid = Math.min(x.trusteeCapped, remaining);
  remaining -= trusteeCappedPaid;
  const adminCappedPaid = Math.min(x.adminCapped, remaining);
  remaining -= adminCappedPaid;
  const seniorMgmtPaid = Math.min(x.seniorMgmt, remaining);
  remaining -= seniorMgmtPaid;
  const hedgePaid = Math.min(x.hedge, remaining);
  remaining -= hedgePaid;

  return {
    remainingAvailable: remaining,
    paid: {
      taxes: taxesPaid,
      issuerProfit: issuerProfitPaid,
      trusteeCapped: trusteeCappedPaid,
      adminCapped: adminCappedPaid,
      seniorMgmt: seniorMgmtPaid,
      hedge: hedgePaid,
      trusteeOverflow: 0,
      adminOverflow: 0,
    },
  };
}
