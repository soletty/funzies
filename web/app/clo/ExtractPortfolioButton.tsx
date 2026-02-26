"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExtractPortfolioButton({ hasPortfolio }: { hasPortfolio: boolean }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleExtract() {
    setLoading(true);
    setError("");
    setStatus("Starting extraction...");

    const res = await fetch("/api/clo/report/extract", { method: "POST" });

    if (!res.ok) {
      // Fall back to legacy endpoint
      setStatus("Trying legacy extraction...");
      const legacyRes = await fetch("/api/clo/profile/extract-portfolio", { method: "POST" });
      if (!legacyRes.ok) {
        const data = await legacyRes.json().catch(() => ({}));
        setError(data.error || "Extraction failed");
        setLoading(false);
        setStatus("");
        return;
      }
    }

    setStatus("Extraction complete!");
    setLoading(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <button
        className={hasPortfolio ? "btn-secondary" : "btn-primary"}
        onClick={handleExtract}
        disabled={loading}
        style={{ fontSize: "0.85rem" }}
      >
        {loading
          ? "Extracting..."
          : hasPortfolio
            ? "Re-extract Portfolio Data"
            : "Extract Portfolio Data"}
      </button>
      {loading && status && (
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{status}</span>
      )}
      {error && (
        <span style={{ color: "var(--color-error)", fontSize: "0.8rem" }}>{error}</span>
      )}
    </div>
  );
}
