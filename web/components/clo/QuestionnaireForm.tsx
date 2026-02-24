"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TARGET_SECTOR_OPTIONS = [
  "Technology",
  "Healthcare",
  "Industrials",
  "Consumer",
  "Energy",
  "Financial Services",
  "Telecom",
  "Chemicals",
  "Retail",
  "Media/Entertainment",
  "Transportation",
  "Real Estate",
  "Utilities",
];

const PORTFOLIO_SIZE_OPTIONS = [
  { value: "<100M", label: "< $100M" },
  { value: "100M-500M", label: "$100M - $500M" },
  { value: "500M-1B", label: "$500M - $1B" },
  { value: "1B-5B", label: "$1B - $5B" },
  { value: "5B+", label: "$5B+" },
];

interface FormData {
  fundStrategy: string;
  targetSectors: string[];
  riskAppetite: string;
  cccBucketTolerance: string;
  defaultTolerance: string;
  concentrationLimits: string;
  spreadTargets: string;
  covenantPreferences: string;
  regulatoryConstraints: string;
  portfolioDescription: string;
  beliefsAndBiases: string;
  portfolioSize: string;
  reinvestmentPeriod: string;
}

const INITIAL: FormData = {
  fundStrategy: "",
  targetSectors: [],
  riskAppetite: "",
  cccBucketTolerance: "",
  defaultTolerance: "",
  concentrationLimits: "",
  spreadTargets: "",
  covenantPreferences: "",
  regulatoryConstraints: "",
  portfolioDescription: "",
  beliefsAndBiases: "",
  portfolioSize: "",
  reinvestmentPeriod: "",
};

const STEPS = [
  { id: "strategy", title: "Fund Strategy" },
  { id: "sectors", title: "Target Sectors" },
  { id: "risk", title: "Risk Appetite" },
  { id: "constraints", title: "Portfolio Constraints" },
  { id: "covenants", title: "Covenant Preferences" },
  { id: "regulatory", title: "Regulatory & Compliance" },
  { id: "portfolio", title: "Current Portfolio" },
  { id: "beliefs", title: "Beliefs & Biases" },
];

