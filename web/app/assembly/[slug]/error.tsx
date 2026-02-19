"use client";

export default function AssemblyError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      minHeight: "60vh",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ maxWidth: "480px", textAlign: "center", padding: "2rem" }}>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          marginBottom: "0.75rem",
        }}>
          Failed to load assembly
        </h2>
        <p style={{
          color: "var(--color-text-secondary)",
          marginBottom: "1.5rem",
          fontSize: "0.9rem",
        }}>
          {error.message || "Something went wrong loading this page."}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.2rem",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
