import Link from "next/link";

interface EvaluationCardProps {
  evaluation: {
    id: string;
    title: string;
    company_name: string | null;
    status: string;
    opportunity_type: string | null;
    created_at: string;
  };
}

export default function EvaluationCard({ evaluation }: EvaluationCardProps) {
  return (
    <Link href={`/ic/evaluate/${evaluation.id}`} className="ic-eval-card">
      <div className="ic-eval-title">
        {evaluation.title || evaluation.company_name || "Untitled"}
      </div>
      <div className="ic-eval-meta">
        <span className={`ic-eval-status ic-eval-status-${evaluation.status}`}>
          {evaluation.status}
        </span>
        {evaluation.opportunity_type && (
          <span className="ic-eval-type-tag">{evaluation.opportunity_type}</span>
        )}
        <span>
          {new Date(evaluation.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}
