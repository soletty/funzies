"use client";

export function LoadingSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div style={{ padding: "2rem", maxWidth: "860px", margin: "0 auto" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? "2rem" : "1rem",
            width: i === 0 ? "60%" : `${70 + Math.random() * 30}%`,
            background: "var(--color-surface-alt)",
            borderRadius: "var(--radius-sm)",
            marginBottom: i === 0 ? "1.5rem" : "0.75rem",
            animation: "pulse 2s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
