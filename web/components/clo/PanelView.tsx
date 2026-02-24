"use client";

import { useState } from "react";
import type { PanelMember } from "@/lib/clo/types";
import PanelMemberCard from "./PanelMemberCard";

interface PanelViewProps {
  members: PanelMember[];
}

export default function PanelView({ members }: PanelViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="ic-panel-header">
        <h2>Your Credit Panel</h2>
        <span className="ic-panel-count">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="ic-panel-grid">
        {members.map((member, i) => (
          <PanelMemberCard
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
