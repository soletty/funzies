"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function UpdateComplianceReport({ hasPortfolio }: { hasPortfolio: boolean }) {
  const [status, setStatus] = useState<"idle" | "uploading" | "extracting">("idle");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";

    setError("");
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", "compliance");

      const uploadRes = await fetch("/api/clo/profile/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        setError(data.error || "Upload failed");
        setStatus("idle");
        return;
      }

      setStatus("extracting");

      const extractRes = await fetch("/api/clo/report/extract", { method: "POST" });

      if (!extractRes.ok) {
        const data = await extractRes.json().catch(() => ({}));
        setError(data.error || "Extraction failed");
        setStatus("idle");
        return;
      }

      router.refresh();
      setStatus("idle");
    } catch (e) {
      setError(`Failed: ${(e as Error).message}`);
      setStatus("idle");
    }
  }

  const buttonLabel =
    status === "uploading"
      ? "Uploading..."
      : status === "extracting"
        ? "Extracting..."
        : hasPortfolio
          ? "Update Report"
          : "Upload Report";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />
      <button
        className={hasPortfolio ? "btn-secondary" : "btn-primary"}
        onClick={() => fileInputRef.current?.click()}
        disabled={status !== "idle"}
        style={{ fontSize: "0.85rem" }}
      >
        {buttonLabel}
      </button>
      {status === "extracting" && (
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          Extracting report data...
        </span>
      )}
      {error && (
        <span style={{ color: "var(--color-error)", fontSize: "0.8rem" }}>{error}</span>
      )}
    </div>
  );
}
