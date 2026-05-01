import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  _parseLeadingNumber as parseLeadingNumber,
  _parseEuriborSeries as parseEuriborSeries,
} from "../parse-past-cashflows";

describe("parseLeadingNumber (Intex assumptions preamble)", () => {
  it("American integer", () => {
    expect(parseLeadingNumber("20 CPR")).toBe(20);
  });

  it("American decimal", () => {
    expect(parseLeadingNumber("3.625 CDR")).toBe(3.625);
  });

  it("European decimal — KI-50 sibling fix", () => {
    expect(parseLeadingNumber("75,5 Percent")).toBe(75.5);
  });

  it("negative", () => {
    expect(parseLeadingNumber("-1.5 something")).toBe(-1.5);
  });

  it("3-decimal precision American (no thousands mis-classification)", () => {
    // Critical: "3.625" must NOT be treated as canonical-thousands shape (3625).
    // The strict-decimal regex restricts to one separator group, parses
    // locale-aware via comma→dot replacement.
    expect(parseLeadingNumber("3.625 CDR")).toBe(3.625);
  });

  it("zero", () => {
    expect(parseLeadingNumber("0 Months")).toBe(0);
  });

  it("null on null input", () => {
    expect(parseLeadingNumber(null)).toBeNull();
  });

  it("null on no-leading-number", () => {
    expect(parseLeadingNumber("CPR")).toBeNull();
  });

  it("null on empty", () => {
    expect(parseLeadingNumber("")).toBeNull();
  });
});

describe("parseEuriborSeries", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("parses American-format space-separated series", () => {
    expect(parseEuriborSeries("1.996 2.035 2.150")).toEqual([1.996, 2.035, 2.150]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("parses single value", () => {
    expect(parseEuriborSeries("3.5")).toEqual([3.5]);
  });

  it("accepts negative Euribor (recent history)", () => {
    expect(parseEuriborSeries("-0.5 -0.3 0.1")).toEqual([-0.5, -0.3, 0.1]);
  });

  it("accepts boundary values (-2 and 10 included)", () => {
    expect(parseEuriborSeries("-2 10 5")).toEqual([-2, 10, 5]);
  });

  it("returns null on empty", () => {
    expect(parseEuriborSeries("")).toBeNull();
  });

  it("returns null on null", () => {
    expect(parseEuriborSeries(null)).toBeNull();
  });

  it("returns null on non-numeric tokens", () => {
    expect(parseEuriborSeries("abc def")).toBeNull();
  });

  it("rejects out-of-range high (>10) — magnitude tripwire", () => {
    expect(parseEuriborSeries("1.5 996 2.5")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/value 996 outside realistic range/);
  });

  it("rejects out-of-range low (<-2)", () => {
    expect(parseEuriborSeries("-50 0.5 1.5")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects European-shape input via comma-vs-dot count (large-value case)", () => {
    // "1,996 2,035": 2 commas, 0 dots → comma > dot → rejected by count guard
    // before tokenization even runs. Belt-and-braces vs the magnitude tripwire.
    expect(parseEuriborSeries("1,996 2,035")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/more commas/);
  });

  it("rejects European-shape input that magnitude check alone misses (small-value case)", () => {
    // "0,5 1,2 0,3" — typical Euribor under 1%. Naive split gives [0, 5, 1, 2,
    // 0, 3], all within [-2, 10] safety range. Magnitude tripwire alone wouldn't
    // catch this. Comma-vs-dot count catches it.
    expect(parseEuriborSeries("0,5 1,2 0,3")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/more commas/);
  });

  it("accepts American comma-separated decimal series", () => {
    // "1.5,2.5,3.5" — 3 dots, 2 commas. dot > comma → process normally.
    expect(parseEuriborSeries("1.5,2.5,3.5")).toEqual([1.5, 2.5, 3.5]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
