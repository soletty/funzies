import type { Verdict } from "@/lib/ic/types";

interface RecommendationBadgeProps {
  verdict: Verdict;
}

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; bg: string }> = {
  strong_buy: { label: "Strong Buy", color: "#1a5c36", bg: "#d4edda" },
  buy: { label: "Buy", color: "var(--color-high)", bg: "var(--color-high-bg)" },
  hold: { label: "Hold", color: "var(--color-medium)", bg: "var(--color-medium-bg)" },
  pass: { label: "Pass", color: "#c53030", bg: "#fee2e2" },
  strong_pass: { label: "Strong Pass", color: "#7f1d1d", bg: "#fecaca" },
};

export default function RecommendationBadge({ verdict }: RecommendationBadgeProps) {
  const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;

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
