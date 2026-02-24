"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/ic/GeneratingProgress";

const PHASES = [
  { key: "profile-analysis", label: "Profile Analysis" },
  { key: "committee-generation", label: "Committee Generation" },
  { key: "avatar-mapping", label: "Avatar Mapping" },
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
