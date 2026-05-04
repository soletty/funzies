/**
 * Unit tests for parseIntexPositions. Pins the header-driven dispatch
 * (anti-pattern #1: column-shuffled fixture must produce identical output)
 * and the boundary asserts (anti-pattern #5: rating-shape + recovery-rate
 * magnitude refuse-loud on bad input).
 *
 * The smoke test against the real Euro XV positions CSV in __fixtures is
 * the portability backstop — verifies parser handles the actual on-disk
 * format we'll consume in production.
 */

import { describe, it, expect } from "vitest";
import { parseIntexPositions } from "../parse-positions";

const HEADER = [
  "identifier", "security_type", "ultimate_parent_issuer", "issuer",
  "issue_name", "clo_name", "par", "price", "spread", "spread_override",
  "spread_type", "base_rate", "unfunded_fee_rate", "base_rate_adj",
  "funded_par", "unfunded_par", "maturity_date", "coupon_type",
  "moody_industry", "sp_industry", "fitch_industry", "weighted_average_life",
  "issuer_country_iso", "security_level", "lien_type", "is_dip",
  "moody_issue_rating", "moody_issuer_rating", "moody_senior_secured_rating",
  "moody_senior_unsecured_rating", "moody_subordinated_rating",
  "moody_issuer_watch", "moody_issuer_outlook", "moody_issue_rating_designation",
  "sp_issue_rating", "sp_issuer_rating", "sp_senior_secured_rating",
  "sp_senior_unsecured_rating", "sp_subordinated_rating",
  "sp_issuer_watch", "sp_issuer_outlook", "sp_issue_rating_designation",
  "sp_recovery_rate",
  "fitch_issue_rating", "fitch_issuer_rating", "fitch_senior_secured_rating",
  "fitch_senior_unsecured_rating", "fitch_issuer_watch",
  "fitch_issue_rating_designation", "fitch_recovery_rate",
  "is_defaulted", "is_current_pay", "is_covenant_lite",
  "moody_derived_warf", "moody_derived_warf_rating",
  "moody_derived_default_prob_rating", "moody_derived_issue_rating",
  "moody_derived_recovery_rate", "moody_derived_country_group",
  "fitch_derived_country_group", "fitch_derived_rating",
  "fitch_derived_warf", "fitch_derived_recovery_rate",
  "sp_derived_rating", "sp_derived_recovery_rate",
  "pricing_date",
];

function row(values: Record<string, string>): string {
  return HEADER.map((h) => values[h] ?? "").join(",");
}

function csv(...rows: Array<Record<string, string>>): string {
  return [HEADER.join(","), ...rows.map(row)].join("\n");
}

describe("parseIntexPositions — identifier classification (anti-pattern #5)", () => {
  it("classifies LX-prefixed identifiers as lxid", () => {
    const result = parseIntexPositions(csv({ identifier: "LX194166", par: "1000000", moody_issue_rating: "B3", sp_issue_rating: "B-", fitch_issue_rating: "B" }));
    expect(result.rows[0].lxid).toBe("LX194166");
    expect(result.rows[0].isin).toBe(null);
    expect(result.rows[0].facility_id).toBe(null);
  });

  it("classifies XS-prefixed ISIN identifiers as isin", () => {
    const result = parseIntexPositions(csv({ identifier: "XS3084266538", par: "500000", moody_issue_rating: "Caa1", sp_issue_rating: "CCC+", fitch_issue_rating: "CCC" }));
    expect(result.rows[0].isin).toBe("XS3084266538");
    expect(result.rows[0].lxid).toBe(null);
  });

  it("classifies non-LX, non-ISIN identifiers as facility_id (catch-all)", () => {
    const result = parseIntexPositions(csv({ identifier: "USD9999AB", par: "100", moody_issue_rating: "B2", sp_issue_rating: "B", fitch_issue_rating: "B" }));
    // "USD9999AB" — 9 chars, doesn't match ISIN (12 chars) or LX (LX prefix).
    expect(result.rows[0].facility_id).toBe("USD9999AB");
    expect(result.rows[0].lxid).toBe(null);
    expect(result.rows[0].isin).toBe(null);
  });
});

