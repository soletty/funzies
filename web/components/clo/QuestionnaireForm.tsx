"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedConstraints } from "@/lib/clo/types";

const STEPS = [
  { id: "documents", title: "Upload Documents" },
  { id: "review", title: "Review Extracted Constraints" },
  { id: "beliefs", title: "Beliefs & Preferences" },
];

interface FormData {
  riskAppetite: string;
  beliefsAndBiases: string;
  extractedConstraints: ExtractedConstraints;
}

const INITIAL: FormData = {
  riskAppetite: "",
  beliefsAndBiases: "",
  extractedConstraints: {},
};

export default function QuestionnaireForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function canAdvance(): boolean {
    if (step === 0) return uploadedFiles.length > 0;
    return true;
  }

  async function handleUpload() {
    if (uploadedFiles.length === 0) return;
    setError("");
    setExtracting(true);

    const formData = new FormData();
    uploadedFiles.forEach((f) => formData.append("files", f));

    const uploadRes = await fetch("/api/clo/profile/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const data = await uploadRes.json();
      setError(data.error || "Failed to upload documents.");
      setExtracting(false);
      return;
    }

    const uploadData = await uploadRes.json();
    setUploadedNames(uploadData.documents.map((d: { name: string }) => d.name));

    const extractRes = await fetch("/api/clo/profile/extract", {
      method: "POST",
    });

    if (!extractRes.ok) {
      const data = await extractRes.json();
      setError(data.error || "Failed to extract constraints. You can still proceed manually.");
      setExtracting(false);
      setStep(1);
      return;
    }

    const extractData = await extractRes.json();
    setForm((prev) => ({
      ...prev,
      extractedConstraints: extractData.extractedConstraints || {},
    }));

    // Fire portfolio extraction in background — don't block onboarding
    fetch("/api/clo/profile/extract-portfolio", { method: "POST" }).then((res) => {
      if (!res.ok) console.warn("[onboarding] Background portfolio extraction failed:", res.status);
    }).catch(() => {});

    setExtracting(false);
    setStep(1);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(files);
    setUploadedNames([]);
  }

  function updateConstraint(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      extractedConstraints: {
        ...prev.extractedConstraints,
        [key]: value,
      },
    }));
  }

  function handleNext() {
    if (step === 0) {
      handleUpload();
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    const constraints = form.extractedConstraints;
    const payload = {
      fundStrategy: constraints.eligibleCollateral || "",
      targetSectors: "",
      riskAppetite: form.riskAppetite,
      portfolioSize: "",
      reinvestmentPeriod: constraints.reinvestmentPeriod
        ? `${constraints.reinvestmentPeriod.start || ""} - ${constraints.reinvestmentPeriod.end || ""}`
        : "",
      concentrationLimits: constraints.concentrationLimits
        ? Object.entries(constraints.concentrationLimits).map(([k, v]) => `${k}: ${v}`).join(", ")
        : "",
      covenantPreferences: "",
      ratingThresholds: constraints.ratingThresholds || "",
      spreadTargets: constraints.wasMinimum ? `WAS minimum: ${constraints.wasMinimum}bps` : "",
      regulatoryConstraints: "",
      portfolioDescription: constraints.waterfallSummary || "",
      beliefsAndBiases: form.beliefsAndBiases,
    };

    // Persist user-edited constraints back to the database
    if (Object.keys(constraints).length > 0) {
      const constraintRes = await fetch("/api/clo/profile/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedConstraints: constraints }),
      });
      if (!constraintRes.ok) {
        const data = await constraintRes.json();
        setError(data.error || "Failed to save constraints.");
        setSubmitting(false);
        return;
      }
    }

    const profileRes = await fetch("/api/clo/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!profileRes.ok) {
      const data = await profileRes.json();
      setError(data.error || "Failed to save profile.");
      setSubmitting(false);
      return;
    }

    const panelRes = await fetch("/api/clo/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!panelRes.ok) {
      const data = await panelRes.json();
      setError(data.error || "Failed to start panel generation.");
      setSubmitting(false);
      return;
    }

    router.push("/clo/panel/generating");
  }

  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const constraints = form.extractedConstraints;

  return (
    <div className="ic-questionnaire">
      <div className="ic-progress-bar">
        <div className="ic-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="ic-progress-label">
        Step {step + 1} of {STEPS.length} &mdash; {STEPS[step].title}
      </div>

      <div className="ic-step-content">
        {step === 0 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Upload your PPM / Listing Particulars
            </label>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Upload your CLO&apos;s PPM (required) and optionally the latest Compliance/Trustee Report.
              We&apos;ll extract all portfolio constraints, test thresholds, and structural parameters automatically.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFileChange}
              style={{ marginBottom: "1rem" }}
            />
            {uploadedFiles.length > 0 && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                {uploadedFiles.map((f) => (
                  <div key={f.name}>
                    {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                  </div>
                ))}
              </div>
            )}
            {uploadedNames.length > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--color-accent)" }}>
                Uploaded: {uploadedNames.join(", ")}
              </div>
            )}
            {extracting && (
              <div style={{ marginTop: "1rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                Uploading documents and extracting constraints... This may take a minute.
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Review Extracted Constraints
            </label>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              These constraints were extracted from your documents. Edit any values the AI got wrong.
            </p>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Eligible Collateral</label>
                <textarea
                  className="ic-textarea"
                  rows={2}
                  value={(constraints.eligibleCollateral as string) || ""}
                  onChange={(e) => updateConstraint("eligibleCollateral", e.target.value)}
                />
              </div>

              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Concentration Limits</label>
                <textarea
                  className="ic-textarea"
                  rows={3}
                  value={
                    constraints.concentrationLimits
                      ? Object.entries(constraints.concentrationLimits).map(([k, v]) => `${k}: ${v}`).join("\n")
                      : ""
                  }
                  onChange={(e) => {
                    const limits: Record<string, string> = {};
                    e.target.value.split("\n").forEach((line) => {
                      const [key, ...vals] = line.split(":");
                      if (key && vals.length) limits[key.trim()] = vals.join(":").trim();
                    });
                    setForm((prev) => ({
                      ...prev,
                      extractedConstraints: { ...prev.extractedConstraints, concentrationLimits: limits },
                    }));
                  }}
                  placeholder="singleName: 2%&#10;industry: 12%&#10;ccc: 7.5%"
                />
              </div>

              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Coverage Tests</label>
                <textarea
                  className="ic-textarea"
                  rows={3}
                  value={
                    constraints.coverageTests
                      ? Object.entries(constraints.coverageTests).map(([k, v]) => `${k}: ${v}`).join("\n")
                      : ""
                  }
                  onChange={(e) => {
                    const tests: Record<string, string> = {};
                    e.target.value.split("\n").forEach((line) => {
                      const [key, ...vals] = line.split(":");
                      if (key && vals.length) tests[key.trim()] = vals.join(":").trim();
                    });
                    setForm((prev) => ({
                      ...prev,
                      extractedConstraints: { ...prev.extractedConstraints, coverageTests: tests },
                    }));
                  }}
                  placeholder="ocSenior: 120%&#10;icSenior: 110%"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className="ic-field">
                  <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WARF Limit</label>
                  <input
                    className="ic-textarea"
                    style={{ padding: "0.5rem" }}
                    value={constraints.warfLimit ?? ""}
                    onChange={(e) => updateConstraint("warfLimit", e.target.value)}
                    placeholder="e.g., 2800"
                  />
                </div>
                <div className="ic-field">
                  <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WAS Minimum (bps)</label>
                  <input
                    className="ic-textarea"
                    style={{ padding: "0.5rem" }}
                    value={constraints.wasMinimum ?? ""}
                    onChange={(e) => updateConstraint("wasMinimum", e.target.value)}
                    placeholder="e.g., 350"
                  />
                </div>
                <div className="ic-field">
                  <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WAL Maximum (years)</label>
                  <input
                    className="ic-textarea"
                    style={{ padding: "0.5rem" }}
                    value={constraints.walMaximum ?? ""}
                    onChange={(e) => updateConstraint("walMaximum", e.target.value)}
                    placeholder="e.g., 5.0"
                  />
                </div>
                <div className="ic-field">
                  <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Diversity Score Min</label>
                  <input
                    className="ic-textarea"
                    style={{ padding: "0.5rem" }}
                    value={constraints.diversityScoreMinimum ?? ""}
                    onChange={(e) => updateConstraint("diversityScoreMinimum", e.target.value)}
                    placeholder="e.g., 60"
                  />
                </div>
              </div>

              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Rating Thresholds</label>
                <textarea
                  className="ic-textarea"
                  rows={2}
                  value={(constraints.ratingThresholds as string) || ""}
                  onChange={(e) => updateConstraint("ratingThresholds", e.target.value)}
                />
              </div>

              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Waterfall Summary</label>
                <textarea
                  className="ic-textarea"
                  rows={2}
                  value={(constraints.waterfallSummary as string) || ""}
                  onChange={(e) => updateConstraint("waterfallSummary", e.target.value)}
                />
              </div>

              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Reinvestment Period</label>
                <input
                  className="ic-textarea"
                  style={{ padding: "0.5rem" }}
                  value={
                    constraints.reinvestmentPeriod
                      ? `${constraints.reinvestmentPeriod.start || ""} - ${constraints.reinvestmentPeriod.end || ""}`
                      : ""
                  }
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      extractedConstraints: {
                        ...prev.extractedConstraints,
                        reinvestmentPeriod: { start: e.target.value.split(" - ")[0], end: e.target.value.split(" - ")[1] },
                      },
                    }))
                  }
                  placeholder="Start date - End date"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="ic-field">
              <label className="ic-field-label">Risk appetite</label>
              <div className="ic-radio-group">
                {(["conservative", "moderate", "aggressive"] as const).map(
                  (opt) => (
                    <label key={opt} className="ic-radio">
                      <input
                        type="radio"
                        name="riskAppetite"
                        value={opt}
                        checked={form.riskAppetite === opt}
                        onChange={() =>
                          setForm((prev) => ({ ...prev, riskAppetite: opt }))
                        }
                      />
                      <span className="ic-radio-label">
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </span>
                    </label>
                  )
                )}
              </div>
            </div>
            <div className="ic-field">
              <label className="ic-field-label">
                What should your analyst know about your views?
              </label>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Personal beliefs, biases, sector preferences or aversions beyond what the PPM mandates.
                Contrarian views, areas where you want to be challenged.
              </p>
              <textarea
                className="ic-textarea"
                rows={5}
                value={form.beliefsAndBiases}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, beliefsAndBiases: e.target.value }))
                }
                placeholder="Strong convictions on sectors or structures, known biases, contrarian views..."
              />
            </div>
          </>
        )}
      </div>

      {error && <p className="ic-error">{error}</p>}

      <div className="ic-step-actions">
        {step > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleBack}
            disabled={submitting || extracting}
          >
            Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        {isLast ? (
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Build My Panel"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={handleNext}
            disabled={!canAdvance() || submitting || extracting}
          >
            {step === 0 && extracting ? "Extracting..." : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
