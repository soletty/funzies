"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/ic/GeneratingProgress";

const PHASES = [
  {
    key: "profile-analysis",
    label: "Analyzing Your Investment Profile",
    subtitle: "Mapping your philosophy, risk tolerance, and asset preferences to identify the expertise your committee needs",
    estimatedSeconds: 30,
  },
  {
    key: "committee-generation",
    label: "Assembling Your Committee",
    subtitle: "Generating 5\u20137 senior investment professionals with diverse frameworks, specializations, and blind spots tailored to your approach",
    estimatedSeconds: 60,
  },
  {
    key: "avatar-mapping",
    label: "Crafting Visual Identities",
    subtitle: "Creating distinctive portraits for each committee member",
    estimatedSeconds: 15,
  },
];

export default function CommitteeGeneratingPage() {
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const handleComplete = useCallback(() => {
    router.push("/ic/committee");
  }, [router]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="ic-content">
      <div className="ic-generating">
        <div className="standalone-header">
          <h1>Assembling Your Committee</h1>
          <p>
            We are analyzing your investment profile and building a bespoke
            committee of specialists.
          </p>
        </div>

        <GeneratingProgress
          streamUrl="/api/ic/committee/stream"
          phases={PHASES}
          onComplete={handleComplete}
          onError={handleError}
        />

        <div style={{ textAlign: "center", marginTop: "2rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            className="btn-secondary"
            onClick={() => router.push("/ic")}
          >
            Back to Dashboard
          </button>
          {hasError && (
            <button
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
