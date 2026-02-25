"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PulseAccessGate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/pulse/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setError("Invalid access code");
      setLoading(false);
    }
  }

  return (
    <div className="pulse-gate">
      <div className="pulse-gate-bg">
        <div className="pulse-gate-ring pulse-gate-ring-1" />
        <div className="pulse-gate-ring pulse-gate-ring-2" />
        <div className="pulse-gate-ring pulse-gate-ring-3" />
      </div>

      <div className="pulse-gate-content">
        <div className="pulse-gate-label">PULSE</div>
        <h1 className="pulse-gate-title">Movement Detection Engine</h1>
        <p className="pulse-gate-subtitle">
          Real-time signal intelligence from six global data sources.
          <br />
          Enter access code to proceed.
        </p>

        <form onSubmit={handleSubmit} className="pulse-gate-form">
          <div className="pulse-gate-input-wrap">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="&#x2022; &#x2022; &#x2022; &#x2022; &#x2022; &#x2022;"
              className="pulse-gate-input"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <div className="pulse-gate-input-glow" />
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="pulse-gate-submit"
          >
            {loading ? (
              <span className="pulse-gate-loading">
                <span className="pulse-gate-dot" />
                <span className="pulse-gate-dot" />
                <span className="pulse-gate-dot" />
              </span>
            ) : (
              "Authenticate"
            )}
          </button>

          {error && <p className="pulse-gate-error">{error}</p>}
        </form>

        <div className="pulse-gate-footer">
          <span className="pulse-gate-footer-dot" />
          <span>Million Minds Intelligence</span>
        </div>
      </div>
    </div>
  );
}
