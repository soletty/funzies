"use client";

import type {
  CloWaterfallStep,
  CloTranche,
  CloTrancheSnapshot,
  CloComplianceTest,
} from "@/lib/clo/types";

interface Props {
  waterfallSteps: CloWaterfallStep[];
  tranches: CloTranche[];
  trancheSnapshots: CloTrancheSnapshot[];
  complianceTests: CloComplianceTest[];
}

/**
 * Extract the class letter/number from a tranche name.
 * "Class A Senior Secured Floating Rate Notes due 2035" → "A"
 * "Class B-1 Senior Secured Floating Rate Notes due 2035" → "B-1"
 * "Subordinated Notes due 2035" → "SUB"
 */
function extractClassKey(name: string): string {
  if (/subordinated/i.test(name)) return "SUB";
  const m = name.match(/class\s+([a-z](?:[/-]\d+)?)/i);
  return m ? m[1].toUpperCase() : name.toLowerCase();
}

/** Is this a detailed tranche name (has "due YYYY" or specific terms)? */
function isDetailedName(name: string): boolean {
  return /due\s+\d{4}/i.test(name) || /\b(floating|fixed|deferrable|secured|loan)\b/i.test(name);
}

/**
 * Deduplicate tranches. Reports often have both summary ("Class A Notes $248M")
 * and detailed ("Class A Loan $115M" + "Class A Notes $114.30M") entries.
 * When detailed versions exist for a class, remove the aggregate summary.
 */
