"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewAssemblyPage() {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || submitting) return;

    setError("");
    setSubmitting(true);

    const res = await fetch("/api/assemblies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicInput: topic.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create assembly.");
      setSubmitting(false);
      return;
    }

    const { id, slug } = await res.json();
    router.push(`/assembly/${slug}/generating?id=${id}`);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "600px", width: "100%", padding: "2rem" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <Link
            href="/"
            style={{
              color: "var(--color-text-muted)",
              textDecoration: "none",
              fontSize: "0.85rem",
            }}
          >
            &larr; Back to dashboard
          </Link>
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.8rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
        }}>
          Launch New Assembly
        </h1>
        <p style={{
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
          marginBottom: "2rem",
        }}>
          Describe a topic or question. Six AI characters will debate it from radically
          different perspectives, producing a synthesis, deliverables, and verification.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-light)",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
          }}>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Describe your topic or question..."
              rows={5}
              style={{
                width: "100%",
                padding: "0.8rem 1rem",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                background: "var(--color-bg)",
                color: "var(--color-text)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              disabled={submitting}
            />

            {error && (
              <p style={{ color: "var(--color-low)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
                {error}
              </p>
            )}

            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={submitting || !topic.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.4rem",
                  background: submitting || !topic.trim() ? "var(--color-surface-alt)" : "var(--color-accent)",
                  color: submitting || !topic.trim() ? "var(--color-text-muted)" : "#fff",
                  border: "none",
                  borderRadius: "var(--radius)",
                  cursor: submitting || !topic.trim() ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  fontSize: "0.9rem",
                  transition: "var(--transition)",
                }}
              >
                {submitting ? "Launching..." : "Launch Assembly"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