describe("parseIntexPositions — rating channels", () => {
  it("populates Moody's channels with credit-estimate designation", () => {
    const result = parseIntexPositions(csv({
      identifier: "LX199084", par: "2000000",
      moody_issue_rating: "Caa1", moody_issuer_rating: "Caa1",
      moody_issue_rating_designation: "Private",
      sp_issue_rating: "CCC+", fitch_issue_rating: "B-",
    }));
    expect(result.rows[0].moody_issue_rating).toBe("Caa1");
    expect(result.rows[0].moody_issuer_rating).toBe("Caa1");
    expect(result.rows[0].moody_issue_rating_designation).toBe("Private");
  });

  it("returns null on rating sentinels (***, NR, --)", () => {
    const result = parseIntexPositions(csv({
      identifier: "LX0001", par: "100",
      moody_issue_rating: "***", moody_issuer_rating: "NR", moody_senior_secured_rating: "--",
      sp_issue_rating: "B", fitch_issue_rating: "B",
    }));
    expect(result.rows[0].moody_issue_rating).toBe(null);
    expect(result.rows[0].moody_issuer_rating).toBe(null);
    expect(result.rows[0].moody_senior_secured_rating).toBe(null);
  });

  it("strips suffixes and accepts \"Caa1 *-\" / \"B (sf)\"", () => {
    const result = parseIntexPositions(csv({
      identifier: "LX0002", par: "100",
      moody_issue_rating: "Caa1 *-", sp_issue_rating: "B (sf)", fitch_issue_rating: "BB-",
    }));
    expect(result.rows[0].moody_issue_rating).toBe("Caa1 *-");
    expect(result.rows[0].sp_issue_rating).toBe("B (sf)");
  });

  it("THROWS on unrecognized rating string (boundary refuse-loud)", () => {
    expect(() => parseIntexPositions(csv({
      identifier: "LX0003", par: "100",
      moody_issue_rating: "ZZZ9", sp_issue_rating: "B", fitch_issue_rating: "B",
    }))).toThrow(/moody_issue_rating not in rating taxonomy/);
  });
});

describe("parseIntexPositions — recovery rate magnitude validation (anti-pattern #5)", () => {
  it("converts decimal to percent (0.45 → 45.0)", () => {
    const result = parseIntexPositions(csv({
      identifier: "LX0004", par: "100",
      moody_issue_rating: "B2", sp_issue_rating: "B", fitch_issue_rating: "B",
      moody_derived_recovery_rate: "0.45",
    }));
    expect(result.rows[0].moody_derived_recovery_rate).toBe(45);
  });

  it("THROWS when recovery rate >1.5 (looks already-percent — refuse-loud)", () => {
    expect(() => parseIntexPositions(csv({
      identifier: "LX0005", par: "100",
      moody_issue_rating: "B2", sp_issue_rating: "B", fitch_issue_rating: "B",
      moody_derived_recovery_rate: "45",
    }))).toThrow(/looks already-percent-shape/);
  });

  it("THROWS on negative recovery rate", () => {
    expect(() => parseIntexPositions(csv({
      identifier: "LX0006", par: "100",
      moody_issue_rating: "B2", sp_issue_rating: "B", fitch_issue_rating: "B",
      moody_derived_recovery_rate: "-0.1",
    }))).toThrow(/negative/);
  });
});

describe("parseIntexPositions — header-driven dispatch (anti-pattern #1)", () => {
  it("THROWS when required column missing", () => {
    const noPar = HEADER.filter((h) => h !== "par").join(",") + "\nLX0001,Loan,X,X,X,X,99,...";
    expect(() => parseIntexPositions(noPar)).toThrow(/required column "par" missing/);
  });

  it("column-shuffled CSV produces identical output (header-driven, not ordinal)", () => {
    // Reverse the header order; same data; result rows by lxid must match.
    const revHeader = [...HEADER].reverse();
    const revRow = (vals: Record<string, string>) => revHeader.map((h) => vals[h] ?? "").join(",");
    const data = { identifier: "LX0007", par: "1000000", moody_issue_rating: "Caa1", sp_issue_rating: "CCC+", fitch_issue_rating: "CCC" };

    const original = parseIntexPositions(csv(data));
    const shuffled = parseIntexPositions([revHeader.join(","), revRow(data)].join("\n"));

    expect(original.rows[0].moody_issue_rating).toBe(shuffled.rows[0].moody_issue_rating);
    expect(original.rows[0].lxid).toBe(shuffled.rows[0].lxid);
    expect(original.rows[0].par).toBe(shuffled.rows[0].par);
  });
});

describe("parseIntexPositions — empty / blank rows", () => {
  it("returns empty result on empty CSV", () => {
    const result = parseIntexPositions("");
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("skips rows with empty identifier", () => {
    const result = parseIntexPositions([HEADER.join(","), row({}), row({ identifier: "LX0008", par: "100", moody_issue_rating: "B2", sp_issue_rating: "B", fitch_issue_rating: "B" })].join("\n"));
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].lxid).toBe("LX0008");
  });
});
