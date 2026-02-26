"use client";

import { useState, useMemo } from "react";
import type { PortfolioHolding } from "@/lib/clo/types";

type SortKey = keyof PortfolioHolding;
type SortDir = "asc" | "desc";

export default function HoldingsTable({ holdings }: { holdings: PortfolioHolding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("notional");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterText, setFilterText] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");

  const sectors = useMemo(
    () => [...new Set(holdings.map((h) => h.sector).filter(Boolean))].sort(),
    [holdings]
  );

  const filtered = useMemo(() => {
    let result = holdings;
    if (filterText) {
      const lower = filterText.toLowerCase();
      result = result.filter((h) => h.issuer.toLowerCase().includes(lower));
    }
    if (sectorFilter) {
      result = result.filter((h) => h.sector === sectorFilter);
    }
    return [...result].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [holdings, filterText, sectorFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "issuer" || key === "sector" ? "asc" : "desc");
    }
  }

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 0.6rem",
    fontWeight: 600,
    color: "var(--color-text-muted)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    fontSize: "0.8rem",
    borderBottom: "2px solid var(--color-border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.4rem 0.6rem",
    borderBottom: "1px solid var(--color-border)",
    fontSize: "0.8rem",
  };

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Filter by issuer..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="ic-textarea"
          style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem", maxWidth: "250px" }}
        />
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="ic-textarea"
          style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem", maxWidth: "200px" }}
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", alignSelf: "center" }}>
          {filtered.length} of {holdings.length} holdings
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => handleSort("issuer")}>Issuer{sortIndicator("issuer")}</th>
              <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("notional")}>Notional (K){sortIndicator("notional")}</th>
              <th style={thStyle} onClick={() => handleSort("rating")}>Rating{sortIndicator("rating")}</th>
              <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("spread")}>Spread{sortIndicator("spread")}</th>
              <th style={thStyle} onClick={() => handleSort("sector")}>Sector{sortIndicator("sector")}</th>
              <th style={thStyle} onClick={() => handleSort("maturity")}>Maturity{sortIndicator("maturity")}</th>
              <th style={thStyle} onClick={() => handleSort("loanType")}>Type{sortIndicator("loanType")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => (
              <tr key={i}>
                <td style={tdStyle}>{h.issuer}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{h.notional.toLocaleString()}</td>
                <td style={tdStyle}>{h.rating}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{h.spread}</td>
                <td style={tdStyle}>{h.sector}</td>
                <td style={tdStyle}>{h.maturity}</td>
                <td style={tdStyle}>{h.loanType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
