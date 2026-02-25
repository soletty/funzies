import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";
import Link from "next/link";

interface EvalRow {
  id: string;
  title: string;
  status: string;
  current_phase: string | null;
}

export default async function EvaluationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) {
    notFound();
  }

  const rows = await query<EvalRow>(
    "SELECT id, title, status, current_phase FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    notFound();
  }

  const evaluation = rows[0];
  const isComplete = evaluation.status === "complete";
  const base = `/ic/evaluate/${id}`;

  const tabs = [
    { label: "Memo", href: `${base}/memo`, show: isComplete },
    { label: "Risk", href: `${base}/risk`, show: isComplete },
    { label: "Perspective", href: `${base}/recommendation`, show: isComplete },
    { label: "Debate", href: `${base}/debate`, show: isComplete },
    { label: "Q&A", href: `${base}/follow-ups`, show: isComplete },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  return (
    <div className="ic-content">
      <div className="ic-eval-layout">
        <div className="ic-eval-header">
          <Link href="/ic" className="standalone-back">
            &larr; Dashboard
          </Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600 }}>
            {evaluation.title}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className={`ic-eval-status ic-eval-status-${evaluation.status}`}>
              {evaluation.status}
            </span>
            {isComplete && (
              <a
                href={`/api/ic/evaluations/${id}/export`}
                target="_blank"
                rel="noopener noreferrer"
                className="ic-export-btn"
                title="Export as printable PDF"
              >
                Export
              </a>
            )}
          </div>
        </div>

        {visibleTabs.length > 0 && (
          <nav className="ic-eval-tabs">
            {visibleTabs.map((tab) => (
              <Link key={tab.href} href={tab.href} className="ic-eval-tab">
                {tab.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ic-eval-body">{children}</div>

        <div className="ic-disclaimer">
          AI-generated analysis based on user-provided information. Not investment advice. All perspectives reflect simulated committee discussion and should be independently verified before any investment decision.
        </div>
      </div>
    </div>
  );
}
