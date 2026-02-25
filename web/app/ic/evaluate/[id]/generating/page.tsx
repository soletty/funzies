"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/ic/GeneratingProgress";

const PHASES = [
  {
    key: "opportunity-analysis",
    label: "Analyzing the Opportunity",
    subtitle: "Extracting key facts, identifying information gaps, and assessing alignment with your investment profile",
    estimatedSeconds: 30,
  },
  {
    key: "dynamic-specialists",
    label: "Checking for Domain Expertise",
    subtitle: "Determining if this opportunity requires specialists beyond your standing committee",
    estimatedSeconds: 20,
  },
  {
    key: "individual-assessments",
    label: "Individual Member Assessments",
    subtitle: "Each committee member independently evaluates the opportunity through their unique investment lens",
    estimatedSeconds: 40,
  },
  {
    key: "debate",
    label: "Running Committee Debate",
    subtitle: "Members steel-man opposing views, test kill criteria, and identify what would change their minds across 3 structured rounds",
    estimatedSeconds: 60,
  },
  {
    key: "premortem",
    label: "Pre-Mortem Analysis",
    subtitle: "Each member narrates a plausible failure scenario from their expertise, then the committee ranks and stress-tests the most likely failures",
    estimatedSeconds: 35,
  },
  {
    key: "memo",
    label: "Drafting Investment Memo",
    subtitle: "Synthesizing the debate into a structured memo with thesis, risks, and what the committee doesn\u2019t know",
    estimatedSeconds: 40,
  },
  {
    key: "risk-assessment",
    label: "Assessing Risk Factors",
    subtitle: "Categorizing market, execution, financial, regulatory, concentration, and liquidity risks with mitigants",
    estimatedSeconds: 30,
  },
  {
    key: "recommendation",
    label: "Gathering Committee Perspectives",
    subtitle: "Each member shares their final perspective informed by the full debate and analysis",
    estimatedSeconds: 35,
  },
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
