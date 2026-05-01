/**
 * Disclosure ↔ ledger bijection.
 *
 * Every KI-XX reference in a scanned file must resolve to a current anchor
 * in the known-issues ledger. When a KI closes, it is deleted from the
 * ledger entirely (no audit-trail stub) — so any code/disclosure
 * referencing a deleted KI fails this test, forcing the contributor to
 * either remove the reference or describe the invariant directly.
 *
 * To extend the check to a new file: add it to SCAN_FILES below.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const LEDGER_PATH = resolve(REPO_ROOT, "web/docs/clo-model-known-issues.md");

const SCAN_FILES: string[] = [
  "web/app/clo/waterfall/ModelAssumptions.tsx",
  "web/app/clo/waterfall/CurrencyContext.tsx",
  "web/lib/clo/ppm-step-map.ts",
];

function parseLedgerAnchors(): Set<string> {
  const content = readFileSync(LEDGER_PATH, "utf-8");
  const all = new Set<string>();
  const anchorRe = /<a id="(ki-[\w-]+)">/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(content)) !== null) {
    all.add(m[1].toLowerCase());
  }
  return all;
}

interface KiReference {
  ki: string; // canonical lowercase anchor form, e.g. "ki-43"
  line: number;
  context: string; // the line of source containing the reference
}

function findKiReferences(filePath: string): KiReference[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const refs: KiReference[] = [];
  // Match KI-12a, KI-08, ki-49, etc. Case-insensitive.
  const refRe = /\bKI-(\d+[a-z]?)\b/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(line)) !== null) {
      refs.push({
        ki: `ki-${m[1].toLowerCase()}`,
        line: i + 1,
        context: line.trim(),
      });
    }
  }
  return refs;
}

describe("disclosure ↔ ledger bijection", () => {
  const anchors = parseLedgerAnchors();

  it("ledger has parseable anchors", () => {
    expect(anchors.size).toBeGreaterThan(20);
  });

  for (const relPath of SCAN_FILES) {
    const absPath = resolve(REPO_ROOT, relPath);

    it(`${relPath}: every KI-XX reference resolves to a current ledger anchor`, () => {
      const refs = findKiReferences(absPath);
      const unresolved = refs.filter((r) => !anchors.has(r.ki));
      expect(
        unresolved,
        `${unresolved.length} unresolved KI reference(s) — the cited KI was either deleted (closed) or never existed. Remove the reference or describe the invariant directly:\n${unresolved
          .map((r) => `  ${relPath}:${r.line} → ${r.ki.toUpperCase()}: ${r.context}`)
          .join("\n")}`,
      ).toHaveLength(0);
    });
  }
});
