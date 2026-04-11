import React from "react";
import type { PeriodResult, ProjectionInputs } from "@/lib/clo/projection";
import { formatAmount } from "./helpers";

export function PeriodTrace({ period, inputs }: { period: PeriodResult; inputs: ProjectionInputs }) {
  const beginPar = period.beginningPar;
  const trusteeFee = beginPar * (inputs.trusteeFeeBps / 10000) / 4;
  const seniorFee = beginPar * (inputs.seniorFeePct / 100) / 4;
  const hedgeCost = beginPar * (inputs.hedgeCostBps / 10000) / 4;
  const subFee = beginPar * (inputs.subFeePct / 100) / 4;
  const availableAfterSenior = period.interestCollected - trusteeFee - seniorFee - hedgeCost;

  const principalAvailable = Math.max(0, period.prepayments + period.scheduledMaturities + period.recoveries - period.reinvestment);
  const equityFromInterest = Math.max(0, period.equityDistribution - principalAvailable);

  const lineStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
  const indent: React.CSSProperties = { paddingLeft: "1.2rem" };
  const labelStyle: React.CSSProperties = { color: "var(--color-text-muted)" };
  const feeColor = "var(--color-low)";
  const eqColor = "var(--color-high)";
  const dividerStyle: React.CSSProperties = { borderTop: "1px solid var(--color-border-light)", margin: "0.3rem 0" };

  return (
    <div style={{ padding: "0.75rem 1rem", background: "var(--color-surface-alt, var(--color-surface))", borderTop: "1px dashed var(--color-border-light)", fontSize: "0.72rem" }}>
      <div style={{ fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Interest Waterfall</div>
      <div style={lineStyle}><span>Interest Collected</span><span>{formatAmount(period.interestCollected)}</span></div>
      <div style={{ ...lineStyle, ...indent }}><span style={{ color: feeColor }}>Trustee/Admin ({inputs.trusteeFeeBps} bps)</span><span style={{ color: feeColor }}>-{formatAmount(trusteeFee)}</span></div>
      <div style={{ ...lineStyle, ...indent }}><span style={{ color: feeColor }}>Senior Mgmt Fee ({inputs.seniorFeePct}%)</span><span style={{ color: feeColor }}>-{formatAmount(seniorFee)}</span></div>
      {hedgeCost > 0 && <div style={{ ...lineStyle, ...indent }}><span style={{ color: feeColor }}>Hedge Costs ({inputs.hedgeCostBps} bps)</span><span style={{ color: feeColor }}>-{formatAmount(hedgeCost)}</span></div>}
      <div style={{ ...lineStyle, ...indent, fontWeight: 500 }}><span>Available for tranches</span><span>{formatAmount(Math.max(0, availableAfterSenior))}</span></div>

      {period.trancheInterest.map((t) => {
        // Show Class X amort alongside its interest (both paid from interest waterfall)
        const principalEntry = period.tranchePrincipal.find((p) => p.className === t.className);
        const isAmortising = principalEntry && principalEntry.paid > 0 && inputs.tranches.find((tr) => tr.className === t.className)?.isAmortising;
        return (
          <React.Fragment key={t.className}>
            <div style={{ ...lineStyle, ...indent }}>
              <span style={labelStyle}>{t.className} interest{t.paid < t.due ? ` (shortfall: ${formatAmount(t.due - t.paid)})` : ""}</span>
              <span>{t.paid > 0 ? `-${formatAmount(t.paid)}` : "\u2014"}</span>
            </div>
            {isAmortising && (
              <div style={{ ...lineStyle, ...indent }}>
                <span style={labelStyle}>{t.className} amort (from interest)</span>
                <span>-{formatAmount(principalEntry!.paid)}</span>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {(period.ocTests.length > 0 || period.icTests.length > 0) && (
        <div style={{ ...lineStyle, ...indent, flexWrap: "wrap", gap: "0.4rem" }}>
          {period.ocTests.map((t) => (
            <span key={`oc-${t.className}`} style={{ color: t.passing ? "var(--color-high)" : "var(--color-low)", fontSize: "0.68rem" }}>
              {t.passing ? "\u2713" : "\u2717"} {t.className} OC {t.actual.toFixed(1)}%
            </span>
          ))}
          {period.icTests.map((t) => (
            <span key={`ic-${t.className}`} style={{ color: t.passing ? "var(--color-high)" : "var(--color-low)", fontSize: "0.68rem" }}>
              {t.passing ? "\u2713" : "\u2717"} {t.className} IC {t.actual.toFixed(1)}%
            </span>
          ))}
        </div>
      )}

      <div style={{ ...lineStyle, ...indent }}><span style={{ color: feeColor }}>Sub Mgmt Fee ({inputs.subFeePct}%)</span><span style={{ color: feeColor }}>-{formatAmount(subFee)}</span></div>
      <div style={dividerStyle} />
      <div style={{ ...lineStyle, fontWeight: 600 }}><span style={{ color: eqColor }}>Equity (from interest)</span><span style={{ color: eqColor }}>{formatAmount(equityFromInterest)}</span></div>

      <div style={{ fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginTop: "0.75rem", marginBottom: "0.4rem" }}>Principal Waterfall</div>
      <div style={lineStyle}><span>Prepayments</span><span>{formatAmount(period.prepayments)}</span></div>
      <div style={lineStyle}><span>Maturities</span><span>{formatAmount(period.scheduledMaturities)}</span></div>
      <div style={lineStyle}><span>Recoveries</span><span>{formatAmount(period.recoveries)}</span></div>
      {period.reinvestment > 0 && <div style={{ ...lineStyle, ...indent }}><span style={{ color: feeColor }}>Reinvested</span><span style={{ color: feeColor }}>-{formatAmount(period.reinvestment)}</span></div>}
      {period.tranchePrincipal.filter((t) => {
        if (t.paid <= 0) return false;
        // Skip amortising tranches — their principal is already shown under Interest Waterfall
        const trancheInput = inputs.tranches.find((tr) => tr.className === t.className);
        return !trancheInput?.isAmortising;
      }).map((t) => (
        <div key={t.className} style={{ ...lineStyle, ...indent }}><span style={labelStyle}>{t.className} principal</span><span>-{formatAmount(t.paid)}</span></div>
      ))}
      <div style={dividerStyle} />
      <div style={{ ...lineStyle, fontWeight: 700 }}><span style={{ color: eqColor }}>Total Equity Distribution</span><span style={{ color: eqColor }}>{formatAmount(period.equityDistribution)}</span></div>
    </div>
  );
}
