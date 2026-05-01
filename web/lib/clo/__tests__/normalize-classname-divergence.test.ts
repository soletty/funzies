/**
 * KI-60 marker test — locks current divergence between three independent
 * `normalizeClassName` implementations across the codebase. Same input
 * produces different outputs depending on which file's helper a caller
 * happens to import.
 *
 * On close (consolidation to one canonical normalizer), the assertion
 * that the two exported helpers produce DIFFERENT outputs flips to
 * passing the same output — the `.not.toBe` assertion will fail, forcing
 * the developer to remove this marker. If the consolidation deletes one
 * of the imports entirely, the test file becomes uncompilable, which is
 * the same closure signal at the type level.
 */

import { describe, it, expect } from "vitest";
import { normalizeClassName as intexNormalize } from "@/lib/clo/intex/parse-past-cashflows";
import { normalizeClassName as apiNormalize } from "@/lib/clo/api";

describe("KI-60: triple normalizeClassName divergence (locks current bug)", () => {
  it("intex and api normalizers produce DIFFERENT outputs on a single tranche name", () => {
    const input = "Class A-1";
    expect(intexNormalize(input)).toBe("a-1");
    expect(apiNormalize(input)).toBe("A-1");
    expect(intexNormalize(input)).not.toBe(apiNormalize(input));
  });

  it("subordinated-tranche aliasing also diverges", () => {
    const input = "Sub Notes";
    expect(intexNormalize(input)).toBe("sub");
    expect(apiNormalize(input)).toBe("SUBORDINATED");
    expect(intexNormalize(input)).not.toBe(apiNormalize(input));
  });
});
