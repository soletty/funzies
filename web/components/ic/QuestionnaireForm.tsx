"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ASSET_CLASS_OPTIONS = [
  "Public Equities",
  "Fixed Income",
  "Private Equity",
  "Venture Capital",
  "Real Estate",
  "Crypto/Digital Assets",
  "Commodities",
  "Alternatives (Hedge Funds, Art, etc.)",
];

const AUM_OPTIONS = [
  { value: "<10M", label: "< $10M" },
  { value: "10M-50M", label: "$10M - $50M" },
  { value: "50M-200M", label: "$50M - $200M" },
  { value: "200M-500M", label: "$200M - $500M" },
  { value: "500M-1B", label: "$500M - $1B" },
  { value: "1B+", label: "$1B+" },
];

const TIME_HORIZON_OPTIONS = [
  { value: "short-term", label: "Short-term (< 2 years)" },
  { value: "medium-term", label: "Medium-term (2-7 years)" },
  { value: "long-term", label: "Long-term (7-20 years)" },
  { value: "multi-generational", label: "Multi-generational (20+ years)" },
];

interface FormData {
  investmentPhilosophy: string;
  riskTolerance: string;
  maxDrawdown: string;
  liquidityNeeds: string;
  assetClasses: string[];
  currentPortfolio: string;
  geographicPreferences: string;
  esgPreferences: string;
  timeHorizon: string;
  aumRange: string;
  regulatoryConstraints: string;
  beliefsAndBiases: string;
}

const INITIAL: FormData = {
  investmentPhilosophy: "",
  riskTolerance: "",
  maxDrawdown: "",
  liquidityNeeds: "",
  assetClasses: [],
  currentPortfolio: "",
  geographicPreferences: "",
  esgPreferences: "",
  timeHorizon: "",
  aumRange: "",
  regulatoryConstraints: "",
  beliefsAndBiases: "",
};

