"use client";

import type { Citation } from "@/lib/clo/resolver-types";

/** E1 (Sprint 5) — small inline "ⓘ" icon that shows a PPM citation on
 *  hover. Renders nothing when the citation is null/empty so call sites
 *  can render unconditionally without a null check. */
export function CitationTooltip({ citation }: { citation: Citation | null | undefined }) {
  if (!citation) return null;
  const pages = citation.sourcePages && citation.sourcePages.length > 0
    ? `p.${citation.sourcePages.join(", ")}`
    : null;
  const parts = [citation.sourceCondition, pages].filter(Boolean).join(" · ");
  if (!parts) return null;
  const label = `Source: PPM ${parts}`;
  return (
    <span
      title={label}
      aria-label={`PPM citation: ${parts}`}
      style={{
        marginLeft: "0.3em",
        cursor: "help",
        opacity: 0.6,
        fontSize: "0.85em",
      }}
    >
      &#9432;
    </span>
  );
}
