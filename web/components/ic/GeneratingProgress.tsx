"use client";

import { useEffect, useState, useRef } from "react";

interface Phase {
  key: string;
  label: string;
  subtitle?: string;
  estimatedSeconds?: number;
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
  const [activeStartTime, setActiveStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);

  const activeIndex = phases.findIndex((p) => !completedPhases.has(p.key));
  const activePhase = activeIndex >= 0 ? phases[activeIndex] : null;

  useEffect(() => {
    closedRef.current = false;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.phases) {
        setCompletedPhases(new Set(data.phases));
        setActiveStartTime(Date.now());
        setElapsed(0);
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

  useEffect(() => {
    if (!activeStartTime || errorMessage) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStartTime, errorMessage]);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

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
            <div className="phase-info">
              <span className={`phase-label ${status}`}>{phase.label}</span>
              {phase.subtitle && (
                <span className={`phase-subtitle ${status}`}>{phase.subtitle}</span>
              )}
              {isActive && activePhase?.estimatedSeconds && (
                <span className="phase-timing">
                  {elapsed}s{activePhase.estimatedSeconds ? ` / ~${formatTime(activePhase.estimatedSeconds)}` : ""}
                </span>
              )}
            </div>
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
