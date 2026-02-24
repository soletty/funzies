import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getProfileForUser, getPanelForUser } from "@/lib/clo/access";
import Link from "next/link";
import type { PanelMember } from "@/lib/clo/types";

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
            Build your personal AI credit panel. Complete a brief
            questionnaire about your CLO strategy, and we will generate a
            panel of specialists tailored to your approach.
          </p>
          <Link href="/clo/onboarding" className="btn-primary">
            Get Started
          </Link>
        </div>
      </div>
    );
  }

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
          <Link href="/clo/analyze/new" className="btn-primary">
            New Analysis
          </Link>
          <Link href="/clo/screenings" className="btn-secondary">
            Portfolio Screening
          </Link>
        </div>
      </header>

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