function deduplicateTranches(
  tranches: CloTranche[],
  _snapshots: Map<string, CloTrancheSnapshot>,
): CloTranche[] {
  const groups = new Map<string, CloTranche[]>();
  for (const t of tranches) {
    const key = extractClassKey(t.className);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const result: CloTranche[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const detailed = group.filter((t) => isDetailedName(t.className));
    const summary = group.filter((t) => !isDetailedName(t.className));
    // If we have both detailed and summary, keep only detailed
    if (detailed.length > 0 && summary.length > 0) {
      result.push(...detailed);
    } else {
      result.push(...group);
    }
  }
  return result;
}

function formatAmount(val: number | null): string {
  if (val === null || val === undefined) return "—";
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function WaterfallSection({
  title,
  steps,
}: {
  title: string;
  steps: CloWaterfallStep[];
}) {
  if (steps.length === 0) return null;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1rem",
          fontWeight: 600,
          marginBottom: "1rem",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <div style={{ position: "relative", paddingLeft: "1rem" }}>
        {/* Vertical cascade line */}
        <div
          style={{
            position: "absolute",
            left: "1.9rem",
            top: "1rem",
            bottom: "1rem",
            width: "2px",
            background: "linear-gradient(to bottom, var(--color-border), var(--color-border-light))",
            borderRadius: "1px",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {steps.map((step, idx) => {
            const isDiversion = step.isOcTestDiversion || step.isIcTestDiversion;
            const barPct =
              step.fundsAvailableBefore && step.fundsAvailableBefore > 0 && step.amountPaid !== null
                ? Math.min(100, (step.amountPaid / step.fundsAvailableBefore) * 100)
                : 0;

            return (
              <div
                key={step.id}
                className="wf-step-card"
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.5rem 1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.65rem 0.75rem",
                  background: isDiversion ? "rgba(217, 119, 6, 0.04)" : "var(--color-surface)",
                  border: `1px solid ${isDiversion ? "rgba(217, 119, 6, 0.2)" : "var(--color-border-light)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                  animationDelay: `${idx * 30}ms`,
                }}
              >
                {/* Priority badge */}
                <div
                  style={{
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "50%",
                    background: isDiversion
                      ? "rgba(217, 119, 6, 0.12)"
                      : "var(--color-surface-alt)",
                    border: `1.5px solid ${isDiversion ? "rgba(217, 119, 6, 0.3)" : "var(--color-border)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: isDiversion ? "#92400e" : "var(--color-text-secondary)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {step.priorityOrder ?? "—"}
                </div>

                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, lineHeight: 1.3 }}>
                    {step.description || "Unnamed step"}
                    {isDiversion && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "3px",
                          background: "rgba(217, 119, 6, 0.1)",
                          color: "#92400e",
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                        }}
                      >
                        {step.isOcTestDiversion ? "OC Div" : "IC Div"}
                      </span>
                    )}
                  </div>
                  {step.payee && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--color-text-muted)",
                        marginTop: "0.15rem",
                      }}
                    >
                      {step.payee}
                    </div>
                  )}
                  {barPct > 0 && (
                    <div
                      style={{
                        marginTop: "0.35rem",
                        height: "3px",
                        background: "var(--color-border-light)",
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barPct}%`,
                          height: "100%",
                          background: isDiversion
                            ? "linear-gradient(90deg, #d97706, #f59e0b)"
                            : "linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))",
                          borderRadius: "2px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </div>

                <div
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.8rem",
                  }}
                >
                  {step.amountPaid !== null && (
                    <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                      {formatAmount(step.amountPaid)}
                    </div>
                  )}
                  {step.shortfall !== null && step.shortfall > 0 && (
                    <div style={{ color: "var(--color-low)", fontSize: "0.68rem", fontWeight: 500 }}>
                      Shortfall: {formatAmount(step.shortfall)}
                    </div>
                  )}
                  {step.amountDue !== null && step.amountDue !== step.amountPaid && (
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.68rem" }}>
                      Due: {formatAmount(step.amountDue)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WaterfallVisualization({
  waterfallSteps,
  tranches,
  trancheSnapshots,
}: Props) {
  if (waterfallSteps.length === 0) {
    return (
      <div
        className="wf-section"
        style={{
          padding: "2.5rem",
          textAlign: "center",
          color: "var(--color-text-muted)",
          border: "1px dashed var(--color-border)",
          borderRadius: "var(--radius-sm)",
          marginBottom: "2rem",
          background: "var(--color-surface)",
        }}
      >
        No waterfall execution data available for this period.
      </div>
    );
  }

  const interestSteps = waterfallSteps.filter((s) => s.waterfallType === "INTEREST");
  const principalSteps = waterfallSteps.filter((s) => s.waterfallType === "PRINCIPAL");
  const combinedSteps = waterfallSteps.filter((s) => s.waterfallType === "COMBINED" || !s.waterfallType);

  const snapshotByTrancheId = new Map(trancheSnapshots.map((s) => [s.trancheId, s]));

  // Deduplicate tranches — extraction may create both "Class A Notes" and
  // "Class A Senior Secured Floating Rate Notes due 2035" for the same tranche.
  // Keep the one with more data (has snapshot, has balance, has spread).
  const deduped = deduplicateTranches(tranches, snapshotByTrancheId);

  const trancheRows = deduped
    .sort((a, b) => (a.seniorityRank ?? 99) - (b.seniorityRank ?? 99))
    .map((t) => {
      const snap = snapshotByTrancheId.get(t.id);
      return { tranche: t, snapshot: snap ?? null };
    });

  const hasPaymentData = trancheRows.some(
    (r) => r.snapshot && (r.snapshot.interestPaid != null || r.snapshot.principalPaid != null),
  );

  return (
    <div className="wf-section" style={{ marginBottom: "2.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-border-light)",
          paddingBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.2rem",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Waterfall Execution
        </h2>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          {waterfallSteps.length} steps
        </span>
      </div>

      {interestSteps.length > 0 && (
        <WaterfallSection title="Interest Waterfall" steps={interestSteps} />
      )}
      {principalSteps.length > 0 && (
        <WaterfallSection title="Principal Waterfall" steps={principalSteps} />
      )}
      {combinedSteps.length > 0 && interestSteps.length === 0 && principalSteps.length === 0 && (
        <WaterfallSection title="Payment Waterfall" steps={combinedSteps} />
      )}

      {trancheRows.length > 0 && (() => {
        const hasPaymentData = trancheRows.some((r) => r.snapshot);
        return (
        <div style={{ marginTop: "2rem" }}>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}
          >
            {hasPaymentData ? "Tranche Payment Summary" : "Capital Structure"}
          </h3>
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--color-border-light)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <table
              className="wf-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid var(--color-border)",
                    textAlign: "left",
                    background: "var(--color-surface)",
                  }}
                >
                  {["Class", "Balance", ...(hasPaymentData ? ["Interest", "Principal", "Shortfall"] : [])].map((col) => (
                    <th key={col} style={{ padding: "0.6rem 0.75rem", textAlign: col === "Class" ? "left" : "right", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trancheRows.map(({ tranche, snapshot }) => (
                  <tr
                    key={tranche.id}
                    style={{ borderBottom: "1px solid var(--color-border-light)" }}
                  >
                    <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                      {tranche.className}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                      {formatAmount(snapshot?.currentBalance ?? tranche.originalBalance)}
                    </td>
                    {hasPaymentData && (
                      <>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                          {formatAmount(snapshot?.interestPaid ?? null)}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                          {formatAmount(snapshot?.principalPaid ?? null)}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem 0.75rem",
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.78rem",
                            color:
                              snapshot?.interestShortfall && snapshot.interestShortfall > 0
                                ? "var(--color-low)"
                                : undefined,
                            fontWeight:
                              snapshot?.interestShortfall && snapshot.interestShortfall > 0
                                ? 600
                                : undefined,
                          }}
                        >
                          {formatAmount(snapshot?.interestShortfall ?? null)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
