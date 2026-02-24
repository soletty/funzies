"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AnalysisType = "buy" | "switch";

export default function AnalysisForm() {
  const router = useRouter();
  const [analysisType, setAnalysisType] = useState<AnalysisType>("buy");
  const [title, setTitle] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [sector, setSector] = useState("");
  const [loanType, setLoanType] = useState("");
  const [spreadCoupon, setSpreadCoupon] = useState("");
  const [rating, setRating] = useState("");
  const [maturity, setMaturity] = useState("");
  const [facilitySize, setFacilitySize] = useState("");
  const [leverage, setLeverage] = useState("");
  const [interestCoverage, setInterestCoverage] = useState("");
  const [covenantsSummary, setCovenantsSummary] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [revenue, setRevenue] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [switchBorrowerName, setSwitchBorrowerName] = useState("");
  const [switchSector, setSwitchSector] = useState("");
  const [switchLoanType, setSwitchLoanType] = useState("");
  const [switchSpreadCoupon, setSwitchSpreadCoupon] = useState("");
  const [switchRating, setSwitchRating] = useState("");
  const [switchMaturity, setSwitchMaturity] = useState("");
  const [switchFacilitySize, setSwitchFacilitySize] = useState("");
  const [switchLeverage, setSwitchLeverage] = useState("");
  const [switchInterestCoverage, setSwitchInterestCoverage] = useState("");
  const [switchCovenantsSummary, setSwitchCovenantsSummary] = useState("");
  const [switchEbitda, setSwitchEbitda] = useState("");
  const [switchRevenue, setSwitchRevenue] = useState("");
  const [switchCompanyDescription, setSwitchCompanyDescription] = useState("");
  const [switchNotes, setSwitchNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setError("");
    setSubmitting(true);

    const payload: Record<string, string> = {
      analysisType,
      title: title.trim(),
      borrowerName: borrowerName.trim(),
      sector: sector.trim(),
      loanType: loanType.trim(),
      spreadCoupon: spreadCoupon.trim(),
      rating: rating.trim(),
      maturity: maturity.trim(),
      facilitySize: facilitySize.trim(),
      leverage: leverage.trim(),
      interestCoverage: interestCoverage.trim(),
      covenantsSummary: covenantsSummary.trim(),
      ebitda: ebitda.trim(),
      revenue: revenue.trim(),
      companyDescription: companyDescription.trim(),
      notes: notes.trim(),
    };

    if (analysisType === "switch") {
      payload.switchBorrowerName = switchBorrowerName.trim();
      payload.switchSector = switchSector.trim();
      payload.switchLoanType = switchLoanType.trim();
      payload.switchSpreadCoupon = switchSpreadCoupon.trim();
      payload.switchRating = switchRating.trim();
      payload.switchMaturity = switchMaturity.trim();
      payload.switchFacilitySize = switchFacilitySize.trim();
      payload.switchLeverage = switchLeverage.trim();
      payload.switchInterestCoverage = switchInterestCoverage.trim();
      payload.switchCovenantsSummary = switchCovenantsSummary.trim();
      payload.switchEbitda = switchEbitda.trim();
      payload.switchRevenue = switchRevenue.trim();
      payload.switchCompanyDescription = switchCompanyDescription.trim();
      payload.switchNotes = switchNotes.trim();
    }

    const res = await fetch("/api/clo/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create analysis");
      setSubmitting(false);
      return;
    }

    const { id } = await res.json();
    router.push(`/clo/analyze/${id}/generating`);
  }

  function renderLoanFields(
    prefix: string,
    values: {
      borrowerName: string;
      sector: string;
      loanType: string;
      spreadCoupon: string;
      rating: string;
      maturity: string;
      facilitySize: string;
      leverage: string;
      interestCoverage: string;
      covenantsSummary: string;
      ebitda: string;
      revenue: string;
      companyDescription: string;
      notes: string;
    },
    setters: {
      setBorrowerName: (v: string) => void;
      setSector: (v: string) => void;
      setLoanType: (v: string) => void;
      setSpreadCoupon: (v: string) => void;
      setRating: (v: string) => void;
      setMaturity: (v: string) => void;
      setFacilitySize: (v: string) => void;
      setLeverage: (v: string) => void;
      setInterestCoverage: (v: string) => void;
      setCovenantsSummary: (v: string) => void;
      setEbitda: (v: string) => void;
      setRevenue: (v: string) => void;
      setCompanyDescription: (v: string) => void;
      setNotes: (v: string) => void;
    }
  ) {
    return (
      <>
        <div className="ic-field">
          <label className="ic-field-label">Borrower Name {prefix === "primary" ? "*" : ""}</label>
          <input
            type="text"
            className="ic-input"
            value={values.borrowerName}
            onChange={(e) => setters.setBorrowerName(e.target.value)}
            placeholder="e.g., Acme Holdings LLC"
            required={prefix === "primary"}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="ic-field">
            <label className="ic-field-label">Sector</label>
            <input
              type="text"
              className="ic-input"
              value={values.sector}
              onChange={(e) => setters.setSector(e.target.value)}
              placeholder="e.g., Technology"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Loan Type</label>
            <input
              type="text"
              className="ic-input"
              value={values.loanType}
              onChange={(e) => setters.setLoanType(e.target.value)}
              placeholder="e.g., First Lien Term Loan"
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div className="ic-field">
            <label className="ic-field-label">Spread / Coupon</label>
            <input
              type="text"
              className="ic-input"
              value={values.spreadCoupon}
              onChange={(e) => setters.setSpreadCoupon(e.target.value)}
              placeholder="e.g., SOFR + 400bps"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Rating</label>
            <input
              type="text"
              className="ic-input"
              value={values.rating}
              onChange={(e) => setters.setRating(e.target.value)}
              placeholder="e.g., B2/B"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Maturity</label>
            <input
              type="text"
              className="ic-input"
              value={values.maturity}
              onChange={(e) => setters.setMaturity(e.target.value)}
              placeholder="e.g., 2029"
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div className="ic-field">
            <label className="ic-field-label">Facility Size</label>
            <input
              type="text"
              className="ic-input"
              value={values.facilitySize}
              onChange={(e) => setters.setFacilitySize(e.target.value)}
              placeholder="e.g., $500M"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Leverage</label>
            <input
              type="text"
              className="ic-input"
              value={values.leverage}
              onChange={(e) => setters.setLeverage(e.target.value)}
              placeholder="e.g., 5.2x"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Interest Coverage</label>
            <input
              type="text"
              className="ic-input"
              value={values.interestCoverage}
              onChange={(e) => setters.setInterestCoverage(e.target.value)}
              placeholder="e.g., 2.1x"
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="ic-field">
            <label className="ic-field-label">EBITDA</label>
            <input
              type="text"
              className="ic-input"
              value={values.ebitda}
              onChange={(e) => setters.setEbitda(e.target.value)}
              placeholder="e.g., $95M"
            />
          </div>
          <div className="ic-field">
            <label className="ic-field-label">Revenue</label>
            <input
              type="text"
              className="ic-input"
              value={values.revenue}
              onChange={(e) => setters.setRevenue(e.target.value)}
              placeholder="e.g., $450M"
            />
          </div>
        </div>

        <div className="ic-field">
          <label className="ic-field-label">Covenants Summary</label>
          <textarea
            className="ic-textarea"
            rows={3}
            value={values.covenantsSummary}
            onChange={(e) => setters.setCovenantsSummary(e.target.value)}
            placeholder="Covenant package details, maintenance vs incurrence, key protections..."
          />
        </div>

        <div className="ic-field">
          <label className="ic-field-label">Company Description</label>
          <textarea
            className="ic-textarea"
            rows={3}
            value={values.companyDescription}
            onChange={(e) => setters.setCompanyDescription(e.target.value)}
            placeholder="Business overview, market position, competitive dynamics..."
          />
        </div>

        <div className="ic-field">
          <label className="ic-field-label">Notes</label>
          <textarea
            className="ic-textarea"
            rows={2}
            value={values.notes}
            onChange={(e) => setters.setNotes(e.target.value)}
            placeholder="Additional context, recent developments, sponsor information..."
          />
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="ic-eval-form">
      <div className="ic-field">
        <label className="ic-field-label">Analysis Type</label>
        <div className="ic-radio-group">
          <label className="ic-radio">
            <input
              type="radio"
              name="analysisType"
              value="buy"
              checked={analysisType === "buy"}
              onChange={() => setAnalysisType("buy")}
            />
            <span className="ic-radio-label">Buy Analysis</span>
          </label>
          <label className="ic-radio">
            <input
              type="radio"
              name="analysisType"
              value="switch"
              checked={analysisType === "switch"}
              onChange={() => setAnalysisType("switch")}
            />
            <span className="ic-radio-label">Switch Analysis</span>
          </label>
        </div>
      </div>

      <div className="ic-field">
        <label className="ic-field-label">Title *</label>
        <input
          type="text"
          className="ic-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Buy Analysis: Acme Industries TLB"
          required
        />
      </div>

      {analysisType === "switch" && (
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginTop: "1rem" }}>
          Current Loan (Sell)
        </h3>
      )}

      {renderLoanFields(
        "primary",
        { borrowerName, sector, loanType, spreadCoupon, rating, maturity, facilitySize, leverage, interestCoverage, covenantsSummary, ebitda, revenue, companyDescription, notes },
        { setBorrowerName, setSector, setLoanType, setSpreadCoupon, setRating, setMaturity, setFacilitySize, setLeverage, setInterestCoverage, setCovenantsSummary, setEbitda, setRevenue, setCompanyDescription, setNotes }
      )}

      {analysisType === "switch" && (
        <>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginTop: "1.5rem" }}>
            Target Loan (Buy)
          </h3>
          {renderLoanFields(
            "switch",
            {
              borrowerName: switchBorrowerName, sector: switchSector, loanType: switchLoanType,
              spreadCoupon: switchSpreadCoupon, rating: switchRating, maturity: switchMaturity,
              facilitySize: switchFacilitySize, leverage: switchLeverage,
              interestCoverage: switchInterestCoverage, covenantsSummary: switchCovenantsSummary,
              ebitda: switchEbitda, revenue: switchRevenue,
              companyDescription: switchCompanyDescription, notes: switchNotes,
            },
            {
              setBorrowerName: setSwitchBorrowerName, setSector: setSwitchSector,
              setLoanType: setSwitchLoanType, setSpreadCoupon: setSwitchSpreadCoupon,
              setRating: setSwitchRating, setMaturity: setSwitchMaturity,
              setFacilitySize: setSwitchFacilitySize, setLeverage: setSwitchLeverage,
              setInterestCoverage: setSwitchInterestCoverage,
              setCovenantsSummary: setSwitchCovenantsSummary,
              setEbitda: setSwitchEbitda, setRevenue: setSwitchRevenue,
              setCompanyDescription: setSwitchCompanyDescription, setNotes: setSwitchNotes,
            }
          )}
        </>
      )}

      {error && <p className="ic-error">{error}</p>}

      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || !title.trim()}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {submitting ? "Creating Analysis..." : "Submit for Analysis"}
      </button>
    </form>
  );
}
