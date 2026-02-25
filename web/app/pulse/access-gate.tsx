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
    <div className="pulse-access-gate">
      <div className="pulse-access-inner">
        <span className="pulse-access-badge">PULSE</span>
        <h1>Movement Detection Engine</h1>
        <p>Enter the access code to view Pulse.</p>
        <form onSubmit={handleSubmit} className="pulse-access-form">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="pulse-access-input"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="btn-primary"
          >
            {loading ? "Verifying..." : "Enter"}
          </button>
          {error && <p className="pulse-access-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
