"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewScreeningForm() {
  const [focusArea, setFocusArea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/clo/screenings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focusArea: focusArea.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start screening.");
      setSubmitting(false);
      return;
    }

    const { id } = await res.json();
    router.push(`/clo/screenings/${id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="ic-new-idea-form">
      <textarea
        className="ic-textarea"
        rows={3}
        value={focusArea}
        onChange={(e) => setFocusArea(e.target.value)}
        placeholder="Optional: focus on a specific area (e.g., 'healthcare first lien loans', 'B2-rated technology credits with SOFR+400 or wider')..."
        disabled={submitting}
      />
      {error && <p className="ic-error">{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting}
        >
          {submitting ? "Screening..." : "Start Screening"}
        </button>
      </div>
    </form>
  );
}
