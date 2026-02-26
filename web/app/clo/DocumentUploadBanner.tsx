"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function DocumentUploadBanner() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

    // Extract constraints from the uploaded PPM
    const extractRes = await fetch("/api/clo/profile/extract", {
      method: "POST",
    });

    if (!extractRes.ok) {
      // Extraction failed but docs are uploaded — still useful
      setUploading(false);
      router.refresh();
      return;
    }

    // Save extracted constraints to the profile
    const extractData = await extractRes.json();
    if (extractData.extractedConstraints) {
      await fetch("/api/clo/profile/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedConstraints: extractData.extractedConstraints }),
      });
    }

    // Fire portfolio extraction in background
    fetch("/api/clo/profile/extract-portfolio", { method: "POST" }).catch(() => {});

    setUploading(false);
    router.refresh();
  }

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
          disabled={uploading}
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
            disabled={uploading}
            className="btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
          >
            {uploading ? "Uploading & extracting..." : "Upload & Extract"}
          </button>
        )}
      </div>

      {files.length > 0 && !uploading && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {files.map((f) => f.name).join(", ")}
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
