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

  // KI-54 marker. D1 is name-based, not rank-based: a senior tranche named
  // with a non-A/B prefix (e.g. "K-1", "X-1", "Mezz-1") and marked
  // isDeferrable=true currently slips through the guard, even though
  // structurally it IS the senior debt tranche (rank-1, non-income-note).
  // The bug shape is identical to the (now-closed) string-match-on-"Class A"
  // EoD denominator pattern. Fix is to switch D1 from prefix-letter check
  // to seniorityRank predicate.
  //
  // Marker semantics: this assertion documents the CURRENT (wrong) behavior
  // — non-A/B senior with isDeferrable=true does NOT throw. When the
  // rank-based fix lands, flip to .toThrow() and update the surrounding
  // tests / fixtures that work around D1 by name (see KI-54 path-to-close).
  it("KI-54: non-A/B-named senior with isDeferrable=true silently passes D1 (currently wrong)", () => {
    const bad: ResolvedDealData = {
      ...fixture.resolved,
      tranches: fixture.resolved.tranches.map(t =>
        t.className === "Class A" ? { ...t, className: "K-1", isDeferrable: true } : t,
      ),
      // Re-point any OC/IC trigger that referenced "Class A" so the rest of
      // the projection runs without unrelated errors masking what we're
      // pinning here.
      ocTests: fixture.resolved.ocTests?.map(o =>
        o.className === "Class A" ? { ...o, className: "K-1" } : o,
      ),
      icTests: fixture.resolved.icTests?.map(i =>
        i.className === "Class A" ? { ...i, className: "K-1" } : i,
      ),
      eventOfDefaultTest: fixture.resolved.eventOfDefaultTest
        ? { ...fixture.resolved.eventOfDefaultTest }
        : fixture.resolved.eventOfDefaultTest,
    };
    const inputs = buildFromResolved(bad, DEFAULT_ASSUMPTIONS);
    // CURRENT (wrong) behavior: D1 doesn't fire because "K" is not A/B.
    // PPM-correct behavior: structurally the senior IS rank-1 non-income-note
    // and is non-deferrable per PPM regardless of label; engine should throw.
    expect(() => runProjection(inputs)).not.toThrow();
  });
});
