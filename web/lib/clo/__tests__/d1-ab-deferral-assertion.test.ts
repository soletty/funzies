/**
 * D1 — Class A/B deferral runtime assertion.
 *
 * PPM: Class A and Class B non-payment of interest is an Event of Default,
 * not a deferral (unlike C/D/E/F which PIK deferred interest). A tranche
 * misconfigured with `isDeferrable: true` on A or B would silently compound
 * deferred interest onto a non-deferrable balance and produce materially
 * wrong projections.
 *
 * D1 is a fail-fast guard at `runProjection` entry. These tests exercise it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runProjection } from "@/lib/clo/projection";
import { buildFromResolved, DEFAULT_ASSUMPTIONS } from "@/lib/clo/build-projection-inputs";
import type { ResolvedDealData } from "@/lib/clo/resolver-types";

const FIXTURE_PATH = join(__dirname, "fixtures", "euro-xv-q1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  resolved: ResolvedDealData;
};

describe("D1 — A/B deferral runtime assertion", () => {
  it('"Class A" with isDeferrable=true throws', () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/Class A|isDeferrable=true/);
  });

  it('"Class B-1" with isDeferrable=true throws', () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class B-1" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/B-1|isDeferrable=true/);
  });

  it('bare "A" with isDeferrable=true throws (prefix-strip matches)', () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, className: "A", isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true/);
  });

  it('"Class C" with isDeferrable=true does NOT throw (C is PIK-deferrable)', () => {
    const ok: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class C" ? { ...t, isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(ok, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).not.toThrow();
  });

  it("Euro XV base fixture runs cleanly (no A/B incorrectly marked deferrable)", () => {
    const inputs = buildFromResolved(fixture.resolved, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).not.toThrow();
  });

  it("lowercase 'class a' still trips the guard (case-insensitive match)", () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, className: "class a", isDeferrable: true } : t,
      ),
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    expect(() => runProjection(inputs)).toThrow(/isDeferrable=true/);
  });
});
