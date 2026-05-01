/**
 * KI-58 — DATA INCOMPLETE banner ↔ blocking-warning bijection.
 *
 * Mechanically binds the UI's banner-row source to the engine-side
 * `buildFromResolved` gate. The bijection has three legs:
 *
 *  1. `selectBlockingWarnings` is the single predicate. Tested directly.
 *  2. `buildFromResolved` throws `IncompleteDataError` with exactly the
 *     warnings `selectBlockingWarnings` returns — no more, no less.
 *  3. `ProjectionModel.tsx` (the partner-facing surface) drives its
 *     banner from `selectBlockingWarnings`, never from a divergent
 *     inline `.filter(w => w.blocking ...)`. AST-asserted.
 *
 * If any leg breaks, the bijection breaks: the gate could refuse the
 * projection while the banner shows nothing (silent refusal — partner
 * sees an empty page with no explanation), or the banner could enumerate
 * warnings that the gate doesn't actually block on (false alarm). Both
 * are partner-visible failures the umbrella exists to prevent.
 */

import { describe, expect, it } from "vitest";
import { Node, Project } from "ts-morph";
import { resolve } from "path";
import {
  buildFromResolved,
  EMPTY_RESOLVED,
  DEFAULT_ASSUMPTIONS,
  IncompleteDataError,
  selectBlockingWarnings,
} from "../build-projection-inputs";
import type { ResolutionWarning } from "../resolver-types";

const TSCONFIG_PATH = resolve(__dirname, "../../../tsconfig.json");
const PROJECTION_MODEL_PATH = resolve(
  __dirname,
  "../../../app/clo/waterfall/ProjectionModel.tsx",
);

// Mirror architecture-boundary.test.ts: instantiate the ts-morph Project
// once at module scope. Each `new Project(...)` loads + type-checks the
// entire TS project (multi-second cost); creating it inside each `it()`
// would multiply that cost by the number of AST tests for no benefit.
const sharedProject = new Project({ tsConfigFilePath: TSCONFIG_PATH });
const HELPER_PATH = resolve(__dirname, "../build-projection-inputs.ts");

interface DivergentFilterOffender {
  file: string;
  line: number;
  text: string;
}

/**
 * Walk a source file's AST and surface every `<expr>.filter((<arg>) => ... .blocking ...)`
 * call. Used to catch divergent re-implementations of `selectBlockingWarnings`
 * outside the canonical helper file. Walks the AST (not the source text) so
 * documentation comments mentioning `.filter(w => w.blocking)` don't false-fire.
 *
 * Known limitation: only catches arrow / function expressions inline. A
 * `.filter(namedPredicate)` whose body references `.blocking` is not detected.
 * No production code does this today; if it ever does, KI-59 step 4 (promote
 * `blocking` to required at the type level) closes the gap structurally.
 */
