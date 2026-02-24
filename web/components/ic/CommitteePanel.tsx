"use client";

import { useState } from "react";
import type { CommitteeMember } from "@/lib/ic/types";
import CommitteeMemberCard from "./CommitteeMemberCard";

interface CommitteePanelProps {
  members: CommitteeMember[];
}

export default function CommitteePanel({ members }: CommitteePanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="ic-panel-header">
        <h2>Your Investment Committee</h2>
        <span className="ic-panel-count">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="ic-panel-grid">
        {members.map((member, i) => (
          <CommitteeMemberCard
            key={member.number}
            member={member}
            expanded={expandedIndex === i}
            onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
}
