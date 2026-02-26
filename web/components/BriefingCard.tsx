"use client";

import { useState, useEffect } from "react";

interface BriefingCardProps {
  product: "ic" | "clo";
}

export default function BriefingCard({ product }: BriefingCardProps) {
  const [digest, setDigest] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/${product}/briefing`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.relevant && data.digest_md) {
          setDigest(data.digest_md);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [product]);

  if (!loaded || !digest) return null;

  return (
    <section
      className="ic-section"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "1rem 1.25rem",
        background: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "inherit",
          font: "inherit",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
          Market Briefing
        </h2>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            transition: "transform 0.2s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>
      {!collapsed && (
        <div
          style={{
            marginTop: "0.75rem",
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: "var(--color-text-secondary, var(--color-text))",
            whiteSpace: "pre-wrap",
          }}
        >
          {digest}
        </div>
      )}
    </section>
  );
}
