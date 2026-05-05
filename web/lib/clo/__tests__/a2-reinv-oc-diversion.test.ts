/**
 * A2 — Reinvestment OC Test diversion: lesser-of, not fixed %.
 *
 * PPM (`raw.constraints.reinvestmentOcTest.diversionAmount`):
 *   "Interest diversion (LESSER OF 50% of residual Interest Proceeds or
 *    cure amount) during Reinvestment Period."
 *
 * Before A2 ship: engine diverted a fixed 50% of residual IP whenever the
 * reinvestment OC test failed — over-diverts on small breaches, under-states
 * equity distributions.
 *
 * These tests exercise the pure `computeReinvOcDiversion` helper directly;
 * they're first-principles arithmetic assertions, independent of the N1
 * harness frame (which is structurally Q2-vs-Q1 per KI-12a).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeReinvOcDiversion, runProjection } from "@/lib/clo/projection";
import { buildFromResolved, DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
};

describe("A2 — computeReinvOcDiversion (lesser-of)", () => {
  it("small breach → diverts the cure amount, not the 50% cap", () => {
    // OC 103.5% vs 103.74% trigger; shallow breach. Debt €350M, numerator
    // €362.25M (103.5%). Cure needs to reach trigger × debt = €363.09M →
    // numerator must grow by €0.84M. Available interest €10M, 50% cap =
    // €5M — much larger than the €0.84M cure, so engine should divert the
    // cure amount (€0.84M).
    const availableInterest = 10_000_000;
    const reinvOcDebt = 350_000_000;
    const ocNumerator = 362_250_000; // 103.5%
    const triggerLevel = 103.74;
    const diversionPct = 50;
    const { cashDiverted } = computeReinvOcDiversion(
      availableInterest,
      ocNumerator,
      reinvOcDebt,
      triggerLevel,
      diversionPct,
    );
    const expectedCure = (triggerLevel / 100) * reinvOcDebt - ocNumerator;
    expect(cashDiverted).toBeCloseTo(expectedCure, 2);
    // Guard: diversion must be strictly less than the 50% cap — otherwise
    // the test isn't actually exercising the cure-capped branch.
    expect(cashDiverted).toBeLessThan(availableInterest * (diversionPct / 100));
  });

  it("deep breach → diverts the 50% cap, not the (larger) cure amount", () => {
    // OC 100% vs 103.74% trigger. Debt €350M, numerator €350M. Cure needs
    // to reach €363.09M → numerator must grow by €13.09M. Available interest
    // €10M, 50% cap = €5M. Cure (€13.09M) exceeds cap → engine diverts €5M.
    const availableInterest = 10_000_000;
    const reinvOcDebt = 350_000_000;
    const ocNumerator = 350_000_000; // 100%
    const triggerLevel = 103.74;
    const diversionPct = 50;
    const { cashDiverted } = computeReinvOcDiversion(
      availableInterest,
      ocNumerator,
      reinvOcDebt,
      triggerLevel,
      diversionPct,
    );
    const expectedCap = availableInterest * (diversionPct / 100);
    expect(cashDiverted).toBeCloseTo(expectedCap, 2);
    // Guard: cure must exceed the cap — otherwise this isn't the cap-capped branch.
    const cureAmount = (triggerLevel / 100) * reinvOcDebt - ocNumerator;
    expect(cureAmount).toBeGreaterThan(expectedCap);
  });

  it("test passing (actual ≥ trigger) → zero diversion", () => {
    // OC 105.4% vs 103.74%. Euro XV's current state.
    const { cashDiverted, parBought } = computeReinvOcDiversion(
      10_000_000,
      368_900_000,
      350_000_000,
      103.74,
      50,
    );
    expect(cashDiverted).toBe(0);
    expect(parBought).toBe(0);
  });

  it("zero available interest → zero diversion (no infinite loop)", () => {
    expect(computeReinvOcDiversion(0, 350_000_000, 350_000_000, 103.74, 50).cashDiverted).toBe(0);
    expect(computeReinvOcDiversion(-1, 350_000_000, 350_000_000, 103.74, 50).cashDiverted).toBe(0);
  });

  it("zero rated debt → zero diversion (no divide-by-zero)", () => {
    expect(computeReinvOcDiversion(10_000_000, 0, 0, 103.74, 50).cashDiverted).toBe(0);
  });

  it("KI-33 — above-threshold purchase yields leveraged cure (cash < numeratorGain)", () => {
    // OC 103.5% vs 103.74% trigger; cure needs €0.84M of numerator gain.
    // Above threshold (95% > 80% floating threshold) → cash needed = gain × 95/100 = €0.798M.
    // parBought = cash × 100/95 ≈ €0.84M (matches numerator gain).
    const reinvOcDebt = 350_000_000;
    const ocNumerator = 362_250_000;
    const { cashDiverted, parBought } = computeReinvOcDiversion(
      10_000_000,
      ocNumerator,
      reinvOcDebt,
      103.74,
      50,
      95.0,
      false, // above threshold
    );
    const numeratorGain = (103.74 / 100) * reinvOcDebt - ocNumerator;
    expect(cashDiverted).toBeCloseTo(numeratorGain * 0.95, 2);
    expect(parBought).toBeCloseTo(numeratorGain, 2);
    expect(cashDiverted).toBeLessThan(numeratorGain); // leverage check
  });

  it("KI-33 — sub-threshold purchase yields no cure leverage (cash = numeratorGain)", () => {
    // Same OC, but purchase at 75% < 80% floating threshold → discount obligation.
    // Cash = numeratorGain (no leverage); parBought = cash × 100/75.
    const reinvOcDebt = 350_000_000;
    const ocNumerator = 362_250_000;
    const { cashDiverted, parBought } = computeReinvOcDiversion(
      10_000_000,
      ocNumerator,
      reinvOcDebt,
      103.74,
      50,
      75.0,
      true, // sub threshold
    );
    const numeratorGain = (103.74 / 100) * reinvOcDebt - ocNumerator;
    expect(cashDiverted).toBeCloseTo(numeratorGain, 2);
    expect(parBought).toBeCloseTo(numeratorGain * (100 / 75), 2);
  });
});

describe("A2 — integration: state mutations fire on failing path", () => {
  it("inflated trigger forces reinv OC to fail → stepTrace.reinvOcDiversion > 0 and pool par grows", () => {
    // Mutate the resolved fixture in-memory: push the reinvestmentOcTrigger up
    // to 200% so Euro XV's current ~105% fails. Everything else unchanged.
    const mutatedResolved: ResolvedDealData = {
      ...fixture.resolved,
      reinvestmentOcTrigger: fixture.resolved.reinvestmentOcTrigger
        ? { ...fixture.resolved.reinvestmentOcTrigger, triggerLevel: 200 }
        : null,
    };
    const inputs = buildFromResolved(mutatedResolved, DEFAULT_ASSUMPTIONS);
    const result = runProjection(inputs);
    expect(result.periods.length).toBeGreaterThan(0);
    const p1 = result.periods[0];
    // Diversion must fire and be positive.
    expect(p1.stepTrace.reinvOcDiversion).toBeGreaterThan(0);
    // Diversion capped at 50% of pre-diversion available interest — we don't
    // know availableInterest here exactly, but it must be > 0 since there's
    // interest collections on €493M × ~3% × 0.25 ≈ €3.7M.
    expect(p1.stepTrace.reinvOcDiversion).toBeLessThan(10_000_000);
  });
});
