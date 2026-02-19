"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleValidateAndStore() {
    if (!apiKey.trim()) return;
    setError("");
    setValidating(true);

    const validateRes = await fetch("/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    const validateData = await validateRes.json();

    if (!validateData.valid) {
      setError(validateData.error || "Invalid API key. Please check and try again.");
      setValidating(false);
      return;
    }

    const storeRes = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    if (!storeRes.ok) {
      setError("Failed to store API key. Please try again.");
      setValidating(false);
      return;
    }

    setValidating(false);
    setSuccess(true);

    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 2000);
  }

  return (
    <div className="standalone-page">
      <div className="standalone-page-inner">
        <div className="standalone-header">
          <h1>Connect your Anthropic account</h1>
          <p>
            The Intellectual Assembly uses Claude to generate debates. You&apos;ll need an API key.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <StepCard number={1} title="Get an API key" active={step >= 1} done={step > 1}>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Go to the Anthropic Console and create an API key.
            </p>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setStep(2)}
              className="btn-secondary"
            >
              Open Anthropic Console
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </StepCard>

          <StepCard number={2} title='Click "Create Key"' active={step >= 2} done={step > 2}>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Give the key a name (e.g. &quot;Intellectual Assembly&quot;) and copy it.
            </p>
            {step === 2 && (
              <button onClick={() => setStep(3)} className="btn-secondary" style={{ marginTop: "0.75rem" }}>
                I&apos;ve copied the key &rarr;
              </button>
            )}
          </StepCard>

          <StepCard number={3} title="Paste your key" active={step >= 3} done={success}>
            {success ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-high)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontWeight: 500 }}>Key validated and stored securely!</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="form-field"
                    style={{
                      flex: 1,
                      padding: "0.65rem 0.85rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      background: "var(--color-bg)",
                    }}
                    disabled={validating}
                  />
                  <button
                    onClick={handleValidateAndStore}
                    disabled={validating || !apiKey.trim()}
                    className={`btn-primary ${validating || !apiKey.trim() ? "disabled" : ""}`}
                  >
                    {validating ? "Validating..." : "Connect"}
                  </button>
                </div>
                {error && (
                  <p style={{ color: "var(--color-low)", fontSize: "0.85rem" }}>{error}</p>
                )}
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  Assemblies typically cost ~$0.50 in API credits. Your key is encrypted with AES-256-GCM.
                </p>
              </>
            )}
          </StepCard>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  active,
  done,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  const className = `step-card ${active ? "active" : ""} ${done ? "done" : ""}`;

  return (
    <div className={className}>
      <div className="step-card-header">
        <div className="step-card-number">
          {done ? "\u2713" : number}
        </div>
        <h3 className="step-card-title">{title}</h3>
      </div>
      {active && <div className="step-card-body">{children}</div>}
    </div>
  );
}
