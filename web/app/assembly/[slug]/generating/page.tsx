"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const PHASES = [
  { key: "domain-analysis", label: "Domain Analysis" },
  { key: "character-generation", label: "Character Generation" },
  { key: "reference-library", label: "Reference Library" },
  { key: "debate", label: "Debate (Grande Table)" },
  { key: "synthesis", label: "Synthesis" },
  { key: "deliverable", label: "Deliverables" },
  { key: "verification", label: "Verification" },
] as const;

type Status = "queued" | "running" | "complete" | "error" | "cancelled";

function phaseIndex(phase: string): number {
  return PHASES.findIndex((p) => p.key === phase);
}

export default function GeneratingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assemblyId = searchParams.get("id");

  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [status, setStatus] = useState<Status>("queued");
  const [slug, setSlug] = useState<string>("");
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!assemblyId) {
      setError("Missing assembly ID.");
      return;
    }

    const es = new EventSource(`/api/assemblies/${assemblyId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "state":
          setStatus(data.status);
          setCurrentPhase(data.currentPhase || "");
          setSlug(data.slug || "");
          if (data.status === "complete" && data.slug) {
            es.close();
            router.push(`/assembly/${data.slug}`);
          }
          break;
        case "phase":
          setCurrentPhase(data.phase || "");
          setStatus("running");
          break;
        case "status":
          setStatus(data.status);
          if (data.slug) setSlug(data.slug);
          if (data.status === "complete" && data.slug) {
            es.close();
            router.push(`/assembly/${data.slug}`);
          }
          break;
        case "error":
          setError(data.content || "An error occurred.");
          es.close();
          break;
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [assemblyId, router]);

  const activeIndex = phaseIndex(currentPhase);

  if (error) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "480px", width: "100%", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>{error}</p>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              padding: "0.6rem 1.2rem",
              background: "var(--color-accent)",
              color: "#fff",
              borderRadius: "var(--radius)",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error" || status === "cancelled") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "480px", width: "100%", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Assembly {status === "error" ? "failed" : "cancelled"}
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
            {status === "error"
              ? "An error occurred during generation. Please try again."
              : "This assembly was cancelled."}
          </p>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              padding: "0.6rem 1.2rem",
              background: "var(--color-accent)",
              color: "#fff",
              borderRadius: "var(--radius)",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "520px", width: "100%", padding: "2rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.8rem",
          fontWeight: 700,
          textAlign: "center",
          marginBottom: "0.5rem",
        }}>
          Assembling your debate
        </h1>
        <p style={{
          color: "var(--color-text-secondary)",
          textAlign: "center",
          marginBottom: "2.5rem",
          lineHeight: 1.6,
        }}>
          {status === "queued"
            ? "Waiting to start..."
            : "Characters are deliberating. This typically takes a few minutes."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {PHASES.map((phase, i) => {
            const isCompleted = activeIndex > i;
            const isCurrent = activeIndex === i && status === "running";
            const isUpcoming = activeIndex < i || (activeIndex === -1 && status !== "complete");

            return (
              <PhaseRow
                key={phase.key}
                label={phase.label}
                state={isCompleted ? "done" : isCurrent ? "active" : isUpcoming ? "upcoming" : "upcoming"}
              />
            );
          })}
        </div>

        {slug && (
          <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            You can leave this page. The assembly will continue in the background.
          </p>
        )}
      </div>
    </div>
  );
}

function PhaseRow({ label, state }: { label: string; state: "done" | "active" | "upcoming" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        background: state === "active" ? "var(--color-surface)" : "transparent",
        borderRadius: "var(--radius-sm)",
        border: state === "active" ? "1px solid var(--color-border)" : "1px solid transparent",
        opacity: state === "upcoming" ? 0.4 : 1,
        transition: "var(--transition)",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 600,
          flexShrink: 0,
          background:
            state === "done"
              ? "var(--color-high)"
              : state === "active"
                ? "var(--color-accent)"
                : "var(--color-surface-alt)",
          color: state === "done" || state === "active" ? "#fff" : "var(--color-text-muted)",
          animation: state === "active" ? "pulse 2s ease-in-out infinite" : "none",
        }}
      >
        {state === "done" ? "\u2713" : state === "active" ? "\u2022" : "\u2022"}
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.95rem",
          fontWeight: state === "active" ? 600 : state === "done" ? 500 : 400,
          color:
            state === "done"
              ? "var(--color-text)"
              : state === "active"
                ? "var(--color-text)"
                : "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
