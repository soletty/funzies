/**
 * Canonical representation of per-period senior expense amounts.
 *
 * Three engine sites consume this shape directly: the normal-mode period
 * loop (IC numerator + cash-flow waterfall), the post-acceleration
 * executor, and the T=0 initialState.icTests construction. Adding a new
 * field here propagates to all consumers automatically — drift-by-
 * construction impossible.
 *
 * Same template as `pool-metrics.ts` (which collapsed three parallel
 * quality-metric implementations).
 */

/** Per-period senior expenses, broken out per PPM step. */
export interface SeniorExpenseBreakdown {
  /** PPM step (A)(i) — issuer taxes. */
  taxes: number;
  /** PPM step (A)(ii) — issuer profit (fixed absolute € per period). */
  issuerProfit: number;
  /** PPM step (B) — trustee fee, CAPPED portion. Overflow above cap routes
   *  to `trusteeOverflow` below.
   *
   *  Under post-acceleration the Senior Expenses Cap does not apply (PPM
   *  10(b) proviso ll. 14167-14177), so the post-acceleration executor
   *  passes the FULL requested trustee fee here and zero in
   *  `trusteeOverflow`. The field name describes PPM step position (B),
   *  not literal cap-state.
   *
   *  At T=0 (IC initialState construction) the cap is also not exercised
   *  — that site feeds only the IC numerator, not the cash-flow chain —
   *  so the T=0 constructor passes the full requested trustee fee here
   *  with zero `trusteeOverflow`. This is NOT PPM 10(b) suppression; it
   *  is IC-definition semantics: the IC numerator uses contractual-
   *  requested amounts for dimensional symmetry with the contractual
   *  interest denominator (see comment block above the normal-mode
   *  `seniorExpenseBreakdown` construction in `projection.ts`). */
  trusteeCapped: number;
  /** PPM step (C) — admin expenses, CAPPED portion. Overflow above cap
   *  routes to `adminOverflow` below.
   *
   *  Same accel-mode caveat as `trusteeCapped`: under PPM 10(b) the cap
   *  is suppressed, so the post-acceleration executor passes the FULL
   *  requested admin fee here and zero in `adminOverflow`.
   *
   *  Same T=0 caveat as `trusteeCapped`: the T=0 IC-initialState
   *  constructor passes the full requested admin fee here with zero
   *  `adminOverflow`, because that site feeds only the IC numerator and
   *  the contractual-requested convention applies. */
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
