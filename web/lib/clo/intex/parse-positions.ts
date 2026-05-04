/**
 * Parser for the Intex DealCF per-position positions CSV.
 *
 * Filename pattern: `<reportDate>_output_<dealName>_positions.csv`. Carries
 * per-position rating channels (issue/issuer/derived) including credit
 * estimates and private letter ratings tagged via `*_designation` columns,
 * plus derived recovery rates. Schema is uniform across deals — Intex
 * DealCF emits the same columns regardless of issuer.
 *
 * Output shape mirrors the `clo_intex_positions` DB columns (snake_case)
 * so the ingest layer can pass rows directly to `sdfBatchInsert`. The
 * resolver-side consumer (`resolve-rating.ts`) reads via access.ts which
 * converts snake_case → camelCase, matching the existing SDF flow.
 *
 * Header-driven dispatch (anti-pattern #1): no column ordinals; refuses to
 * parse if any required column is missing. Boundary asserts (anti-pattern
 * #5): rating-string regex match, recovery-rate magnitude validation;
 * unrecognized values throw rather than silent-null.
 */

import { trimRating, isRatingSentinel, parseNumeric, parseBoolean } from "../sdf/csv-utils";
import { stripRatingSuffixes } from "../rating-mapping";
import type { SdfParseResult } from "../sdf/types";

export interface ParsedIntexPositionRow {
  // Identifiers — three nullable columns (CHECK constraint at DB layer
  // ensures at least one). Parser splits the heterogeneous "identifier"
  // column based on prefix shape.
  lxid: string | null;
  isin: string | null;
  facility_id: string | null;
  // Cross-check value (resolver-side asserts ≈ Σ matching SDF par_balance)
  par: number | null;
  // Moody's
  moody_issue_rating: string | null;
  moody_issuer_rating: string | null;
  moody_senior_secured_rating: string | null;
  moody_derived_default_prob_rating: string | null;
  moody_derived_warf_rating: string | null;
  moody_issue_rating_designation: string | null;
  // S&P
  sp_issue_rating: string | null;
  sp_issuer_rating: string | null;
  sp_derived_rating: string | null;
  sp_issue_rating_designation: string | null;
  // Fitch
  fitch_issue_rating: string | null;
  fitch_issuer_rating: string | null;
  fitch_derived_rating: string | null;
  fitch_issue_rating_designation: string | null;
  // Recovery rates (KI-32 competing source — file as candidate KI)
  moody_derived_recovery_rate: number | null;
  fitch_derived_recovery_rate: number | null;
  sp_derived_recovery_rate: number | null;
  is_defaulted: boolean | null;
}


const REQUIRED_COLUMNS = [
  "identifier",
  "issuer",
  "par",
  "moody_issue_rating",
  "sp_issue_rating",
  "fitch_issue_rating",
] as const;

/** ISIN format check: 12 chars, 2-letter country prefix + 9 alphanumeric +
 *  1 check digit. Loose validation — boundary assertion, not full check-
 *  digit verification. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
/** LoanX ID format: case-insensitive "LX" prefix + 4+ digits. Permissive
 *  on the digit-count to catch legacy LXIDs (4–5 digits) alongside modern
 *  6+. Treats falling through to the `facility_id` bucket as the safe
 *  default — narrowing the regex risks misclassifying a real LXID as a
 *  facility code, which silently drops the resolver's lxid lookup path. */
const LXID_RE = /^LX\d{4,}$/i;

function classifyIdentifier(id: string): { lxid: string | null; isin: string | null; facility_id: string | null } {
  if (LXID_RE.test(id)) return { lxid: id, isin: null, facility_id: null };
  if (ISIN_RE.test(id)) return { lxid: null, isin: id, facility_id: null };
  return { lxid: null, isin: null, facility_id: id };
}

/** Magnitude validation for derived recovery rates. Intex emits as decimal
 *  (0.45 = 45%); the parser converts to percent (0–100) at the boundary
 *  per anti-pattern #5. Refuses rates outside (0, 1.5] — a 150% recovery
 *  is non-physical, treated as a parse error. */
function parseRecoveryRate(raw: string | undefined, field: string): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  const n = parseNumeric(t);
  if (n == null) return null;
  if (!Number.isFinite(n)) {
    throw new Error(`Intex positions: ${field} not finite (got ${JSON.stringify(raw)})`);
  }
  if (n < 0) {
    throw new Error(`Intex positions: ${field} negative (got ${n})`);
  }
  if (n > 1.5) {
    throw new Error(`Intex positions: ${field} > 1.5 — looks already-percent-shape, parser expects decimal (got ${n})`);
  }
  return n * 100;
}

const KNOWN_RATING_KEYS = new Set<string>([
  "aaa", "aa1", "aa2", "aa3", "a1", "a2", "a3",
  "baa1", "baa2", "baa3", "ba1", "ba2", "ba3",
  "b1", "b2", "b3", "caa1", "caa2", "caa3", "ca", "c",
  "aa+", "aa", "aa-", "a+", "a", "a-",
  "bbb+", "bbb", "bbb-", "bb+", "bb", "bb-",
  "b+", "b", "b-", "ccc+", "ccc", "ccc-",
  "cc+", "cc", "cc-",
]);

