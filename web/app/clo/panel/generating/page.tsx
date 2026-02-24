"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import GeneratingProgress from "@/components/clo/GeneratingProgress";

const PHASES = [
  { key: "profile-analysis", label: "Profile Analysis" },
  { key: "panel-generation", label: "Panel Generation" },
  { key: "avatar-mapping", label: "Avatar Mapping" },
];

export default function PanelGeneratingPage() {
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const handleComplete = useCallback(() => {
    router.push("/clo/panel");
  }, [router]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="ic-content">
      <div className="ic-generating">
        <div className="standalone-header">
          <h1>Assembling Your Credit Panel</h1>
          <p>
            We are analyzing your CLO strategy and building a bespoke
            panel of credit specialists.
          </p>
        </div>

        <GeneratingProgress
          streamUrl="/api/clo/panel/stream"
          phases={PHASES}
          onComplete={handleComplete}
          onError={handleError}
        />

        <div style={{ textAlign: "center", marginTop: "2rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            className="btn-secondary"
            onClick={() => router.push("/clo")}
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
