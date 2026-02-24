import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getProfileForUser, getCommitteeForUser } from "@/lib/ic/access";
import Link from "next/link";
import type { CommitteeMember } from "@/lib/ic/types";

interface EvaluationRow {
  id: string;
  title: string;
  company_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default async function ICDashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);

  if (!profile) {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Investment Committee</h1>
          <p>
            Build your personal AI investment committee. Complete a brief
            questionnaire about your investment profile, and we will generate a
            committee of specialists tailored to your approach.
          </p>
          <Link href="/ic/onboarding" className="btn-primary">
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  const committee = await getCommitteeForUser(session.user.id);

  if (!committee || committee.status === "queued" || committee.status === "generating") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Committee Generating</h1>
          <p>
            Your investment committee is being assembled. This typically takes a
            few minutes. Refresh to check progress.
          </p>
          {committee && (
            <Link href="/ic/committee/generating" className="btn-secondary">
              View Progress
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (committee.status === "error") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Committee Error</h1>
          <p>
            There was an issue generating your committee.{" "}
            {committee.error_message || "Please try again."}
          </p>
          <Link href="/ic/onboarding" className="btn-primary">
            Retry Onboarding
          </Link>
        </div>
      </div>
    );
  }

  const members = (committee.members || []) as CommitteeMember[];

  const evaluations = await query<EvaluationRow>(
    `SELECT id, title, company_name, status, created_at, completed_at
     FROM ic_evaluations
     WHERE committee_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [committee.id]
  );

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Investment Committee</h1>
          <p>
            {members.length} member{members.length !== 1 ? "s" : ""} &middot;{" "}
            {evaluations.length} evaluation{evaluations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="ic-dashboard-actions">
          <Link href="/ic/evaluate/new" className="btn-primary">
            New Evaluation
          </Link>
          <Link href="/ic/ideas" className="btn-secondary">
            Generate Ideas
          </Link>
        </div>
      </header>

      <section className="ic-section">
        <h2>Your Committee</h2>
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
        <Link href="/ic/committee" className="ic-section-link">
          View full committee &rarr;
        </Link>
      </section>

      {evaluations.length > 0 && (
        <section className="ic-section">
          <h2>Recent Evaluations</h2>
          <div className="ic-eval-list">
            {evaluations.map((e) => (
              <Link
                key={e.id}
                href={`/ic/evaluate/${e.id}`}
                className="ic-eval-card"
              >
                <div className="ic-eval-title">
                  {e.title || e.company_name}
                </div>
                <div className="ic-eval-meta">
                  <span className={`ic-eval-status ic-eval-status-${e.status}`}>
                    {e.status}
                  </span>
                  <span>
                    {new Date(e.created_at).toLocaleDateString("en-US", {
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
