"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/clo/GeneratingProgress";

const PHASES = [
  { key: "credit-analysis", label: "Credit Analysis" },
  { key: "dynamic-specialists", label: "Specialist Check" },
  { key: "individual-assessments", label: "Individual Assessments" },
  { key: "debate", label: "Panel Debate" },
  { key: "memo", label: "Credit Memo" },
  { key: "risk-assessment", label: "Risk Assessment" },
  { key: "recommendation", label: "Recommendation" },
];

export default function AnalysisGeneratingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const handleComplete = useCallback(() => {
    router.push(`/clo/analyze/${id}/memo`);
  }, [router, id]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="ic-generating">
      <div className="standalone-header">
        <h1>Analyzing Loan</h1>
        <p>
          Your credit panel is analyzing this opportunity. This typically takes a
          few minutes.
        </p>
      </div>

      <GeneratingProgress
        streamUrl={`/api/clo/analyses/${id}/stream`}
        phases={PHASES}
        onComplete={handleComplete}
        onError={handleError}
      />

      {hasError && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push("/clo")}
          >
            Back to Dashboard
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
