"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function DocumentUploadBanner() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const pollExtraction = useCallback(async () => {
    setExtracting(true);
    setStatusText("Extracting constraints from PPM...");

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const res = await fetch("/api/clo/profile/extract");
      if (!res.ok) continue;

      const data = await res.json();

      if (data.status === "complete") {
        if (data.extractedConstraints) {
          await fetch("/api/clo/profile/constraints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extractedConstraints: data.extractedConstraints }),
          });
        }
        setStatusText("");
        setExtracting(false);
        router.refresh();
        return;
      }

      if (data.status === "error") {
        setError(data.error || "Extraction failed");
        setExtracting(false);
        setStatusText("");
        return;
      }

      if (data.status === "extracting") {
        setStatusText("Extracting constraints from PPM (this may take several minutes for large documents)...");
      }
    }

    setError("Extraction timed out. Check back later.");
    setExtracting(false);
    setStatusText("");
  }, [router]);

  async function handleUpload() {
    if (files.length === 0) return;
    setError("");
    setUploading(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const uploadRes = await fetch("/api/clo/profile/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const data = await uploadRes.json();
      setError(data.error || "Upload failed.");
      setUploading(false);
      return;
    }

    // Queue PPM extraction
    await fetch("/api/clo/profile/extract", { method: "POST" });

    // Queue portfolio extraction in background
    fetch("/api/clo/profile/extract-portfolio", { method: "POST" }).catch(() => {});

    setUploading(false);
    setFiles([]);

    // Start polling for extraction completion
    pollExtraction();
    router.refresh();
  }

  const busy = uploading || extracting;

  return (
    <section className="ic-section" style={{
      background: "var(--color-accent-subtle)",
      border: "1px solid var(--color-accent)",
      borderRadius: "var(--radius-md)",
      padding: "1.25rem 1.5rem",
    }}>
      <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontFamily: "var(--font-display)" }}>
        Upload Your PPM
      </h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        Upload your PPM and compliance reports to unlock constraint extraction, portfolio monitoring,
        and compliance-aware analysis. Your analyst and panel will reference your actual vehicle limits
        in every conversation.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="btn-secondary"
          style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
        >
          {files.length > 0
            ? `${files.length} file${files.length !== 1 ? "s" : ""} selected`
            : "Choose PDFs"}
        </button>
        {files.length > 0 && (
          <button
            onClick={handleUpload}
            disabled={busy}
            className="btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
          >
            {uploading ? "Uploading..." : "Upload & Extract"}
          </button>
        )}
      </div>

      {files.length > 0 && !busy && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {files.map((f) => f.name).join(", ")}
        </div>
      )}

      {statusText && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="spinner" style={{ width: "0.8rem", height: "0.8rem" }} />
          {statusText}
        </div>
      )}

      {error && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-error, #ef4444)" }}>
          {error}
        </div>
      )}
    </section>
  );
}
