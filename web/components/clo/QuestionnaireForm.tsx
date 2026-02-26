"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ExtractedConstraints,
  CapitalStructureEntry,
  CoverageTestEntry,
  FeeEntry,
  KeyParty,
  CollateralQualityTest,
} from "@/lib/clo/types";

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

// --- Collapsible Section ---
function CollapsibleSection({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", marginBottom: "0.5rem" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 0.8rem",
          background: "var(--color-surface)",
          border: "none",
          cursor: "pointer",
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "var(--color-text)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.7rem" }}>{open ? "\u25BC" : "\u25B6"}</span>
        {title}
        {badge && (
          <span style={{
            marginLeft: "auto",
            fontSize: "0.7rem",
            padding: "0.15rem 0.5rem",
            background: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
            borderRadius: "var(--radius-sm)",
            fontWeight: 500,
          }}>
            {badge}
          </span>
        )}
      </button>
      {open && <div style={{ padding: "0.6rem 0.8rem", borderTop: "1px solid var(--color-border)" }}>{children}</div>}
    </div>
  );
}

// --- Helper: count populated fields in an object ---
function countFields(obj: Record<string, unknown> | undefined | null): string {
  if (!obj) return "0 fields";
  const total = Object.keys(obj).length;
  const filled = Object.values(obj).filter((v) => v != null && v !== "").length;
  return `${filled}/${total} fields`;
}