export default function QuestionnaireForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSector(sector: string) {
    setForm((prev) => ({
      ...prev,
      targetSectors: prev.targetSectors.includes(sector)
        ? prev.targetSectors.filter((s) => s !== sector)
        : [...prev.targetSectors, sector],
    }));
  }

  function canAdvance(): boolean {
    if (step === 0) return form.fundStrategy.trim().length > 0;
    if (step === 2) return form.riskAppetite !== "";
    return true;
  }

  function handleNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    const payload = {
      fundStrategy: form.fundStrategy,
      targetSectors: form.targetSectors.join(", "),
      riskAppetite: form.riskAppetite,
      portfolioSize: form.portfolioSize,
      reinvestmentPeriod: form.reinvestmentPeriod,
      concentrationLimits: form.concentrationLimits,
      covenantPreferences: form.covenantPreferences,
      cccBucketTolerance: form.cccBucketTolerance,
      defaultTolerance: form.defaultTolerance,
      ratingThresholds: [form.cccBucketTolerance, form.defaultTolerance]
        .filter(Boolean)
        .join("; "),
      spreadTargets: form.spreadTargets,
      regulatoryConstraints: form.regulatoryConstraints,
      portfolioDescription: form.portfolioDescription,
      beliefsAndBiases: form.beliefsAndBiases,
    };

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
              Describe your fund strategy
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.fundStrategy}
              onChange={(e) => update("fundStrategy", e.target.value)}
              placeholder="BSL, middle market, broadly syndicated, multi-strategy... Describe your CLO fund's core strategy and mandate."
            />
          </div>
        )}

        {step === 1 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Select your target sectors
            </label>
            <div className="ic-checkbox-group">
              {TARGET_SECTOR_OPTIONS.map((sector) => (
                <label key={sector} className="ic-checkbox">
                  <input
                    type="checkbox"
                    checked={form.targetSectors.includes(sector)}
                    onChange={() => toggleSector(sector)}
                  />
                  <span className="ic-checkbox-label">{sector}</span>
                </label>
              ))}
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
                        onChange={() => update("riskAppetite", opt)}
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
                Maximum CCC bucket tolerance
              </label>
              <textarea
                className="ic-textarea"
                rows={2}
                value={form.cccBucketTolerance}
                onChange={(e) => update("cccBucketTolerance", e.target.value)}
                placeholder="e.g., Max 7.5% CCC-rated assets, prefer to stay below 5%..."
              />
            </div>
            <div className="ic-field">
              <label className="ic-field-label">Default tolerance</label>
              <textarea
                className="ic-textarea"
                rows={2}
                value={form.defaultTolerance}
                onChange={(e) => update("defaultTolerance", e.target.value)}
                placeholder="e.g., Target annual default rate below 2%, stress scenario tolerance..."
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="ic-field">
              <label className="ic-field-label">
                Concentration limits (single-name, industry, CCC bucket caps)
                and WARF/WAL targets
              </label>
              <textarea
                className="ic-textarea"
                rows={4}
                value={form.concentrationLimits}
                onChange={(e) => update("concentrationLimits", e.target.value)}
                placeholder="Single-name max 2%, industry max 12%, CCC cap 7.5%, target WARF 2800, WAL 4.5 years..."
              />
            </div>
            <div className="ic-field">
              <label className="ic-field-label">Spread targets</label>
              <textarea
                className="ic-textarea"
                rows={3}
                value={form.spreadTargets}
                onChange={(e) => update("spreadTargets", e.target.value)}
                placeholder="Target weighted average spread, minimum spread floor, spread compression views..."
              />
            </div>
            <div className="ic-field">
              <label className="ic-field-label">Portfolio size (AUM)</label>
              <select
                className="ic-select"
                value={form.portfolioSize}
                onChange={(e) => update("portfolioSize", e.target.value)}
              >
                <option value="">Select...</option>
                {PORTFOLIO_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ic-field">
              <label className="ic-field-label">
                Remaining reinvestment period
              </label>
              <textarea
                className="ic-textarea"
                rows={2}
                value={form.reinvestmentPeriod}
                onChange={(e) => update("reinvestmentPeriod", e.target.value)}
                placeholder="e.g., 2.5 years remaining, non-call period ends Q3 2025..."
              />
            </div>
          </>
        )}

        {step === 4 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Covenant preferences: cov-lite tolerance, maintenance vs
              incurrence, preferred protections
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.covenantPreferences}
              onChange={(e) => update("covenantPreferences", e.target.value)}
              placeholder="Tolerance for cov-lite loans, preference for maintenance vs incurrence covenants, required protections (change of control, restricted payments, etc.)..."
            />
          </div>
        )}

        {step === 5 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Regulatory and compliance considerations: risk retention, US/EU CLO
              distinctions, ESG screening
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.regulatoryConstraints}
              onChange={(e) => update("regulatoryConstraints", e.target.value)}
              placeholder="Risk retention rules, US vs EU CLO regulatory differences, ESG screening criteria, Volcker Rule considerations..."
            />
          </div>
        )}

        {step === 6 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Describe your current portfolio composition, vintage, and
              performance
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.portfolioDescription}
              onChange={(e) => update("portfolioDescription", e.target.value)}
              placeholder="Current portfolio breakdown by sector, rating, vintage distribution, OC/IC test cushions, recent trading activity..."
            />
          </div>
        )}

        {step === 7 && (
          <div className="ic-field">
            <label className="ic-field-label">
              What should your panel know about your views?
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.beliefsAndBiases}
              onChange={(e) => update("beliefsAndBiases", e.target.value)}
              placeholder="Strong convictions on sectors or structures, known biases, contrarian views, areas where you want to be challenged..."
            />
          </div>
        )}
      </div>

      {error && <p className="ic-error">{error}</p>}

      <div className="ic-step-actions">
        {step > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleBack}
            disabled={submitting}
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
            disabled={submitting || !canAdvance()}
          >
            {submitting ? "Submitting..." : "Build My Panel"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={handleNext}
            disabled={!canAdvance() || submitting}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
