// NOTE: this module is imported from `web/components/clo/SwitchWaterfallImpact.tsx`
// (which lives outside `app/`). Keep it server-component-safe — no `"use client"`,
// no `"use server"`, no `next/headers`/`next/cookies`/etc. imports. If anything
// in here needs to become Next.js-specific, move those exports to a sibling
// file or to `web/lib/clo/format-helpers.ts` and update the cross-app importer.

export function formatPct(val: number): string {
  return `${val.toFixed(2)}%`;
}

/** ISO 4217 → display symbol. Unknown codes render as the code itself
 *  (e.g. "CHF") so we never silently swap the wrong symbol. Null currency
 *  renders as "?" — see `useFormatAmount` for the partner-facing banner. */
export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return "?";
  switch (currency.trim().toUpperCase()) {
    // arch-boundary-allow: ui-hardcodes-currency-symbol
    case "EUR": return "€";
    // arch-boundary-allow: ui-hardcodes-currency-symbol
    case "USD": return "$";
    // arch-boundary-allow: ui-hardcodes-currency-symbol
    case "GBP": return "£";
    // arch-boundary-allow: ui-hardcodes-currency-symbol
    case "JPY": return "¥";
    default:    return currency.trim().toUpperCase();
  }
}

/**
 * Formats a numeric amount with a deal currency symbol. Currency is
 * REQUIRED — pass `resolved.currency` (or `null` to render the "?"
 * placeholder). Hardcoding "€" or "$" in callers violates CLAUDE.md
 * § "Recurring failure modes" principle 1.
 *
 * In React component trees, prefer `useFormatAmount()` from
 * `CurrencyContext` so the currency is read from the surrounding deal
 * context once and threaded automatically.
 */
export function formatAmount(val: number, currency: string | null): string {
  const sym = currencySymbol(currency);
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

export function formatDate(isoDate: string): string {
  if (!isoDate || !isoDate.includes("-")) return "—";
  const [y, m] = isoDate.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1] ?? "?"} ${y.slice(2)}`;
}

export const TRANCHE_COLORS = [
  "#2d6a4f", "#5a7c2f", "#92641a", "#b54a32", "#7c3aed", "#2563eb",
];