// --- Helper: KeyValue grid for flat objects ---
function KeyValueGrid({ data, label }: { data: object; label: string }) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="ic-field">
      <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>{label}</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem", fontSize: "0.8rem" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: "0.3rem" }}>
            <span style={{ color: "var(--color-text-muted)", minWidth: "40%" }}>{k}:</span>
            <span>{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Helper: TypeDescription array renderer ---
function TypeDescriptionList({ items, label }: { items: { type?: string; event?: string; feature?: string; investorType?: string; description?: string; requirements?: string }[]; label: string }) {
  if (!items?.length) return null;
  return (
    <div className="ic-field">
      <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>{label} ({items.length} items)</label>
      <div style={{ fontSize: "0.8rem" }}>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: "0.4rem", paddingBottom: "0.4rem", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontWeight: 600 }}>{item.type || item.event || item.feature || item.investorType}: </span>
            <span>{item.description || item.requirements}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuestionnaireForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [ppmFiles, setPpmFiles] = useState<File[]>([]);
  const [complianceFiles, setComplianceFiles] = useState<File[]>([]);
  const [uploadedPpmNames, setUploadedPpmNames] = useState<string[]>([]);
  const [uploadedComplianceNames, setUploadedComplianceNames] = useState<string[]>([]);
  const ppmInputRef = useRef<HTMLInputElement>(null);
  const complianceInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function canAdvance(): boolean {
    if (step === 0) return ppmFiles.length > 0;
    return true;
  }

  async function handleUpload() {
    if (ppmFiles.length === 0) return;
    setError("");
    setExtracting(true);

    // Upload PPM files
    const ppmFormData = new FormData();
    ppmFiles.forEach((f) => ppmFormData.append("files", f));
    ppmFormData.append("docType", "ppm");

    const ppmUploadRes = await fetch("/api/clo/profile/upload", {
      method: "POST",
      body: ppmFormData,
    });

    if (!ppmUploadRes.ok) {
      const data = await ppmUploadRes.json();
      setError(data.error || "Failed to upload PPM documents.");
      setExtracting(false);
      return;
    }

    const ppmUploadData = await ppmUploadRes.json();
    setUploadedPpmNames(ppmUploadData.documents.map((d: { name: string }) => d.name));

    // Upload compliance files if provided
    if (complianceFiles.length > 0) {
      const compFormData = new FormData();
      complianceFiles.forEach((f) => compFormData.append("files", f));
      compFormData.append("docType", "compliance");

      const compUploadRes = await fetch("/api/clo/profile/upload", {
        method: "POST",
        body: compFormData,
      });

      if (!compUploadRes.ok) {
        const data = await compUploadRes.json();
        setError(data.error || "Failed to upload compliance documents.");
        setExtracting(false);
        return;
      }

      const compUploadData = await compUploadRes.json();
      setUploadedComplianceNames(compUploadData.documents.map((d: { name: string }) => d.name));
    }

    // Queue PPM extraction
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

    // Fire portfolio extraction only if compliance files were uploaded
    if (complianceFiles.length > 0) {
      fetch("/api/clo/profile/extract-portfolio", { method: "POST" }).then((res) => {
        if (!res.ok) console.warn("[onboarding] Background portfolio extraction failed:", res.status);
      }).catch(() => {});
    }

    // Poll until extraction completes (up to 10 minutes)
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch("/api/clo/profile/extract");
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();

      if (pollData.status === "complete") {
        setForm((prev) => ({
          ...prev,
          extractedConstraints: pollData.extractedConstraints || {},
        }));
        setExtracting(false);
        setStep(1);
        return;
      }

      if (pollData.status === "error") {
        setError(pollData.error || "Extraction failed. You can still proceed manually.");
        setExtracting(false);
        setStep(1);
        return;
      }
    }

    // Timed out
    setError("Extraction is taking longer than expected. You can proceed and it will complete in the background.");
    setExtracting(false);
    setStep(1);
  }

  function handlePpmFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPpmFiles(Array.from(e.target.files || []));
    setUploadedPpmNames([]);
  }

  function handleComplianceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setComplianceFiles(Array.from(e.target.files || []));
    setUploadedComplianceNames([]);
  }

  function updateConstraint(key: string, value: unknown) {
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
    const targetPar = constraints.dealSizing?.targetParAmount ?? constraints.targetParAmount;
    const rpEnd = constraints.keyDates?.reinvestmentPeriodEnd ?? constraints.reinvestmentPeriod?.end;
    const rpStart = constraints.reinvestmentPeriod?.start;

    const payload = {
      fundStrategy: constraints.eligibleCollateral || "",
      targetSectors: "",
      riskAppetite: form.riskAppetite,
      portfolioSize: "",
      reinvestmentPeriod: rpEnd ? `${rpStart || ""} - ${rpEnd}` : "",
      concentrationLimits: constraints.concentrationLimits
        ? Object.entries(constraints.concentrationLimits).map(([k, v]) => `${k}: ${v}`).join(", ")
        : "",
      covenantPreferences: "",
      ratingThresholds: constraints.ratingThresholds || "",
      spreadTargets: constraints.wasMinimum ? `WAS minimum: ${constraints.wasMinimum}bps` : "",
      regulatoryConstraints: "",
      portfolioDescription: constraints.waterfallSummary || constraints.waterfall?.interestPriority || "",
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

  const c = form.extractedConstraints;

  // --- Render helpers for step 1 ---

  function renderDealOverview() {
    const hasDealIdentity = c.dealIdentity && Object.values(c.dealIdentity).some((v) => v);
    const hasKeyDates = c.keyDates && Object.values(c.keyDates).some((v) => v);
    const hasCapStruct = c.capitalStructure && c.capitalStructure.length > 0;
    const hasDealSizing = c.dealSizing && Object.values(c.dealSizing).some((v) => v);
    const hasLegacyDeal = c.targetParAmount || c.collateralManager || c.issuer || c.maturityDate;
    const hasLegacyDates = c.reinvestmentPeriod || c.nonCallPeriod || c.paymentDates;

    const itemCount = [hasDealIdentity, hasKeyDates, hasCapStruct, hasDealSizing || hasLegacyDeal, hasLegacyDates].filter(Boolean).length;
    if (itemCount === 0) return null;

    return (
      <CollapsibleSection title="Deal Overview" badge={`${itemCount} sections`} defaultOpen>
        {hasDealIdentity && <KeyValueGrid data={c.dealIdentity!} label="Deal Identity" />}

        {hasKeyDates && <KeyValueGrid data={c.keyDates!} label="Key Dates" />}

        {!hasKeyDates && hasLegacyDates && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {c.reinvestmentPeriod && (
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.8rem" }}>Reinvestment Period</label>
                <input className="ic-textarea" style={{ padding: "0.4rem", fontSize: "0.85rem" }}
                  value={`${c.reinvestmentPeriod.start || ""} - ${c.reinvestmentPeriod.end || ""}`} readOnly />
              </div>
            )}
            {c.nonCallPeriod?.end && (
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.8rem" }}>Non-Call Period End</label>
                <input className="ic-textarea" style={{ padding: "0.4rem", fontSize: "0.85rem" }}
                  value={c.nonCallPeriod.end} readOnly />
              </div>
            )}
          </div>
        )}

        {hasCapStruct && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Capital Structure ({(c.capitalStructure as CapitalStructureEntry[]).length} tranches)</label>
            <div style={{ fontSize: "0.8rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Class</th>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Amount</th>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Spread</th>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Rating</th>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Deferrable</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.capitalStructure as CapitalStructureEntry[]).map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.3rem" }}>{t.class}</td>
                      <td style={{ padding: "0.3rem" }}>{t.principalAmount}</td>
                      <td style={{ padding: "0.3rem" }}>{t.spread}</td>
                      <td style={{ padding: "0.3rem" }}>{t.rating?.fitch || ""}/{t.rating?.sp || ""}</td>
                      <td style={{ padding: "0.3rem" }}>{t.deferrable ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(hasDealSizing || hasLegacyDeal) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
            {(c.dealSizing?.targetParAmount || c.targetParAmount) && (
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.8rem" }}>Target Par</label>
                <input className="ic-textarea" style={{ padding: "0.4rem", fontSize: "0.85rem" }}
                  value={(c.dealSizing?.targetParAmount ?? c.targetParAmount) || ""}
                  onChange={(e) => updateConstraint("targetParAmount", e.target.value)} />
              </div>
            )}
            {(c.cmDetails?.name || c.collateralManager) && (
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.8rem" }}>Collateral Manager</label>
                <input className="ic-textarea" style={{ padding: "0.4rem", fontSize: "0.85rem" }}
                  value={(c.cmDetails?.name ?? c.collateralManager) || ""} readOnly />
              </div>
            )}
            {(c.keyDates?.maturityDate || c.maturityDate) && (
              <div className="ic-field">
                <label className="ic-field-label" style={{ fontSize: "0.8rem" }}>Maturity Date</label>
                <input className="ic-textarea" style={{ padding: "0.4rem", fontSize: "0.85rem" }}
                  value={(c.keyDates?.maturityDate ?? c.maturityDate) || ""} readOnly />
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>
    );
  }

  function renderTestsAndConstraints() {
    const hasCoverage = (c.coverageTestEntries?.length ?? 0) > 0 || (c.coverageTests && Object.keys(c.coverageTests).length > 0);
    const hasQuality = Array.isArray(c.collateralQualityTests) ? c.collateralQualityTests.length > 0 : (c.collateralQualityTests && Object.keys(c.collateralQualityTests).length > 0);
    const hasProfile = c.portfolioProfileTests && Object.keys(c.portfolioProfileTests).length > 0;
    const hasConc = c.concentrationLimits && Object.keys(c.concentrationLimits).length > 0;
    const hasEligibility = (c.eligibilityCriteria?.length ?? 0) > 0 || c.eligibleCollateral;
    const hasReinvestment = c.reinvestmentCriteria;
    const hasMetrics = c.warfLimit != null || c.wasMinimum != null || c.walMaximum != null || c.diversityScoreMinimum != null;

    const sectionCount = [hasCoverage, hasQuality, hasProfile || hasConc, hasEligibility, hasReinvestment, hasMetrics].filter(Boolean).length;
    if (sectionCount === 0) return null;

    return (
      <CollapsibleSection title="Tests & Constraints" badge={`${sectionCount} sections`} defaultOpen>
        {/* Coverage Tests */}
        {c.coverageTestEntries && c.coverageTestEntries.length > 0 ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Coverage Tests ({c.coverageTestEntries.length} classes)</label>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Class</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>OC Ratio</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>IC Ratio</th>
                </tr>
              </thead>
              <tbody>
                {(c.coverageTestEntries as CoverageTestEntry[]).map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.3rem" }}>{t.class}</td>
                    <td style={{ padding: "0.3rem" }}>{t.parValueRatio || "—"}</td>
                    <td style={{ padding: "0.3rem" }}>{t.interestCoverageRatio || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasCoverage ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Coverage Tests</label>
            <textarea className="ic-textarea" rows={4}
              value={c.coverageTests ? Object.entries(c.coverageTests).map(([k, v]) => `${k}: ${v}`).join("\n") : ""}
              onChange={(e) => {
                const tests: Record<string, string> = {};
                e.target.value.split("\n").forEach((line) => {
                  const [key, ...vals] = line.split(":");
                  if (key && vals.length) tests[key.trim()] = vals.join(":").trim();
                });
                updateConstraint("coverageTests", tests);
              }}
              placeholder="parValueClassAB: 130.13%&#10;interestCoverageClassAB: 120%" />
          </div>
        ) : null}

        {/* Collateral Quality Tests */}
        {Array.isArray(c.collateralQualityTests) && c.collateralQualityTests.length > 0 ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Collateral Quality Tests ({(c.collateralQualityTests as CollateralQualityTest[]).length} tests)</label>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Test</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Agency</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Value</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Applies</th>
                </tr>
              </thead>
              <tbody>
                {(c.collateralQualityTests as CollateralQualityTest[]).map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.3rem" }}>{t.name}</td>
                    <td style={{ padding: "0.3rem" }}>{t.agency || "—"}</td>
                    <td style={{ padding: "0.3rem" }}>{t.value != null ? String(t.value) : "—"}</td>
                    <td style={{ padding: "0.3rem" }}>{t.appliesDuring || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasQuality && !Array.isArray(c.collateralQualityTests) ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Collateral Quality Tests</label>
            <textarea className="ic-textarea" rows={3}
              value={Object.entries(c.collateralQualityTests as unknown as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join("\n")}
              readOnly />
          </div>
        ) : null}

        {/* Portfolio Profile Tests */}
        {hasProfile ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>
              Portfolio Profile Tests ({Object.keys(c.portfolioProfileTests!).length} tests)
            </label>
            <textarea
              className="ic-textarea" rows={8}
              value={Object.entries(c.portfolioProfileTests!)
                .map(([k, v]) => `${k}: min ${v.min || "N/A"}, max ${v.max || "N/A"}`)
                .join("\n")}
              onChange={(e) => {
                const tests: Record<string, { min?: string | null; max?: string | null }> = {};
                e.target.value.split("\n").forEach((line) => {
                  const match = line.match(/^(.+?):\s*min\s+(.+?),\s*max\s+(.+)$/);
                  if (match) {
                    tests[match[1].trim()] = {
                      min: match[2].trim() === "N/A" ? null : match[2].trim(),
                      max: match[3].trim() === "N/A" ? null : match[3].trim(),
                    };
                  }
                });
                updateConstraint("portfolioProfileTests", tests);
              }} />
          </div>
        ) : hasConc ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Concentration Limits</label>
            <textarea className="ic-textarea" rows={3}
              value={Object.entries(c.concentrationLimits!).map(([k, v]) => `${k}: ${v}`).join("\n")}
              onChange={(e) => {
                const limits: Record<string, string> = {};
                e.target.value.split("\n").forEach((line) => {
                  const [key, ...vals] = line.split(":");
                  if (key && vals.length) limits[key.trim()] = vals.join(":").trim();
                });
                updateConstraint("concentrationLimits", limits);
              }} />
          </div>
        ) : null}

        {/* Eligibility Criteria */}
        {c.eligibilityCriteria && c.eligibilityCriteria.length > 0 ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>
              Eligibility Criteria ({c.eligibilityCriteria.length} items)
            </label>
            <textarea className="ic-textarea" rows={6}
              value={c.eligibilityCriteria.join("\n")}
              onChange={(e) => {
                const items = e.target.value.split("\n").filter((l) => l.trim());
                updateConstraint("eligibilityCriteria", items);
              }} />
          </div>
        ) : c.eligibleCollateral ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Eligible Collateral</label>
            <textarea className="ic-textarea" rows={2}
              value={c.eligibleCollateral || ""}
              onChange={(e) => updateConstraint("eligibleCollateral", e.target.value)} />
          </div>
        ) : null}

        {/* Reinvestment Criteria */}
        {hasReinvestment && (
          <KeyValueGrid data={c.reinvestmentCriteria!} label="Reinvestment Criteria" />
        )}

        {/* Key Metrics */}
        {hasMetrics && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="ic-field">
              <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WARF Limit</label>
              <input className="ic-textarea" style={{ padding: "0.5rem" }}
                value={c.warfLimit ?? ""}
                onChange={(e) => updateConstraint("warfLimit", e.target.value)}
                placeholder="e.g., 2800" />
            </div>
            <div className="ic-field">
              <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WAS Minimum (bps)</label>
              <input className="ic-textarea" style={{ padding: "0.5rem" }}
                value={c.wasMinimum ?? ""}
                onChange={(e) => updateConstraint("wasMinimum", e.target.value)}
                placeholder="e.g., 350" />
            </div>
            <div className="ic-field">
              <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>WAL Maximum (years)</label>
              <input className="ic-textarea" style={{ padding: "0.5rem" }}
                value={c.walMaximum ?? ""}
                onChange={(e) => updateConstraint("walMaximum", e.target.value)}
                placeholder="e.g., 5.0" />
            </div>
            <div className="ic-field">
              <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Diversity Score Min</label>
              <input className="ic-textarea" style={{ padding: "0.5rem" }}
                value={c.diversityScoreMinimum ?? ""}
                onChange={(e) => updateConstraint("diversityScoreMinimum", e.target.value)}
                placeholder="e.g., 60" />
            </div>
          </div>
        )}
      </CollapsibleSection>
    );
  }

  function renderStructureAndMechanics() {
    const hasWaterfall = c.waterfall || c.waterfallSummary;
    const hasFees = (c.fees?.length ?? 0) > 0 || (c.collateralManagerFees && Object.keys(c.collateralManagerFees).length > 0);
    const hasAccounts = (c.accounts?.length ?? 0) > 0;
    const hasHedging = c.hedging && Object.values(c.hedging).some((v) => v != null);
    const hasRedemption = (c.redemptionProvisions?.length ?? 0) > 0;
    const hasDefaults = (c.eventsOfDefault?.length ?? 0) > 0;
    const hasVoting = c.votingAndControl && Object.values(c.votingAndControl).some((v) => v);
    const hasInterest = c.interestMechanics && Object.values(c.interestMechanics).some((v) => v != null);
    const hasLoss = c.lossMitigationLimits && Object.keys(c.lossMitigationLimits).length > 0;

    const sectionCount = [hasWaterfall, hasFees, hasAccounts, hasHedging, hasRedemption, hasDefaults, hasVoting, hasInterest, hasLoss].filter(Boolean).length;
    if (sectionCount === 0) return null;

    return (
      <CollapsibleSection title="Structure & Mechanics" badge={`${sectionCount} sections`}>
        {/* Waterfall */}
        {c.waterfall ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Waterfall</label>
            {c.waterfall.interestPriority && (
              <div style={{ marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Interest Priority</div>
                <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>{c.waterfall.interestPriority}</div>
              </div>
            )}
            {c.waterfall.principalPriority && (
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Principal Priority</div>
                <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>{c.waterfall.principalPriority}</div>
              </div>
            )}
          </div>
        ) : c.waterfallSummary ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Waterfall Summary</label>
            <textarea className="ic-textarea" rows={2}
              value={c.waterfallSummary}
              onChange={(e) => updateConstraint("waterfallSummary", e.target.value)} />
          </div>
        ) : null}

        {/* Fees */}
        {c.fees && c.fees.length > 0 ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Fees ({c.fees.length} items)</label>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Rate</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {(c.fees as FeeEntry[]).map((f, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.3rem" }}>{f.name}</td>
                    <td style={{ padding: "0.3rem" }}>{f.rate || "—"}</td>
                    <td style={{ padding: "0.3rem" }}>{f.basis || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : c.collateralManagerFees && Object.keys(c.collateralManagerFees).length > 0 ? (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Collateral Manager Fees</label>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
              {Object.entries(c.collateralManagerFees).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
            </div>
          </div>
        ) : null}

        {hasAccounts && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Accounts ({c.accounts!.length})</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.accounts!.map((a, i) => <div key={i}><strong>{a.name}:</strong> {a.purpose}</div>)}
            </div>
          </div>
        )}

        {hasHedging && <KeyValueGrid data={c.hedging!} label="Hedging Provisions" />}

        {hasRedemption && <TypeDescriptionList items={c.redemptionProvisions!} label="Redemption Provisions" />}

        {hasDefaults && <TypeDescriptionList items={c.eventsOfDefault!} label="Events of Default" />}

        {hasVoting && <KeyValueGrid data={c.votingAndControl!} label="Voting & Control" />}

        {hasInterest && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Interest Mechanics</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.interestMechanics!.dayCount && <div>Day Count: {c.interestMechanics!.dayCount}</div>}
              {c.interestMechanics!.referenceRate && <div>Reference Rate: {c.interestMechanics!.referenceRate}</div>}
              {c.interestMechanics!.deferralClasses?.length && <div>Deferral Classes: {c.interestMechanics!.deferralClasses.join(", ")}</div>}
              {c.interestMechanics!.deferredInterestCompounds != null && <div>Deferred Interest Compounds: {c.interestMechanics!.deferredInterestCompounds ? "Yes" : "No"}</div>}
            </div>
          </div>
        )}

        {hasLoss && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Loss Mitigation Limits</label>
            <div style={{ fontSize: "0.8rem" }}>
              {Object.entries(c.lossMitigationLimits!).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
            </div>
          </div>
        )}
      </CollapsibleSection>
    );
  }

  function renderPartiesAndManagement() {
    const hasParties = (c.keyParties?.length ?? 0) > 0;
    const hasCmDetails = c.cmDetails && Object.values(c.cmDetails).some((v) => v);
    const hasCmTrading = c.cmTradingConstraints && Object.values(c.cmTradingConstraints).some((v) => v != null);

    const sectionCount = [hasParties, hasCmDetails, hasCmTrading].filter(Boolean).length;
    if (sectionCount === 0) return null;

    return (
      <CollapsibleSection title="Parties & Management" badge={`${sectionCount} sections`}>
        {hasParties && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Key Parties ({c.keyParties!.length})</label>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "0.3rem" }}>Entity</th>
                </tr>
              </thead>
              <tbody>
                {(c.keyParties as KeyParty[]).map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.3rem" }}>{p.role}</td>
                    <td style={{ padding: "0.3rem" }}>{p.entity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasCmDetails && <KeyValueGrid data={c.cmDetails!} label="CM Details" />}

        {hasCmTrading && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>CM Trading Constraints</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.cmTradingConstraints!.discretionarySales && <div>Discretionary Sales: {c.cmTradingConstraints!.discretionarySales}</div>}
              {c.cmTradingConstraints!.requiredSaleTypes?.length && <div>Required Sale Types: {c.cmTradingConstraints!.requiredSaleTypes.join(", ")}</div>}
              {c.cmTradingConstraints!.postReinvestmentTrading && <div>Post-RP Trading: {c.cmTradingConstraints!.postReinvestmentTrading}</div>}
            </div>
          </div>
        )}
      </CollapsibleSection>
    );
  }

  function renderRegulatoryAndLegal() {
    const hasRiskRetention = c.riskRetention && (c.riskRetention.euUk || c.riskRetention.us);
    const hasTax = c.tax && Object.values(c.tax).some((v) => v);
    const hasTransfers = (c.transferRestrictions?.length ?? 0) > 0;
    const hasReports = (c.reports?.length ?? 0) > 0;
    const hasRatingParams = c.ratingAgencyParameters && Object.values(c.ratingAgencyParameters).some((v) => v);
    const hasLegalProtections = (c.legalProtections?.length ?? 0) > 0;
    const hasEsg = (c.esgExclusions?.length ?? 0) > 0;
    const hasRatingThresholds = !!c.ratingThresholds;

    const sectionCount = [hasRiskRetention, hasTax, hasTransfers, hasReports, hasRatingParams, hasLegalProtections, hasEsg, hasRatingThresholds].filter(Boolean).length;
    if (sectionCount === 0) return null;

    return (
      <CollapsibleSection title="Regulatory & Legal" badge={`${sectionCount} sections`}>
        {hasEsg && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>
              ESG Exclusions ({c.esgExclusions!.length} items)
            </label>
            <textarea className="ic-textarea" rows={5}
              value={c.esgExclusions!.join("\n")}
              onChange={(e) => {
                const items = e.target.value.split("\n").filter((l) => l.trim());
                updateConstraint("esgExclusions", items);
              }} />
          </div>
        )}

        {hasRiskRetention && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Risk Retention</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.riskRetention!.euUk && <div>EU/UK: {Object.entries(c.riskRetention!.euUk).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(", ")}</div>}
              {c.riskRetention!.us && <div>US: {Object.entries(c.riskRetention!.us).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(", ")}</div>}
            </div>
          </div>
        )}

        {hasTax && <KeyValueGrid data={c.tax!} label="Tax" />}

        {hasTransfers && <TypeDescriptionList items={c.transferRestrictions!} label="Transfer Restrictions" />}

        {hasReports && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Reports ({c.reports!.length})</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.reports!.map((r, i) => (
                <div key={i}>{r.type}{r.frequency ? ` (${r.frequency})` : ""}{r.preparedBy ? ` — ${r.preparedBy}` : ""}</div>
              ))}
            </div>
          </div>
        )}

        {hasRatingParams && <KeyValueGrid data={c.ratingAgencyParameters!} label="Rating Agency Parameters" />}

        {hasLegalProtections && <TypeDescriptionList items={c.legalProtections!} label="Legal Protections" />}

        {hasRatingThresholds && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Rating Thresholds</label>
            <textarea className="ic-textarea" rows={2}
              value={c.ratingThresholds || ""}
              onChange={(e) => updateConstraint("ratingThresholds", e.target.value)} />
          </div>
        )}
      </CollapsibleSection>
    );
  }

  function renderHistoryAndOther() {
    const hasRefinancing = (c.refinancingHistory?.length ?? 0) > 0;
    const hasAdditionalIssuance = c.additionalIssuance;
    const hasRiskFactors = c.riskFactors && Object.keys(c.riskFactors).length > 0;
    const hasConflicts = (c.conflictsOfInterest?.length ?? 0) > 0;
    const hasOther = (c.otherConstraints?.length ?? 0) > 0;
    const hasAdditional = !!c.additionalProvisions;

    const sectionCount = [hasRefinancing, hasAdditionalIssuance, hasRiskFactors, hasConflicts, hasOther, hasAdditional].filter(Boolean).length;
    if (sectionCount === 0) return null;

    return (
      <CollapsibleSection title="History & Other" badge={`${sectionCount} sections`}>
        {hasRefinancing && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Refinancing History ({c.refinancingHistory!.length})</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.refinancingHistory!.map((r, i) => <div key={i}><strong>{r.date}:</strong> {r.details}</div>)}
            </div>
          </div>
        )}

        {hasAdditionalIssuance && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Additional Issuance</label>
            <div style={{ fontSize: "0.8rem" }}>
              {c.additionalIssuance!.permitted != null && <div>Permitted: {c.additionalIssuance!.permitted ? "Yes" : "No"}</div>}
              {c.additionalIssuance!.conditions && <div>Conditions: {c.additionalIssuance!.conditions}</div>}
            </div>
          </div>
        )}

        {hasRiskFactors && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Risk Factors ({Object.keys(c.riskFactors!).length} categories)</label>
            <div style={{ fontSize: "0.8rem" }}>
              {Object.entries(c.riskFactors!).map(([k, v]) => <div key={k} style={{ marginBottom: "0.3rem" }}><strong>{k}:</strong> {v}</div>)}
            </div>
          </div>
        )}

        {hasConflicts && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>
              Conflicts of Interest ({c.conflictsOfInterest!.length} items)
            </label>
            <textarea className="ic-textarea" rows={4}
              value={c.conflictsOfInterest!.join("\n")}
              onChange={(e) => {
                const items = e.target.value.split("\n").filter((l) => l.trim());
                updateConstraint("conflictsOfInterest", items);
              }} />
          </div>
        )}

        {hasOther && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Other Constraints</label>
            <textarea className="ic-textarea" rows={4}
              value={c.otherConstraints!.join("\n")}
              onChange={(e) => {
                const items = e.target.value.split("\n").filter((l) => l.trim());
                updateConstraint("otherConstraints", items);
              }}
              placeholder="One constraint per line" />
          </div>
        )}

        {hasAdditional && (
          <div className="ic-field">
            <label className="ic-field-label" style={{ fontSize: "0.85rem" }}>Additional Provisions</label>
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "0 0 0.5rem" }}>
              Everything else from the PPM — workout treatment, trading restrictions, interest deferral,
              manager provisions, redemption mechanics, defined terms, etc.
            </p>
            <textarea className="ic-textarea" rows={8}
              value={c.additionalProvisions || ""}
              onChange={(e) => updateConstraint("additionalProvisions", e.target.value)} />
          </div>
        )}
      </CollapsibleSection>
    );
  }

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
              Upload your PPM / Listing Particulars (required)
            </label>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Upload your CLO&apos;s PPM to extract all portfolio constraints, test thresholds, and structural parameters.
            </p>
            <input
              ref={ppmInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handlePpmFileChange}
              style={{ marginBottom: "1rem" }}
            />
            {ppmFiles.length > 0 && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                {ppmFiles.map((f) => (
                  <div key={f.name}>
                    {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                  </div>
                ))}
              </div>
            )}
            {uploadedPpmNames.length > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--color-accent)" }}>
                Uploaded: {uploadedPpmNames.join(", ")}
              </div>
            )}

            <label className="ic-field-label" style={{ marginTop: "1.5rem", display: "block" }}>
              Upload Compliance / Trustee Report (optional)
            </label>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Optionally upload the latest compliance or trustee report for portfolio monitoring and compliance extraction.
            </p>
            <input
              ref={complianceInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleComplianceFileChange}
              style={{ marginBottom: "1rem" }}
            />
            {complianceFiles.length > 0 && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                {complianceFiles.map((f) => (
                  <div key={f.name}>
                    {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                  </div>
                ))}
              </div>
            )}
            {uploadedComplianceNames.length > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--color-accent)" }}>
                Uploaded: {uploadedComplianceNames.join(", ")}
              </div>
            )}

            {extracting && (
              <div style={{ marginTop: "1rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                Extracting constraints from your documents... This may take several minutes for large PPMs.
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
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {renderDealOverview()}
              {renderTestsAndConstraints()}
              {renderStructureAndMechanics()}
              {renderPartiesAndManagement()}
              {renderRegulatoryAndLegal()}
              {renderHistoryAndOther()}
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