function findDivergentBlockingFilters(sf: ReturnType<Project["getSourceFile"]>): DivergentFilterOffender[] {
  if (!sf) return [];
  const filePath = sf.getFilePath();
  const offenders: DivergentFilterOffender[] = [];
  sf.forEachDescendant((d) => {
    if (!Node.isCallExpression(d)) return;
    const callee = d.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return;
    if (callee.getName() !== "filter") return;
    const args = d.getArguments();
    if (args.length === 0) return;
    const arg = args[0];
    if (!Node.isArrowFunction(arg) && !Node.isFunctionExpression(arg)) return;
    let bodyHasBlocking = false;
    arg.forEachDescendant((bd) => {
      if (Node.isPropertyAccessExpression(bd) && bd.getName() === "blocking") {
        bodyHasBlocking = true;
      }
    });
    if (bodyHasBlocking) {
      offenders.push({
        file: filePath.replace(/^.*\/web\//, "web/"),
        line: d.getStartLineNumber(),
        text: d.getText().slice(0, 120),
      });
    }
  });
  return offenders;
}

describe("KI-58 — selectBlockingWarnings (the single predicate)", () => {
  it("returns empty when input is empty", () => {
    expect(selectBlockingWarnings([])).toEqual([]);
  });

  it("returns empty when no warning carries blocking: true", () => {
    const ws: ResolutionWarning[] = [
      { field: "a", message: "x", severity: "warn" },
      { field: "b", message: "y", severity: "error" },
      { field: "c", message: "z", severity: "info" },
      { field: "d", message: "w", severity: "error", blocking: false },
    ];
    expect(selectBlockingWarnings(ws)).toEqual([]);
  });

  it("returns exactly the blocking subset, preserving order", () => {
    const ws: ResolutionWarning[] = [
      { field: "a", message: "x", severity: "warn" },
      { field: "b", message: "y", severity: "error", blocking: true },
      { field: "c", message: "z", severity: "info" },
      { field: "d", message: "w", severity: "warn", blocking: true },
      { field: "e", message: "v", severity: "error", blocking: false },
    ];
    const out = selectBlockingWarnings(ws);
    expect(out.map((w) => w.field)).toEqual(["b", "d"]);
  });

  it("treats severity as orthogonal to blocking (warn+blocking IS blocking)", () => {
    const ws: ResolutionWarning[] = [
      { field: "warn-blocking", message: "x", severity: "warn", blocking: true },
      { field: "error-advisory", message: "y", severity: "error", blocking: false },
    ];
    const out = selectBlockingWarnings(ws);
    expect(out.map((w) => w.field)).toEqual(["warn-blocking"]);
  });

  it("uses strict equality on `=== true` — only literal boolean true blocks", () => {
    // Locks the runtime contract: TypeScript catches non-boolean values in
    // the `blocking` field at compile time, but this test exists to prevent
    // a future change to the predicate (e.g. truthy check) that would make
    // `blocking: 1` or `blocking: "yes"` accidentally block. The strict
    // equality is what guarantees `undefined` and `false` consistently
    // bypass — which is the contract the gate, the banner, and the AST
    // scan all rely on.
    // We bypass TS via a cast solely to construct the runtime values.
    const ws: ResolutionWarning[] = [
      { field: "truthy-non-bool", message: "x", severity: "error", blocking: 1 as unknown as boolean },
      { field: "string-true", message: "y", severity: "error", blocking: "true" as unknown as boolean },
      { field: "real-true", message: "z", severity: "error", blocking: true },
    ];
    expect(selectBlockingWarnings(ws).map((w) => w.field)).toEqual(["real-true"]);
  });
});

describe("KI-58 — buildFromResolved gate uses the same predicate", () => {
  it("does not throw when no warnings provided", () => {
    expect(() =>
      buildFromResolved(EMPTY_RESOLVED, DEFAULT_ASSUMPTIONS),
    ).not.toThrow();
  });

  it("does not throw when warnings exist but none are blocking", () => {
    const ws: ResolutionWarning[] = [
      { field: "a", message: "advisory", severity: "warn" },
      { field: "b", message: "advisory", severity: "error" },
    ];
    expect(() =>
      buildFromResolved(EMPTY_RESOLVED, DEFAULT_ASSUMPTIONS, ws),
    ).not.toThrow();
  });

  it("throws IncompleteDataError when a blocking warning exists", () => {
    const ws: ResolutionWarning[] = [
      {
        field: "fees.seniorFeePct",
        message: "missing",
        severity: "error",
        blocking: true,
      },
    ];
    expect(() =>
      buildFromResolved(EMPTY_RESOLVED, DEFAULT_ASSUMPTIONS, ws),
    ).toThrow(IncompleteDataError);
  });

  it("error.errors equals selectBlockingWarnings(input) — exact bijection", () => {
    const ws: ResolutionWarning[] = [
      { field: "a", message: "advisory", severity: "warn" },
      { field: "b", message: "missing", severity: "error", blocking: true },
      { field: "c", message: "advisory", severity: "info" },
      { field: "d", message: "missing", severity: "warn", blocking: true },
    ];
    try {
      buildFromResolved(EMPTY_RESOLVED, DEFAULT_ASSUMPTIONS, ws);
      throw new Error("expected IncompleteDataError to be thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IncompleteDataError);
      const err = e as IncompleteDataError;
      expect(err.errors).toEqual(selectBlockingWarnings(ws));
    }
  });
});

describe("KI-58 — UI surfaces drive the banner from the same predicate", () => {
  it("ProjectionModel.tsx imports selectBlockingWarnings (no inline replacement)", () => {
    // Distinct from the divergent-filter scan below: this confirms the file
    // actually wires the helper in. The cross-file scan would pass if a UI
    // had no `.blocking` filter AT ALL (and rendered no banner) — that
    // would silently break the bijection from the other side. This
    // assertion locks ProjectionModel as a known consumer.
    const sf = sharedProject.getSourceFileOrThrow(PROJECTION_MODEL_PATH);
    expect(
      sf.getFullText().includes("selectBlockingWarnings"),
      "ProjectionModel.tsx must import + call selectBlockingWarnings to keep the banner aligned with the engine-side gate. If this fails, the banner is using its own filter and can silently disagree with what buildFromResolved actually refuses.",
    ).toBe(true);
  });

  it("no divergent inline `.filter(w => w.blocking ...)` anywhere under web/{app,lib,components,scripts}", () => {
    // Catches divergent re-implementations of the predicate. The canonical
    // call site lives in build-projection-inputs.ts:selectBlockingWarnings;
    // any other occurrence is drift waiting to happen.
    const offenders: DivergentFilterOffender[] = [];
    for (const sf of sharedProject.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (filePath === HELPER_PATH) continue;
      if (!/\/web\/(app|lib|components|scripts)\//.test(filePath)) continue;
      if (filePath.includes("/__tests__/")) continue;
      offenders.push(...findDivergentBlockingFilters(sf));
    }
    expect(
      offenders,
      `Divergent \`.filter(w => w.blocking ...)\` found outside build-projection-inputs.ts. Replace with selectBlockingWarnings to keep the gate and the banner aligned. Sites:\n${offenders
        .map((o) => `  ${o.file}:${o.line} → ${o.text}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
