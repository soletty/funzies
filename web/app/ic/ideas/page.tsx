import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCommitteeForUser } from "@/lib/ic/access";
import Link from "next/link";
import NewIdeaForm from "./NewIdeaForm";

interface IdeaRow {
  id: string;
  focus_area: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default async function IdeasPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const committee = await getCommitteeForUser(session.user.id);

  if (!committee || committee.status !== "active") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Investment Ideas</h1>
          <p>
            You need an active committee before generating ideas. Complete
            onboarding to get started.
          </p>
          <Link href="/ic" className="btn-primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const ideas = await query<IdeaRow>(
    `SELECT id, focus_area, status, created_at, completed_at
     FROM ic_ideas
     WHERE committee_id = $1
     ORDER BY created_at DESC`,
    [committee.id]
  );

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Investment Ideas</h1>
          <p>Generate and explore investment opportunities with your committee</p>
        </div>
      </header>

      <section className="ic-section">
        <h2>Generate New Ideas</h2>
        <NewIdeaForm />
      </section>

      {ideas.length > 0 && (
        <section className="ic-section">
          <h2>Past Sessions</h2>
          <div className="ic-eval-list">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                href={`/ic/ideas/${idea.id}`}
                className="ic-eval-card"
              >
                <div className="ic-eval-title">
                  {idea.focus_area || "General Ideas"}
                </div>
                <div className="ic-eval-meta">
                  <span className={`ic-eval-status ic-eval-status-${idea.status}`}>
                    {idea.status}
                  </span>
                  <span>
                    {new Date(idea.created_at).toLocaleDateString("en-US", {
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
