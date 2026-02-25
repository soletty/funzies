"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentWidget, { type AttachedFile } from "@/components/AttachmentWidget";

const OPPORTUNITY_TYPES = [
  "Equity",
  "Fixed Income",
  "Private Equity",
  "Venture Capital",
  "Real Estate",
  "Crypto/Digital Assets",
  "Other",
];

export default function EvaluationForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [opportunityType, setOpportunityType] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [thesis, setThesis] = useState("");
  const [terms, setTerms] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasContent = thesis.trim() || files.length > 0;
    if (!title.trim() || !hasContent) return;

    setError("");
    setSubmitting(true);

    const res = await fetch("/api/ic/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        opportunityType,
        companyName: companyName.trim(),
        thesis: thesis.trim(),
        terms: terms.trim(),
        details: details.trim() ? { additional: details.trim() } : {},
        hasFiles: files.length > 0,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create evaluation");
      setSubmitting(false);
      return;
    }

    const { id } = await res.json();

    // Upload attached files, then flip status to 'queued'
    for (const attached of files) {
      const formData = new FormData();
      formData.append("file", attached.file);
      const uploadRes = await fetch(`/api/ic/evaluations/${id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        await fetch(`/api/ic/evaluations/${id}/upload?action=abort`, { method: "DELETE" });
        setError(data.error || `Failed to upload ${attached.file.name}`);
        setSubmitting(false);
        return;
      }
    }

    // All uploads succeeded — signal the worker to start
    if (files.length > 0) {
      await fetch(`/api/ic/evaluations/${id}/upload?action=ready`, { method: "PATCH" });
    }

    router.push(`/ic/evaluate/${id}/generating`);
  }

  return (
    <form onSubmit={handleSubmit} className="ic-eval-form">
      <div className="ic-field">
        <label className="ic-field-label">Title *</label>
        <input
          type="text"
          className="ic-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Series B Investment in Acme Corp"
          required
        />
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Opportunity Type</label>
        <select
          className="ic-select"
          value={opportunityType}
          onChange={(e) => setOpportunityType(e.target.value)}
        >
          <option value="">Select type...</option>
          {OPPORTUNITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Company / Fund Name</label>
        <input
          type="text"
          className="ic-input"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g., Acme Corp"
        />
      </div>

      <div className="ic-field">
        <label className="ic-field-label">
          Investment Thesis {files.length === 0 ? "*" : ""}
        </label>
        <textarea
          className="ic-textarea"
          rows={5}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Describe why this investment is compelling, the key value drivers, and your conviction level..."
          required={files.length === 0}
        />
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Documents</label>
        <p className="ic-field-hint">Upload term sheets, pitch decks, or other documents (PDF, images)</p>
        <AttachmentWidget files={files} onChange={setFiles} disabled={submitting} />
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Terms</label>
        <textarea
          className="ic-textarea"
          rows={3}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Valuation, structure, key terms..."
        />
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Additional Details</label>
        <textarea
          className="ic-textarea"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Any other context, market data, comparables..."
        />
      </div>

      {error && <p className="ic-error">{error}</p>}

      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || !title.trim() || (!thesis.trim() && files.length === 0)}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {submitting ? "Creating Evaluation..." : "Submit for Evaluation"}
      </button>
    </form>
  );
}
