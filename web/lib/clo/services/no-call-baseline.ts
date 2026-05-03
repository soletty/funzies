/**
 * No-call baseline derivation — post-v6 plan §9 #11 / decision-log entry S.
 *
 * Centralizes the canonical "no-call" projection-input derivation. Two
 * helpers:
 *
 *  - `deriveNoCallBaseInputs(inputs)`: strips the entry-price slider state
 *    AND pins `callMode: "none"` / `callDate: null`. The result represents
 *    the partner-facing "held to legal final, no call" baseline that drives
 *    the canonical Forward IRR rows, Fair Value @ hurdle anchors, and the
 *    inception-IRR mark-to-model `forwardDistributions`. Independent of
 *    user slider state.
 *
 *  - `applyOptionalRedemptionCall(noCallBase, callDate)`: overlays the
 *    optional-redemption call at `callDate` with par mode. The result
 *    represents the canonical "with call" alternative used in side-by-side
 *    displays (post-v6 plan §9 #5 / option (d)).
 *
 * Why centralize: the duplicated inline derivation in `ProjectionModel.tsx`
 * was the proximate cause of the merge-blocker 1 spot-fix scope gap —
 * `forwardIrrTriple` / `fairValues` / `inceptionIrr` got the no-call pin
 * but `entryPriceSweep` and the `@ custom` row didn't. Centralizing makes
 * "find all consumers of the no-call baseline" a single grep, and keeps
 * the no-call semantic in one place.
 */

import { InvalidCallDateError, type ProjectionInputs } from "../projection";

export function deriveNoCallBaseInputs(
  inputs: ProjectionInputs & { equityEntryPrice?: number },
): ProjectionInputs {
  const { equityEntryPrice: _strip, ...rest } = inputs;
  void _strip;
  return { ...rest, callMode: "none", callDate: null };
}

/**
 * Bounds against which `applyOptionalRedemptionCall` validates `callDate`.
 *
 * `currentDate` is required (a past callDate is always refused).
 * `nonCallPeriodEnd` is required as `string | null`: when set the function
 * refuses `callDate < nonCallPeriodEnd`; when null the gate is skipped
 * (NCP not known → cannot enforce, which is documented as the synthetic-
 * fixture path; production-deal NCP is gated to non-null at the resolver
 * layer). Forcing the caller to pass `null` explicitly rather than
 * omitting the field makes "I considered the NCP and it's truly absent"
 * distinguishable from "I forgot to wire it through."
 */
export interface OptionalRedemptionBounds {
  currentDate: string;
  nonCallPeriodEnd: string | null;
}

/**
 * Overlay an optional-redemption call onto a no-call baseline.
 *
 * Validates `callDate` against `bounds` before constructing the inputs.
 * Throws `InvalidCallDateError` on violation (the UI catches and renders a
 * non-dismissible inline message; the engine's pre-projection guard is a
 * backstop for hand-constructed inputs that bypass this service).
 */
export function applyOptionalRedemptionCall(
  noCallBase: ProjectionInputs,
  callDate: string,
  bounds: OptionalRedemptionBounds,
): ProjectionInputs {
  if (callDate < bounds.currentDate) {
    throw new InvalidCallDateError("past", callDate, bounds.currentDate, bounds.nonCallPeriodEnd);
  }
  if (bounds.nonCallPeriodEnd != null && callDate < bounds.nonCallPeriodEnd) {
    throw new InvalidCallDateError("preNcp", callDate, bounds.currentDate, bounds.nonCallPeriodEnd);
  }
  return {
    ...noCallBase,
    callMode: "optionalRedemption",
    callDate,
    callPriceMode: "par",
    callPricePct: 100,
  };
}
