"use client";

import { useEffect, useState, useRef } from "react";

interface Phase {
  key: string;
  label: string;
}

interface GeneratingProgressProps {
  streamUrl: string;
  phases: Phase[];
  onComplete: () => void;
  onError?: (message: string) => void;
}

export default function GeneratingProgress({
  streamUrl,
  phases,
  onComplete,
  onError,
}: GeneratingProgressProps) {
  const [completedPhases, setCompletedPhases] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.phases) {
        setCompletedPhases(new Set(data.phases));
      }

      if (data.status === "complete") {
        closedRef.current = true;
        es.close();
        onComplete();
      }

      if (data.status === "error") {
        closedRef.current = true;
        es.close();
        const msg = data.message || "An error occurred";
        setErrorMessage(msg);
        onError?.(msg);
      }
    };

    es.onerror = () => {
      if (closedRef.current) return;
      es.close();
      setErrorMessage("Connection lost. Please refresh.");
      onError?.("Connection lost");
    };

    return () => {
      closedRef.current = true;
      es.close();
    };
  }, [streamUrl, onComplete, onError]);

  const activeIndex = phases.findIndex((p) => !completedPhases.has(p.key));

  return (
    <div className="progress-phases">
      {phases.map((phase, i) => {
        const isDone = completedPhases.has(phase.key);
        const isActive = i === activeIndex && !errorMessage;
        const status = isDone ? "done" : isActive ? "active" : "upcoming";

        return (
          <div key={phase.key} className={`phase-row ${status}`}>
            <div className={`phase-dot ${status}`}>
              {isDone ? "\u2713" : i + 1}
            </div>
            <span className={`phase-label ${status}`}>{phase.label}</span>
          </div>
        );
      })}

      {errorMessage && (
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ color: "var(--color-low)", fontSize: "0.9rem" }}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
