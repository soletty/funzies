"use client";

import { useState } from "react";
import type { CommitteeMember } from "@/lib/ic/types";

interface CommitteeMemberCardProps {
  member: CommitteeMember;
  expanded?: boolean;
  onToggle?: () => void;
}

const RISK_COLORS: Record<string, string> = {
  conservative: "var(--color-high)",
  moderate: "var(--color-medium)",
  aggressive: "var(--color-low)",
};

export default function CommitteeMemberCard({
  member,
  expanded: controlledExpanded,
  onToggle,
}: CommitteeMemberCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;

  function handleToggle() {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  }

  const riskColor = RISK_COLORS[member.riskPersonality?.toLowerCase()] || "var(--color-medium)";

  return (
    <div
      className="ic-member-detail-card"
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleToggle()}
    >
      <div className="ic-member-detail-header">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="ic-member-avatar"
          />
        ) : (
          <div className="ic-member-avatar-placeholder">
            {member.name.charAt(0)}
          </div>
        )}
        <div className="ic-member-detail-info">
          <div className="ic-member-detail-name">{member.name}</div>
          <div className="ic-member-detail-role">{member.role}</div>
        </div>
        <span
          className="ic-risk-dot"
          style={{ background: riskColor }}
          title={`Risk: ${member.riskPersonality}`}
        />
      </div>

      {member.background && (
        <p className="ic-member-detail-bio">
          {expanded ? member.background : member.background.slice(0, 100) + (member.background.length > 100 ? "..." : "")}
        </p>
      )}

      {member.specializations?.length > 0 && (
        <div className="ic-member-tags">
          {member.specializations.map((s) => (
            <span key={s} className="ic-member-tag">{s}</span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="ic-member-expanded">
          {member.fullProfile && (
            <div className="ic-member-section">
              <h4>Profile</h4>
              <p>{member.fullProfile}</p>
            </div>
          )}
          {member.notablePositions?.length > 0 && (
            <div className="ic-member-section">
              <h4>Notable Positions</h4>
              <ul>
                {member.notablePositions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {member.blindSpots?.length > 0 && (
            <div className="ic-member-section">
              <h4>Blind Spots</h4>
              <ul>
                {member.blindSpots.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
