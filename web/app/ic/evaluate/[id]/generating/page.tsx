"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/ic/GeneratingProgress";

const PHASES = [
  { key: "opportunity-analysis", label: "Opportunity Analysis" },
  { key: "dynamic-specialists", label: "Specialist Check" },
  { key: "individual-assessments", label: "Individual Assessments" },
  { key: "debate", label: "Committee Debate" },
  { key: "memo", label: "Investment Memo" },
  { key: "risk-assessment", label: "Risk Assessment" },
  { key: "recommendation", label: "Recommendation" },
];

export default function EvaluationGeneratingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const handleComplete = useCallback(() => {
    router.push(`/ic/evaluate/${id}/memo`);
  }, [router, id]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="ic-generating">
      <div className="standalone-header">
        <h1>Evaluating Investment</h1>
        <p>
          Your committee is analyzing this opportunity. This typically takes a
          few minutes.
        </p>
      </div>

      <GeneratingProgress
        streamUrl={`/api/ic/evaluations/${id}/stream`}
        phases={PHASES}
        onComplete={handleComplete}
        onError={handleError}
      />

      {hasError && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push("/ic")}
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
