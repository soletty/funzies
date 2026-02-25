import type { Verdict } from "@/lib/ic/types";

interface RecommendationBadgeProps {
  verdict: Verdict;
}

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; bg: string }> = {
  strongly_favorable: { label: "Strongly Favorable", color: "#1a5c36", bg: "#d4edda" },
  favorable: { label: "Favorable", color: "var(--color-high)", bg: "var(--color-high-bg)" },
  mixed: { label: "Mixed", color: "var(--color-medium)", bg: "var(--color-medium-bg)" },
  unfavorable: { label: "Unfavorable", color: "#c53030", bg: "#fee2e2" },
  strongly_unfavorable: { label: "Strongly Unfavorable", color: "#7f1d1d", bg: "#fecaca" },
};

export default function RecommendationBadge({ verdict }: RecommendationBadgeProps) {
  const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.mixed;

  return (
    <div
      className="ic-verdict-badge"
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.color}`,
      }}
    >
      {config.label}
    </div>
  );
}
