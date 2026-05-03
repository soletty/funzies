import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateMagnitude } from "../sdf/magnitude-validator";

describe("validateMagnitude", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("par_balance", () => {
    it("passes typical loan balance through silently", () => {
      expect(validateMagnitude("par_balance", 5_000_000)).toBe(5_000_000);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects below-min balance to null (1,000× locale mis-parse symptom)", () => {
      expect(validateMagnitude("par_balance", 1.5)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/par_balance=1\.5 below/);
    });

    it("passes the boundary value (exactly the min)", () => {
      expect(validateMagnitude("par_balance", 1_000)).toBe(1_000);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects just below the boundary", () => {
      expect(validateMagnitude("par_balance", 999.99)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("market_value", () => {
    it("passes typical MV (98.5% of par) silently", () => {
      expect(validateMagnitude("market_value", 98.5)).toBe(98.5);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects MV > 200 to null (absolute-vs-percent confusion)", () => {
      expect(validateMagnitude("market_value", 5_000_000)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/market_value=5000000 above/);
    });

    it("accepts distressed-but-realistic MV (110%)", () => {
      expect(validateMagnitude("market_value", 110)).toBe(110);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("passes the boundary value (exactly the max)", () => {
      expect(validateMagnitude("market_value", 200)).toBe(200);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects just above the boundary", () => {
      expect(validateMagnitude("market_value", 200.01)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("rate_pct", () => {
    it("passes typical coupon (5.25%) silently", () => {
      expect(validateMagnitude("rate_pct", 5.25)).toBe(5.25);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects rate > 50 to null (100× locale mis-parse symptom)", () => {
      expect(validateMagnitude("rate_pct", 325)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/rate_pct=325 above/);
    });

    it("passes the boundary value (exactly 50)", () => {
      expect(validateMagnitude("rate_pct", 50)).toBe(50);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("warning surfacing — every rejection logs (no dedup)", () => {
    it("logs every rejection in a sequence (visibility for principle 3)", () => {
      validateMagnitude("par_balance", 1);
      validateMagnitude("par_balance", 0.5);
      validateMagnitude("par_balance", 0.0001);
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    it("logs different fields separately", () => {
      validateMagnitude("par_balance", 1);
      validateMagnitude("rate_pct", 999);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("includes the offending value in each log line", () => {
      validateMagnitude("par_balance", 1.23);
      validateMagnitude("par_balance", 4.56);
      expect(warnSpy.mock.calls[0][0]).toMatch(/par_balance=1\.23/);
      expect(warnSpy.mock.calls[1][0]).toMatch(/par_balance=4\.56/);
    });
  });

  describe("null / unbounded fields", () => {
    it("passes null through (no warn)", () => {
      expect(validateMagnitude("par_balance", null)).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("rejects zero on par_balance (zero is below 1000)", () => {
      expect(validateMagnitude("par_balance", 0)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("NaN handling — comparisons silently return false, must reject explicitly", () => {
    // Without an explicit Number.isNaN branch, `NaN < min` and `NaN > max`
    // both return false, so NaN falls through belowMin/aboveMax checks and
    // propagates downstream. The engine-side helper would throw at runtime,
    // not at the parser boundary. Reject NaN at the boundary to fail loud
    // where the bad value originated.
    it("rejects NaN on par_balance to null", () => {
      expect(validateMagnitude("par_balance", NaN)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/par_balance=NaN/);
    });

    it("rejects NaN on recovery_rate_pct to null", () => {
      expect(validateMagnitude("recovery_rate_pct", NaN)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/recovery_rate_pct=NaN/);
    });

    it("rejects NaN on rate_pct to null (covers max-only-bounded fields)", () => {
      expect(validateMagnitude("rate_pct", NaN)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
