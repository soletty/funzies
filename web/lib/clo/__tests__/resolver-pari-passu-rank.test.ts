/**
 * KI-57 marker test — locks current resolver behavior of assigning DISTINCT
 * `seniorityRank` values to pari-passu tranches.
 *
 * Pari-passu tranches (e.g., split A-1/A-2 senior, or Euro XV's B-1/B-2
 * mezzanine pair) share waterfall priority. The engine at
 * `projection.ts:748-755` explicitly groups by equal `seniorityRank` for
 * pari-passu absorption, but the resolver's PPM-derived path at
 * `resolver.ts:286` assigns rank from array index after sort, so two A-class
 * entries always come out as ranks 1 and 2 — never equal. The pari-passu
 * absorption code path never fires.
 *
 * When the bug is fixed (resolver detects pari-passu via class-name stem
 * and assigns equal ranks), this assertion FLIPS from `[1, 2]` to `[1, 1]`
 * in the same PR that closes KI-57. The flip is the closure signal.
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints } from "@/lib/clo/types";

describe("resolver — KI-57 pari-passu seniorityRank assignment (PPM-derived path)", () => {
  it("assigns SEQUENTIAL ranks [1, 2, 3] across pari-passu A-1 + A-2 + B (locks current bug)", () => {
    // Three tranches included so the marker discriminates idx+1 from any
    // other monotone scheme that would happen to produce the same output
    // on a two-element input. The pari-passu pair is A-1 + A-2; on close
    // they should both be rank 1 and B should be rank 2 → assertion
    // flips to `[1, 1, 2]`. Until then, idx+1 produces `[1, 2, 3]`.
    const constraints = {
      deal: null,
      keyDates: null,
      payFreqMonths: null,
      feeSchedule: { fees: [] },
      ocTests: { tests: [] },
      icTests: { tests: [] },
      concentrations: { limits: [] },
      waterfall: { clauses: [] },
      ccc: { bucketLimitPct: null, valuationPct: null, valuationMode: null },
      waterfallType: null,
      capitalStructure: [
        { class: "Class A-1", principalAmount: "200000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        { class: "Class A-2", principalAmount: "100000000", spread: "EURIBOR + 130", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
        { class: "Class B",   principalAmount: "50000000",  spread: "EURIBOR + 200", spreadBps: null, isSubordinated: false, deferrable: false, rateType: "Floating" },
      ],
    } as unknown as ExtractedConstraints;

    const { resolved } = resolveWaterfallInputs(
      constraints,
      null,
      [],
      [],
      [],
    );

    const ranks = resolved.tranches.map(t => ({ className: t.className, seniorityRank: t.seniorityRank }));
    expect(ranks).toEqual([
      { className: "Class A-1", seniorityRank: 1 },
      { className: "Class A-2", seniorityRank: 2 },
      { className: "Class B",   seniorityRank: 3 },
    ]);
  });
});
