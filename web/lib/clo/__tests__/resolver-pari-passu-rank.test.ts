/**
 * Resolver invariant: pari-passu tranches share `seniorityRank`.
 *
 * Class A-1 + A-2 (or B-1 + B-2, etc.) bucket to the same letter rank and
 * therefore receive the same dense `seniorityRank`. The engine's pari-passu
 * absorption — both pre-acceleration (`projection.ts` interest + principal
 * waterfalls) and post-acceleration (`runPostAccelerationWaterfall`) — keys
 * off equal `seniorityRank` to split shortfalls pro-rata. Without equal
 * ranks the absorption code path never fires.
 *
 * Marker uses three tranches (the pari-passu pair plus a non-pari-passu
 * Class B) so the assertion discriminates the pari-passu collapse from any
 * idx+1 / monotone scheme that would coincidentally produce the same output
 * on a two-element input.
 */

import { describe, it, expect } from "vitest";
import { resolveWaterfallInputs } from "@/lib/clo/resolver";
import type { ExtractedConstraints } from "@/lib/clo/types";

describe("resolver — pari-passu seniorityRank assignment (PPM-derived path)", () => {
  it("A-1 and A-2 share rank 1; B is rank 2", () => {
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
      { className: "Class A-2", seniorityRank: 1 },
      { className: "Class B",   seniorityRank: 2 },
    ]);
  });
});