const STEPS = [
  { id: "philosophy", title: "Investment Philosophy" },
  { id: "risk", title: "Risk Profile" },
  { id: "assets", title: "Asset Classes" },
  { id: "portfolio", title: "Current Portfolio" },
  { id: "geography", title: "Geographic & Sector" },
  { id: "esg", title: "ESG / Impact" },
  { id: "aum", title: "AUM & Constraints" },
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

  function toggleAssetClass(cls: string) {
    setForm((prev) => ({
      ...prev,
      assetClasses: prev.assetClasses.includes(cls)
        ? prev.assetClasses.filter((c) => c !== cls)
        : [...prev.assetClasses, cls],
    }));
  }

  function canAdvance(): boolean {
    if (step === 0) return form.investmentPhilosophy.trim().length > 0;
    if (step === 1) return form.riskTolerance !== "";
    if (step === 2) return form.assetClasses.length > 0;
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
      investmentPhilosophy: form.investmentPhilosophy,
      riskTolerance: form.riskTolerance,
      assetClasses: form.assetClasses,
      currentPortfolio: form.currentPortfolio,
      geographicPreferences: form.geographicPreferences,
      esgPreferences: form.esgPreferences,
      decisionStyle: "",
      aumRange: form.aumRange,
      timeHorizons: { primary: form.timeHorizon },
      beliefsAndBiases: form.beliefsAndBiases,
      maxDrawdown: form.maxDrawdown,
      liquidityNeeds: form.liquidityNeeds,
      regulatoryConstraints: form.regulatoryConstraints,
    };

    const profileRes = await fetch("/api/ic/profile", {
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

    const committeeRes = await fetch("/api/ic/committee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!committeeRes.ok) {
      const data = await committeeRes.json();
      setError(data.error || "Failed to start committee generation.");
      setSubmitting(false);
      return;
    }

    router.push("/ic/committee/generating");
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
              What drives your investing approach?
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.investmentPhilosophy}
              onChange={(e) => update("investmentPhilosophy", e.target.value)}
              placeholder="Describe your core investment beliefs, the principles that guide your decisions, and what success looks like for your portfolio..."
            />
          </div>
        )}

        {step === 1 && (
          <>
            <div className="ic-field">
              <label className="ic-field-label">Risk tolerance</label>
              <div className="ic-radio-group">
                {(["conservative", "moderate", "aggressive"] as const).map(
                  (opt) => (
                    <label key={opt} className="ic-radio">
                      <input
                        type="radio"
                        name="riskTolerance"
                        value={opt}
                        checked={form.riskTolerance === opt}
                        onChange={() => update("riskTolerance", opt)}
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
                Maximum drawdown tolerance
              </label>
              <textarea
                className="ic-textarea"
                rows={2}
                value={form.maxDrawdown}
                onChange={(e) => update("maxDrawdown", e.target.value)}
                placeholder="e.g., 20% peak-to-trough in a severe downturn..."
              />
            </div>
            <div className="ic-field">
              <label className="ic-field-label">Liquidity needs</label>
              <textarea
                className="ic-textarea"
                rows={2}
                value={form.liquidityNeeds}
                onChange={(e) => update("liquidityNeeds", e.target.value)}
                placeholder="Describe your liquidity requirements and time sensitivity..."
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Select your preferred asset classes
            </label>
            <div className="ic-checkbox-group">
              {ASSET_CLASS_OPTIONS.map((cls) => (
                <label key={cls} className="ic-checkbox">
                  <input
                    type="checkbox"
                    checked={form.assetClasses.includes(cls)}
                    onChange={() => toggleAssetClass(cls)}
                  />
                  <span className="ic-checkbox-label">{cls}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Describe your existing positions and allocations
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.currentPortfolio}
              onChange={(e) => update("currentPortfolio", e.target.value)}
              placeholder="Current allocation breakdown, major positions, concentration risks..."
            />
          </div>
        )}

        {step === 4 && (
          <div className="ic-field">
            <label className="ic-field-label">
              Preferred geographies, sector biases, and exclusions
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.geographicPreferences}
              onChange={(e) => update("geographicPreferences", e.target.value)}
              placeholder="Regions of interest, sector tilts, any hard exclusions..."
            />
          </div>
        )}

        {step === 5 && (
          <div className="ic-field">
            <label className="ic-field-label">
              ESG preferences, exclusion criteria, and impact goals
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.esgPreferences}
              onChange={(e) => update("esgPreferences", e.target.value)}
              placeholder="ESG integration level, exclusion lists, impact targets..."
            />
          </div>
        )}

        {step === 6 && (
          <>
            <div className="ic-field">
              <label className="ic-field-label">AUM range</label>
              <select
                className="ic-select"
                value={form.aumRange}
                onChange={(e) => update("aumRange", e.target.value)}
              >
                <option value="">Select...</option>
                {AUM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ic-field">
              <label className="ic-field-label">Primary time horizon</label>
              <select
                className="ic-select"
                value={form.timeHorizon}
                onChange={(e) => update("timeHorizon", e.target.value)}
              >
                <option value="">Select...</option>
                {TIME_HORIZON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ic-field">
              <label className="ic-field-label">
                Regulatory or tax constraints
              </label>
              <textarea
                className="ic-textarea"
                rows={3}
                value={form.regulatoryConstraints}
                onChange={(e) =>
                  update("regulatoryConstraints", e.target.value)
                }
                placeholder="Jurisdiction-specific rules, tax considerations, compliance requirements..."
              />
            </div>
          </>
        )}

        {step === 7 && (
          <div className="ic-field">
            <label className="ic-field-label">
              What should your committee know about your views?
            </label>
            <textarea
              className="ic-textarea"
              rows={5}
              value={form.beliefsAndBiases}
              onChange={(e) => update("beliefsAndBiases", e.target.value)}
              placeholder="Strong convictions, known biases, contrarian views, areas where you want to be challenged..."
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
            {submitting ? "Submitting..." : "Build My Committee"}
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
