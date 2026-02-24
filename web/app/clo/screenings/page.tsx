import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getPanelForUser } from "@/lib/clo/access";
import Link from "next/link";
import NewScreeningForm from "./NewScreeningForm";

interface ScreeningRow {
  id: string;
  focus_area: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default async function ScreeningsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const panel = await getPanelForUser(session.user.id);

  if (!panel || panel.status !== "active") {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Portfolio Screening</h1>
          <p>
            You need an active panel before running screenings. Complete
            onboarding to get started.
          </p>
          <Link href="/clo" className="btn-primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const screenings = await query<ScreeningRow>(
    `SELECT id, focus_area, status, created_at, completed_at
     FROM clo_screenings
     WHERE panel_id = $1
     ORDER BY created_at DESC`,
    [panel.id]
  );

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Portfolio Screening</h1>
          <p>Identify loan opportunities and portfolio gaps with your credit panel</p>
        </div>
      </header>

      <section className="ic-section">
        <h2>New Screening</h2>
        <NewScreeningForm />
      </section>

      {screenings.length > 0 && (
        <section className="ic-section">
          <h2>Past Screenings</h2>
          <div className="ic-eval-list">
            {screenings.map((screening) => (
              <Link
                key={screening.id}
                href={`/clo/screenings/${screening.id}`}
                className="ic-eval-card"
              >
                <div className="ic-eval-title">
                  {screening.focus_area || "General Screening"}
                </div>
                <div className="ic-eval-meta">
                  <span className={`ic-eval-status ic-eval-status-${screening.status}`}>
                    {screening.status}
                  </span>
                  <span>
                    {new Date(screening.created_at).toLocaleDateString("en-US", {
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
