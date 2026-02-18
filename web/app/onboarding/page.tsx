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
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "520px", width: "100%", padding: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
          Connect your Anthropic account
        </h1>
        <p style={{ color: "var(--color-text-secondary)", textAlign: "center", marginBottom: "2.5rem" }}>
          The Intellectual Assembly uses Claude to generate debates. You&apos;ll need an API key.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <StepCard
            number={1}
            title="Get an API key"
            active={step >= 1}
            done={step > 1}
          >
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Go to the Anthropic Console and create an API key.
            </p>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setStep(2)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text)",
                textDecoration: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              Open Anthropic Console
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </StepCard>

          <StepCard
            number={2}
            title='Click "Create Key"'
            active={step >= 2}
            done={step > 2}
          >
            <p style={{ color: "var(--color-text-secondary)" }}>
              Give the key a name (e.g. &quot;Intellectual Assembly&quot;) and copy it.
            </p>
            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                style={{
                  marginTop: "0.75rem",
                  padding: "0.4rem 0.8rem",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                I&apos;ve copied the key &rarr;
              </button>
            )}
          </StepCard>

          <StepCard
            number={3}
            title="Paste your key"
            active={step >= 3}
            done={success}
          >
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
                    style={{
                      flex: 1,
                      padding: "0.6rem 0.8rem",
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
                    style={{
                      padding: "0.6rem 1.2rem",
                      background: validating ? "var(--color-surface-alt)" : "var(--color-accent)",
                      color: validating ? "var(--color-text-muted)" : "#fff",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: validating ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      fontSize: "0.9rem",
                    }}
                  >
                    {validating ? "Validating..." : "Connect"}
                  </button>
                </div>
                {error && (
                  <p style={{ color: "var(--color-low)", fontSize: "0.85rem" }}>{error}</p>
                )}
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  Assemblies typically cost $2–5 in API credits. Your key is encrypted with AES-256-GCM.
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
  return (
    <div
      style={{
        padding: "1.25rem 1.5rem",
        background: active ? "var(--color-surface)" : "transparent",
        borderRadius: "var(--radius)",
        border: `1px solid ${active ? "var(--color-border)" : "var(--color-border-light)"}`,
        opacity: active ? 1 : 0.5,
        transition: "var(--transition)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.8rem",
            fontWeight: 600,
            background: done ? "var(--color-high)" : active ? "var(--color-accent)" : "var(--color-surface-alt)",
            color: done || active ? "#fff" : "var(--color-text-muted)",
          }}
        >
          {done ? "✓" : number}
        </div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 600 }}>
          {title}
        </h3>
      </div>
      {active && <div style={{ paddingLeft: "2.75rem" }}>{children}</div>}
    </div>
  );
}
