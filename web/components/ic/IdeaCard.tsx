"use client";

import { useState } from "react";
import type { InvestmentIdea } from "@/lib/ic/types";

interface IdeaCardProps {
  idea: InvestmentIdea;
}

const RISK_COLORS: Record<string, string> = {
  low: "var(--color-high)",
  moderate: "var(--color-medium)",
  high: "var(--color-low)",
};

export default function IdeaCard({ idea }: IdeaCardProps) {
  const [expanded, setExpanded] = useState(false);

  const riskColor = RISK_COLORS[idea.riskLevel?.toLowerCase()] || "var(--color-medium)";

  return (
    <div
      className="ic-idea-card"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
    >
      <div className="ic-idea-header">
        <h3 className="ic-idea-title">{idea.title}</h3>
        <div className="ic-idea-tags">
          {idea.assetClass && (
            <span className="ic-eval-type-tag">{idea.assetClass}</span>
          )}
          {idea.timeHorizon && (
            <span className="ic-member-tag">{idea.timeHorizon}</span>
          )}
          {idea.riskLevel && (
            <span className="ic-member-tag" style={{ color: riskColor, borderColor: riskColor }}>
              {idea.riskLevel} risk
            </span>
          )}
        </div>
      </div>

      <p className="ic-idea-thesis">
        {expanded ? idea.thesis : idea.thesis?.slice(0, 120) + (idea.thesis?.length > 120 ? "..." : "")}
      </p>

      {expanded && (
        <div className="ic-idea-expanded">
          {idea.rationale && (
            <div className="ic-member-section">
              <h4>Rationale</h4>
              <p>{idea.rationale}</p>
            </div>
          )}
          {idea.keyRisks?.length > 0 && (
            <div className="ic-member-section">
              <h4>Key Risks</h4>
              <ul>
                {idea.keyRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {idea.implementationSteps?.length > 0 && (
            <div className="ic-member-section">
              <h4>Implementation</h4>
              <ol>
                {idea.implementationSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {idea.expectedReturn && (
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.75rem" }}>
              Expected return: {idea.expectedReturn}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
