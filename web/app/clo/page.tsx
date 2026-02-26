import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getProfileForUser, getProfileDocumentMeta, getPanelForUser, rowToProfile } from "@/lib/clo/access";
import Link from "next/link";
import type { PanelMember } from "@/lib/clo/types";
import type { ExtractedConstraints, ExtractedPortfolio, ComplianceTest, PortfolioMetric, ConcentrationBreakdown } from "@/lib/clo/types";
import ExtractPortfolioButton from "./ExtractPortfolioButton";
import BriefingCard from "@/components/BriefingCard";

function CLOHealthSummary({ constraints }: { constraints: Record<string, unknown> | null }) {
  if (!constraints || Object.keys(constraints).length === 0) return null;

  const c = constraints as unknown as ExtractedConstraints;
  const items: { label: string; value: string }[] = [];

  if (c.warfLimit != null) items.push({ label: "WARF Limit", value: String(c.warfLimit) });
  if (c.wasMinimum != null) items.push({ label: "WAS Min", value: `${c.wasMinimum} bps` });
  if (c.walMaximum != null) items.push({ label: "WAL Max", value: `${c.walMaximum}y` });
  if (c.diversityScoreMinimum != null) items.push({ label: "Diversity Min", value: String(c.diversityScoreMinimum) });

  if (c.concentrationLimits) {
    if (c.concentrationLimits.singleName) items.push({ label: "Single Name", value: c.concentrationLimits.singleName });
    if (c.concentrationLimits.industry) items.push({ label: "Industry", value: c.concentrationLimits.industry });
    if (c.concentrationLimits.ccc) items.push({ label: "CCC Bucket", value: c.concentrationLimits.ccc });
  }

  if (c.coverageTests) {
    if (c.coverageTests.ocSenior) items.push({ label: "OC Senior", value: c.coverageTests.ocSenior });
    if (c.coverageTests.icSenior) items.push({ label: "IC Senior", value: c.coverageTests.icSenior });
  }

  if (c.reinvestmentPeriod?.end) {
    items.push({ label: "RP End", value: c.reinvestmentPeriod.end });
  }
  if (c.nonCallPeriod?.end) {
    items.push({ label: "Non-Call End", value: c.nonCallPeriod.end });
  }

  if (items.length === 0) return null;

  return (
    <section className="ic-section">
      <h2>Vehicle Constraints</h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "0.75rem",
      }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              padding: "0.6rem 0.8rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {item.label}
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "0.2rem" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function cushionColor(cushion: number): string {
  if (cushion >= 5) return "var(--color-success, #22c55e)";
  if (cushion >= 2) return "var(--color-warning, #eab308)";
  return "var(--color-error, #ef4444)";
}

function TestComplianceSection({ tests }: { tests: ComplianceTest[] }) {
  if (!tests || tests.length === 0) return null;
  return (
    <section className="ic-section">
      <h2>Test Compliance</h2>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {tests.map((t) => {
          const maxVal = Math.max(t.actual, t.trigger) * 1.1;
          const actualPct = (t.actual / maxVal) * 100;
          const triggerPct = (t.trigger / maxVal) * 100;
          const color = cushionColor(t.cushion);
          return (
            <div key={t.name}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {t.actual.toFixed(1)}% (trigger: {t.trigger.toFixed(1)}%, cushion: {t.cushion >= 0 ? "+" : ""}{t.cushion.toFixed(1)}%)
                </span>
              </div>
              <div style={{ position: "relative", height: "1.25rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${actualPct}%`, background: color, opacity: 0.3, borderRadius: "var(--radius-sm)" }} />
                <div style={{ position: "absolute", top: 0, left: `${triggerPct}%`, width: "2px", height: "100%", background: "var(--color-text-muted)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PortfolioMetricsSection({ metrics }: { metrics: PortfolioMetric[] }) {
  if (!metrics || metrics.length === 0) return null;
  return (
    <section className="ic-section">
      <h2>Portfolio Metrics</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
        {metrics.map((m) => {
          const ratio = m.limit > 0 && m.current > 0
            ? (m.direction === "max" ? (m.current / m.limit) * 100 : (m.limit / m.current) * 100)
            : 0;
          const pct = Math.min(ratio, 100);
          const color = m.passing
            ? "var(--color-success, #22c55e)"
            : "var(--color-error, #ef4444)";
          return (
            <div key={m.name} style={{ padding: "0.6rem 0.8rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.3rem" }}>
                <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.name}</span>
                <span>{m.direction === "max" ? "max" : "min"}: {m.limit}</span>
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem" }}>{m.current}</div>
              <div style={{ height: "0.4rem", background: "var(--color-border)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "2px" }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CccBucketSection({ ccc }: { ccc: ExtractedPortfolio["cccBucket"] }) {
  if (!ccc) return null;
  const pct = ccc.limit > 0 ? (ccc.current / ccc.limit) * 100 : 0;
  const color = pct < 70
    ? "var(--color-success, #22c55e)"
    : pct < 90
      ? "var(--color-warning, #eab308)"
      : "var(--color-error, #ef4444)";
  return (
    <section className="ic-section">
      <h2>CCC Bucket</h2>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>{ccc.current}%</span>
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>/ {ccc.limit}% limit</span>
      </div>
      <div style={{ height: "0.5rem", background: "var(--color-border)", borderRadius: "3px", overflow: "hidden", marginBottom: "0.75rem" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: "3px" }} />
      </div>
      {ccc.holdings && ccc.holdings.length > 0 && (
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          <span style={{ fontWeight: 600 }}>CCC Holdings:</span>{" "}
          {ccc.holdings.join(", ")}
        </div>
      )}
    </section>
  );
}

function ConcentrationsSection({ concentrations }: { concentrations: ExtractedPortfolio["concentrations"] }) {
  if (!concentrations) return null;
  const hasSector = concentrations.bySector?.length > 0;
  const hasRating = concentrations.byRating?.length > 0;
  const hasTop = concentrations.topExposures?.length > 0;
  if (!hasSector && !hasRating && !hasTop) return null;

  function renderBars(items: ConcentrationBreakdown[]) {
    return items.map((item) => (
      <div key={item.category} style={{ marginBottom: "0.4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.15rem" }}>
          <span>{item.category}</span>
          <span>{item.percentage.toFixed(1)}%{item.limit != null ? ` / ${item.limit}%` : ""}</span>
        </div>
        <div style={{ position: "relative", height: "0.5rem", background: "var(--color-border)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(item.percentage, 100)}%`,
            background: item.limit != null && item.percentage > item.limit
              ? "var(--color-error, #ef4444)"
              : "var(--color-accent)",
            borderRadius: "3px",
          }} />
          {item.limit != null && (
            <div style={{ position: "absolute", top: 0, left: `${Math.min(item.limit, 100)}%`, width: "2px", height: "100%", background: "var(--color-text-muted)" }} />
          )}
        </div>
      </div>
    ));
  }

  const columns = [hasSector, hasRating, hasTop].filter(Boolean).length;
  const gridCols = columns >= 3 ? "1fr 1fr 1fr" : columns === 2 ? "1fr 1fr" : "1fr";

  return (
    <section className="ic-section">
      <h2>Concentrations</h2>
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "1.5rem" }}>
        {hasSector && (
          <div>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>By Sector</h3>
            {renderBars(concentrations.bySector)}
          </div>
        )}
        {hasRating && (
          <div>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>By Rating</h3>
            {renderBars(concentrations.byRating)}
          </div>
        )}
        {hasTop && (
          <div>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>Top Exposures</h3>
            {renderBars(concentrations.topExposures)}
          </div>
        )}
      </div>
    </section>
  );
}

function HoldingsPreview({ holdings }: { holdings: ExtractedPortfolio["holdings"] }) {
  if (!holdings || holdings.length === 0) return null;
  const top20 = [...holdings].sort((a, b) => b.notional - a.notional).slice(0, 20);
  return (
    <section className="ic-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Top Holdings ({holdings.length} total)</h2>
        <Link href="/clo/holdings" className="ic-section-link" style={{ marginTop: 0 }}>
          View all &rarr;
        </Link>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Issuer</th>
              <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Notional (K)</th>
              <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Rating</th>
              <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Spread</th>
              <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Sector</th>
            </tr>
          </thead>
          <tbody>
            {top20.map((h, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.4rem 0.6rem" }}>{h.issuer}</td>
                <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{h.notional.toLocaleString()}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{h.rating}</td>
                <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{h.spread}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{h.sector}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface AnalysisRow {
  id: string;
  title: string;
  borrower_name: string;
  analysis_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default async function CLODashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);

  if (!profile) {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Credit Panel</h1>
          <p>
            Upload your PPM and compliance report to get started. We&apos;ll extract
            your CLO&apos;s constraints and build a bespoke panel of credit specialists.
          </p>
          <Link href="/clo/onboarding" className="btn-primary">
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  const cloProfile = rowToProfile(profile as unknown as Record<string, unknown>);
  const portfolio = cloProfile.extractedPortfolio;
  const documentMeta = await getProfileDocumentMeta(session.user.id);
  const hasDocuments = documentMeta.length > 0;

  const panel = await getPanelForUser(session.user.id);

  if (!panel || panel.status === "queued" || panel.status === "generating") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Panel Generating</h1>
          <p>
            Your credit panel is being assembled. This typically takes a
            few minutes. Refresh to check progress.
          </p>
          {panel && (
            <Link href="/clo/panel/generating" className="btn-secondary">
              View Progress
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (panel.status === "error") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Panel Error</h1>
          <p>
            There was an issue generating your panel.{" "}
            {panel.error_message || "Please try again."}
          </p>
          <Link href="/clo/onboarding" className="btn-primary">
            Retry Onboarding
          </Link>
        </div>
      </div>
    );
  }

  const members = (panel.members || []) as PanelMember[];

  const analyses = await query<AnalysisRow>(
    `SELECT id, title, borrower_name, analysis_type, status, created_at, completed_at
     FROM clo_analyses
     WHERE panel_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [panel.id]
  );

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Credit Panel</h1>
          <p>
            {members.length} member{members.length !== 1 ? "s" : ""} &middot;{" "}
            {analyses.length} analysis{analyses.length !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="ic-dashboard-actions">
          <Link href="/clo/chat" className="btn-primary">
            Chat with Analyst
          </Link>
          <Link href="/clo/analyze/new" className="btn-secondary">
            New Analysis
          </Link>
          <Link href="/clo/screenings" className="btn-secondary">
            Portfolio Screening
          </Link>
        </div>
      </header>

      <BriefingCard product="clo" />

      {documentMeta.length > 0 && (
        <section className="ic-section">
          <h2>CLO Documents</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {documentMeta.map((doc, i) => (
              <span
                key={i}
                style={{
                  padding: "0.3rem 0.7rem",
                  background: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              >
                {doc.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <CLOHealthSummary constraints={profile.extracted_constraints as Record<string, unknown> | null} />

      {hasDocuments && (
        <section className="ic-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>
              Portfolio State
              {portfolio?.reportDate && (
                <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                  as of {portfolio.reportDate}
                </span>
              )}
            </h2>
            <ExtractPortfolioButton hasPortfolio={!!portfolio} />
          </div>
          {!portfolio && (
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
              No portfolio data extracted yet. Click the button above to extract holdings, compliance tests, and concentrations from your compliance report.
            </p>
          )}
        </section>
      )}

      {portfolio && (
        <>
          <TestComplianceSection tests={portfolio.testResults} />
          <PortfolioMetricsSection metrics={portfolio.metrics} />
          <CccBucketSection ccc={portfolio.cccBucket} />
          <ConcentrationsSection concentrations={portfolio.concentrations} />
          <HoldingsPreview holdings={portfolio.holdings} />
        </>
      )}

      <section className="ic-section">
        <h2>Your Panel</h2>
        <div className="ic-member-grid">
          {members.slice(0, 6).map((m) => (
            <div key={m.number} className="ic-member-card">
              <div className="ic-member-name">{m.name}</div>
              <div className="ic-member-role">{m.role}</div>
              <div className="ic-member-spec">
                {m.specializations?.slice(0, 2).join(", ")}
              </div>
            </div>
          ))}
        </div>
        <Link href="/clo/panel" className="ic-section-link">
          View full panel &rarr;
        </Link>
      </section>

      {analyses.length > 0 && (
        <section className="ic-section">
          <h2>Recent Analyses</h2>
          <div className="ic-eval-list">
            {analyses.map((a) => (
              <Link
                key={a.id}
                href={`/clo/analyze/${a.id}`}
                className="ic-eval-card"
              >
                <div className="ic-eval-title">
                  {a.title || a.borrower_name}
                </div>
                <div className="ic-eval-meta">
                  <span className={`ic-eval-status ic-eval-status-${a.status}`}>
                    {a.status}
                  </span>
                  <span className="ic-eval-type-tag">{a.analysis_type}</span>
                  <span>
                    {new Date(a.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
