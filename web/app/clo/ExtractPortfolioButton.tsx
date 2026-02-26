"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExtractPortfolioButton({ hasPortfolio }: { hasPortfolio: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleExtract() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/clo/profile/extract-portfolio", { method: "POST" });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Extraction failed");
      setLoading(false);
      return;
    }

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
      {error && (
        <span style={{ color: "var(--color-error)", fontSize: "0.8rem" }}>{error}</span>
      )}
    </div>
  );
}