function validateRating(raw: string | null, field: string): string | null {
  if (raw == null) return null;
  if (isRatingSentinel(raw)) return null;
  const trimmed = trimRating(raw);
  if (trimmed == null) return null;
  const key = stripRatingSuffixes(trimmed);
  if (!KNOWN_RATING_KEYS.has(key)) {
    throw new Error(`Intex positions: ${field} not in rating taxonomy (got ${JSON.stringify(raw)} → ${JSON.stringify(key)})`);
  }
  return trimmed;
}

function trimDesignation(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/** CSV row parser that respects double-quote-escaping. Mirrors SDF parseCsvRow. */
function parseRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseIntexPositions(csvText: string): SdfParseResult<ParsedIntexPositionRow> {
  const cleaned = csvText.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { fileType: "intex_positions", rows: [], rowCount: 0, asOfDate: null, periodBeginDate: null, dealName: null };
  }

  const headers = parseRow(lines[0]).map((h) => h.trim());
  const idx = (h: string) => headers.indexOf(h);

  for (const required of REQUIRED_COLUMNS) {
    if (idx(required) === -1) {
      throw new Error(`Intex positions: required column "${required}" missing from header (got: ${headers.join(", ")})`);
    }
  }

  const ix = {
    identifier: idx("identifier"),
    par: idx("par"),
    cloName: idx("clo_name"),
    pricingDate: idx("pricing_date"),
    moodyIssue: idx("moody_issue_rating"),
    moodyIssuer: idx("moody_issuer_rating"),
    moodySeniorSecured: idx("moody_senior_secured_rating"),
    moodyDp: idx("moody_derived_default_prob_rating"),
    moodyWarf: idx("moody_derived_warf_rating"),
    moodyDesignation: idx("moody_issue_rating_designation"),
    spIssue: idx("sp_issue_rating"),
    spIssuer: idx("sp_issuer_rating"),
    spDerived: idx("sp_derived_rating"),
    spDesignation: idx("sp_issue_rating_designation"),
    fitchIssue: idx("fitch_issue_rating"),
    fitchIssuer: idx("fitch_issuer_rating"),
    fitchDerived: idx("fitch_derived_rating"),
    fitchDesignation: idx("fitch_issue_rating_designation"),
    moodyRecovery: idx("moody_derived_recovery_rate"),
    fitchRecovery: idx("fitch_derived_recovery_rate"),
    // sp_derived_recovery_rate is the decimal-shape column. The CSV ALSO
    // carries `sp_recovery_rate` (S&P's 1-5 tier-code format like "3(50%)")
    // which is NOT a decimal — explicitly do not parse that column.
    spRecovery: idx("sp_derived_recovery_rate"),
    isDefaulted: idx("is_defaulted"),
  };

  const rows: ParsedIntexPositionRow[] = [];
  let dealName: string | null = null;
  let asOfDate: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const f = parseRow(lines[i]);
    const get = (i: number) => i === -1 || i >= f.length ? "" : f[i];

    const identifier = get(ix.identifier).trim();
    if (!identifier) continue;

    const cls = classifyIdentifier(identifier);
    const par = parseNumeric(get(ix.par));

    if (dealName == null) dealName = get(ix.cloName).trim() || null;
    if (asOfDate == null) asOfDate = get(ix.pricingDate).trim() || null;

    const row: ParsedIntexPositionRow = {
      lxid: cls.lxid,
      isin: cls.isin,
      facility_id: cls.facility_id,
      par,
      moody_issue_rating: validateRating(get(ix.moodyIssue), "moody_issue_rating"),
      moody_issuer_rating: validateRating(get(ix.moodyIssuer), "moody_issuer_rating"),
      moody_senior_secured_rating: validateRating(get(ix.moodySeniorSecured), "moody_senior_secured_rating"),
      moody_derived_default_prob_rating: validateRating(get(ix.moodyDp), "moody_derived_default_prob_rating"),
      moody_derived_warf_rating: validateRating(get(ix.moodyWarf), "moody_derived_warf_rating"),
      moody_issue_rating_designation: trimDesignation(get(ix.moodyDesignation)),
      sp_issue_rating: validateRating(get(ix.spIssue), "sp_issue_rating"),
      sp_issuer_rating: validateRating(get(ix.spIssuer), "sp_issuer_rating"),
      sp_derived_rating: validateRating(get(ix.spDerived), "sp_derived_rating"),
      sp_issue_rating_designation: trimDesignation(get(ix.spDesignation)),
      fitch_issue_rating: validateRating(get(ix.fitchIssue), "fitch_issue_rating"),
      fitch_issuer_rating: validateRating(get(ix.fitchIssuer), "fitch_issuer_rating"),
      fitch_derived_rating: validateRating(get(ix.fitchDerived), "fitch_derived_rating"),
      fitch_issue_rating_designation: trimDesignation(get(ix.fitchDesignation)),
      moody_derived_recovery_rate: parseRecoveryRate(get(ix.moodyRecovery), "moody_derived_recovery_rate"),
      fitch_derived_recovery_rate: parseRecoveryRate(get(ix.fitchRecovery), "fitch_derived_recovery_rate"),
      sp_derived_recovery_rate: parseRecoveryRate(get(ix.spRecovery), "sp_derived_recovery_rate"),
      is_defaulted: parseBoolean(get(ix.isDefaulted)),
    };
    rows.push(row);
  }

  return { fileType: "intex_positions", rows, rowCount: rows.length, asOfDate, periodBeginDate: null, dealName };
}
