import Link from "next/link";

interface AnalysisCardProps {
  analysis: {
    id: string;
    title: string;
    borrower_name: string | null;
    status: string;
    analysis_type: string | null;
    created_at: string;
  };
}

export default function AnalysisCard({ analysis }: AnalysisCardProps) {
  return (
    <Link href={`/clo/analyze/${analysis.id}`} className="ic-eval-card">
      <div className="ic-eval-title">
        {analysis.title || analysis.borrower_name || "Untitled"}
      </div>
      <div className="ic-eval-meta">
        <span className={`ic-eval-status ic-eval-status-${analysis.status}`}>
          {analysis.status}
        </span>
        {analysis.analysis_type && (
          <span className="ic-eval-type-tag">{analysis.analysis_type}</span>
        )}
        <span>
          {new Date(analysis.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}
