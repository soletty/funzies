"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import GeneratingProgress from "@/components/ic/GeneratingProgress";

const PHASES = [
  { key: "signals", label: "Fetching Sources" },
  { key: "classification", label: "Classifying Signals" },
  { key: "profiles", label: "Profiling Movements" },
  { key: "deduplication", label: "Deduplication" },
  { key: "lifecycle", label: "Lifecycle Update" },
];

export default function PulseScanPage() {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function triggerScan() {
    setLoading(true);
    setHasError(false);
    try {
      const res = await fetch("/api/pulse/scan", { method: "POST" });
      if (!res.ok) {
        setHasError(true);
        return;
      }
      const data = await res.json();
      setScanId(data.id);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  const handleComplete = useCallback(() => {
    router.push("/pulse");
  }, [router]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="pulse-scan">
      <div className="standalone-header">
        <h1>Scan for Movements</h1>
        <p>
          Fetch signals from Reddit, GDELT, Bluesky, Wikipedia, news outlets,
          and Mastodon. Claude analyzes and classifies the results into movement
          profiles.
        </p>
      </div>

      {!scanId ? (
        <div className="pulse-scan-trigger">
          <button
            onClick={triggerScan}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? "Starting scan..." : "Start Scan"}
          </button>
        </div>
      ) : (
        <GeneratingProgress
          streamUrl={`/api/pulse/scan/${scanId}/stream`}
          phases={PHASES}
          onComplete={handleComplete}
          onError={handleError}
        />
      )}

      {hasError && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push("/pulse")}
          >
            Back to Dashboard
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setScanId(null);
              setHasError(false);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
