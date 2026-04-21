"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { detectSdfFileType } from "@/lib/clo/sdf/detect";
import type { SdfFileType } from "@/lib/clo/sdf/types";

interface SdfDetectedFile {
  file: File;
  fileType: SdfFileType | null;
  rowCount: number;
}

const SDF_TYPE_LABELS: Record<SdfFileType, string> = {
  test_results: "Test Results",
  notes: "Notes",
  collateral_file: "Collateral File",
  asset_level: "Asset Level",
  accounts: "Accounts",
  transactions: "Transactions",
  accruals: "Accruals",
};

export default function DocumentUploadBanner({ hasDocuments }: { hasDocuments?: boolean }) {
  const [ppmFiles, setPpmFiles] = useState<File[]>([]);
  const [complianceFiles, setComplianceFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const ppmInputRef = useRef<HTMLInputElement>(null);
  const complianceInputRef = useRef<HTMLInputElement>(null);

  const [sdfFiles, setSdfFiles] = useState<SdfDetectedFile[]>([]);
  const [sdfUploading, setSdfUploading] = useState(false);
  const [sdfResults, setSdfResults] = useState<any>(null);
  const [sdfError, setSdfError] = useState<string | null>(null);
  const sdfInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  const pollExtraction = useCallback(async (hasCompliancePending?: boolean) => {
    setExtracting(true);
    setStatusText("Queued — waiting for PPM extraction to start...");

    for (let i = 0; i < 480; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const res = await fetch("/api/clo/profile/extract", { cache: "no-store" });
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
        if (hasCompliancePending) {
          // PPM done but compliance still pending — don't set done yet
          setStatusText("PPM extraction complete. Starting compliance extraction...");
          return;
        }
        setStatusText("");
        setExtracting(false);
        setDone(true);
        router.refresh();
        return;
      }

      if (data.status === "error") {
        setError(data.error || "PPM extraction failed");
        setExtracting(false);
        setStatusText("");
        return;
      }

      if (data.status === "extracting") {
        const progressDetail = data.progress?.detail;
        setStatusText(progressDetail || "Extracting constraints from PPM...");
      }
      // status === "queued" → keep showing "waiting for PPM extraction to start..."
    }

    setError("PPM extraction timed out. Check back later.");
    setExtracting(false);
    setStatusText("");
  }, [router]);

  async function handleSdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const detected = await Promise.all(
      selected.map(async (file) => {
        const text = await file.text();
        const fileType = detectSdfFileType(text);
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
        const rowCount = Math.max(0, lines.length - 1);
        return { file, fileType, rowCount };
      })
    );
    setSdfFiles(detected);
    setSdfResults(null);
    setSdfError(null);
  }

  async function handleSdfUpload() {
    setSdfUploading(true);
    setSdfError(null);

    const formData = new FormData();
    for (const { file } of sdfFiles) {
      formData.append("files", file);
    }

    const res = await fetch("/api/clo/sdf/ingest", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      setSdfError(data.error || "Upload failed");
    } else {
      setSdfResults(data);
      router.refresh();
    }

    setSdfUploading(false);
  }

  async function handleUpload() {
    if (ppmFiles.length === 0 && complianceFiles.length === 0) return;
    setError("");
    setDone(false);
    setUploading(true);

    // Upload PPM files
    if (ppmFiles.length > 0) {
      const ppmFormData = new FormData();
      ppmFiles.forEach((f) => ppmFormData.append("files", f));
      ppmFormData.append("docType", "ppm");

      const ppmRes = await fetch("/api/clo/profile/upload", {
        method: "POST",
        body: ppmFormData,
      });

      if (!ppmRes.ok) {
        const data = await ppmRes.json();
        setError(data.error || "PPM upload failed.");
        setUploading(false);
        return;
      }
    }

    // Upload compliance files
    if (complianceFiles.length > 0) {
      const compFormData = new FormData();
      complianceFiles.forEach((f) => compFormData.append("files", f));
      compFormData.append("docType", "compliance");

      const compRes = await fetch("/api/clo/profile/upload", {
        method: "POST",
        body: compFormData,
      });

      if (!compRes.ok) {
        const data = await compRes.json();
        setError(data.error || "Compliance report upload failed.");
        setUploading(false);
        return;
      }
    }

    setUploading(false);
    const hadPpm = ppmFiles.length > 0;
    const hadCompliance = complianceFiles.length > 0;
    setPpmFiles([]);
    setComplianceFiles([]);

    // Queue PPM extraction
    if (hadPpm) {
      const res = await fetch("/api/clo/profile/extract", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to queue PPM extraction");
        return;
      }
    }

    // Queue compliance report extraction + portfolio extraction
    if (hadCompliance) {
      const res = await fetch("/api/clo/report/extract", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to queue compliance extraction");
        return;
      }
      fetch("/api/clo/profile/extract-portfolio", { method: "POST" }).catch(() => {});
    }

    // Poll extractions sequentially: PPM first, then compliance
    if (hadPpm) {
      await pollExtraction(hadCompliance);
    }
    if (hadCompliance) {
      await pollComplianceExtraction();
    }
  }

  async function pollComplianceExtraction() {
    setExtracting(true);
    setStatusText("Queued — waiting for compliance extraction to start...");
    for (let i = 0; i < 480; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch("/api/clo/report/extract", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "complete") {
            setExtracting(false);
            setDone(true);
            setStatusText("");
            router.refresh();
            return;
          }
          if (data.status === "error") {
            setExtracting(false);
            setError(data.error || "Report extraction failed");
            setStatusText("");
            return;
          }
          if (data.status === "extracting") {
            const progressDetail = data.progress?.detail;
            setStatusText(progressDetail || "Extracting compliance data...");
          }
          // status === "queued" → keep showing "waiting for extraction to start..."
        }
      } catch {
        // Continue polling
      }
    }
    setExtracting(false);
    setDone(true);
    setStatusText("");
    router.refresh();
  }

  const busy = uploading || extracting;
  const hasFiles = ppmFiles.length > 0 || complianceFiles.length > 0;

  // Hide when docs exist and no active extraction/upload
  if (hasDocuments && !busy && !error && !done) return null;

  // Show completion message briefly
  if (done && !busy) {
    return (
      <section className="ic-section" style={{
        background: "var(--color-accent-subtle)",
        border: "1px solid var(--color-success, #22c55e)",
        borderRadius: "var(--radius-md)",
        padding: "1rem 1.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
          Extraction complete. Refresh the page to see updated data.
          <button className="btn-secondary" onClick={() => { setDone(false); router.refresh(); }} style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
            Refresh
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ic-section" style={{
      background: "var(--color-accent-subtle)",
      border: "1px solid var(--color-accent)",
      borderRadius: "var(--radius-md)",
      padding: "1.25rem 1.5rem",
    }}>
      <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontFamily: "var(--font-display)" }}>
        Upload Documents
      </h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        Upload your PPM and compliance reports separately to unlock constraint extraction, portfolio monitoring,
        and compliance-aware analysis.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>PPM / Listing Particulars</div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={ppmInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => setPpmFiles(Array.from(e.target.files || []))}
              style={{ display: "none" }}
            />
            <button
              onClick={() => ppmInputRef.current?.click()}
              disabled={busy}
              className="btn-secondary"
              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
            >
              {ppmFiles.length > 0
                ? `${ppmFiles.length} PPM file${ppmFiles.length !== 1 ? "s" : ""}`
                : "Choose PPM"}
            </button>
          </div>
          {ppmFiles.length > 0 && !busy && (
            <div style={{ marginTop: "0.3rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              {ppmFiles.map((f) => f.name).join(", ")}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>Compliance / Trustee Report (optional)</div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={complianceInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => setComplianceFiles(Array.from(e.target.files || []))}
              style={{ display: "none" }}
            />
            <button
              onClick={() => complianceInputRef.current?.click()}
              disabled={busy}
              className="btn-secondary"
              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
            >
              {complianceFiles.length > 0
                ? `${complianceFiles.length} report${complianceFiles.length !== 1 ? "s" : ""}`
                : "Choose Reports"}
            </button>
          </div>
          {complianceFiles.length > 0 && !busy && (
            <div style={{ marginTop: "0.3rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              {complianceFiles.map((f) => f.name).join(", ")}
            </div>
          )}
        </div>
      </div>

      {hasFiles && (
        <div style={{ marginTop: "0.75rem" }}>
          <button
            onClick={handleUpload}
            disabled={busy}
            className="btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
          >
            {uploading ? "Uploading..." : "Upload & Extract"}
          </button>
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

      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "1rem", paddingTop: "1rem" }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Structured Data Files (SDF)</div>

        <input
          ref={sdfInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={handleSdfFileChange}
          style={{ display: "none" }}
        />
        <button
          onClick={() => sdfInputRef.current?.click()}
          disabled={sdfUploading}
          className="btn-secondary"
          style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
        >
          {sdfFiles.length > 0 ? `${sdfFiles.length} CSV file${sdfFiles.length !== 1 ? "s" : ""}` : "Choose CSV files..."}
        </button>

        {sdfFiles.length > 0 && (
          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {sdfFiles.map(({ file, fileType, rowCount }) => {
              const recognized = fileType !== null;
              const label = recognized ? SDF_TYPE_LABELS[fileType] : "Unrecognized";
              return (
                <div key={file.name} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ color: recognized ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)" }}>
                    {recognized ? "✓" : "✗"}
                  </span>
                  <span>{file.name}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    — {recognized ? `${label} · ${rowCount} rows` : label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {sdfResults && (
          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {sdfResults.results?.map((r: any) => (
              <div key={r.fileType} style={{ fontSize: "0.8rem", color: r.status === "success" ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)" }}>
                {r.status === "success" ? "✓" : "✗"} {SDF_TYPE_LABELS[r.fileType as SdfFileType] ?? r.fileType} — {r.rowCount} rows
                {r.error && <span> ({r.error})</span>}
              </div>
            ))}
          </div>
        )}

        {sdfFiles.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <button
              onClick={handleSdfUpload}
              disabled={sdfUploading}
              className="btn-primary"
              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
            >
              {sdfUploading ? "Uploading..." : "Upload & Ingest"}
            </button>
          </div>
        )}

        {sdfError && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-error, #ef4444)" }}>
            {sdfError}
          </div>
        )}
      </div>
    </section>
  );
}
