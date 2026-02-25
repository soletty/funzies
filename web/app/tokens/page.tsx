"use client";

import { useState, useEffect, useCallback } from "react";

interface Token {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadTokens = useCallback(async () => {
    const res = await fetch("/api/auth/tokens");
    if (res.ok) setTokens(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  async function handleCreate() {
    if (!name.trim()) return;
    setError("");
    setCreating(true);

    const res = await fetch("/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!res.ok) {
      setError("Failed to create token.");
      setCreating(false);
      return;
    }

    const data = await res.json();
    setNewToken(data.token);
    setName("");
    setCreating(false);
    loadTokens();
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/auth/tokens/${id}`, { method: "DELETE" });
    loadTokens();
  }

  function handleCopy() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function timeAgo(dateStr: string) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  return (
    <div className="standalone-page">
      <div className="standalone-page-inner">
        <div className="standalone-header">
          <h1>API Tokens</h1>
          <p>
            Create tokens to access the API from scripts, curl, or other tools.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* New token banner */}
          {newToken && (
            <div className="step-card active" style={{ borderColor: "var(--color-high)" }}>
              <div className="step-card-body">
                <p style={{ fontWeight: 500, marginBottom: "0.5rem" }}>
                  Token created — copy it now, it won&apos;t be shown again.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <code style={{
                    flex: 1,
                    padding: "0.5rem 0.75rem",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    wordBreak: "break-all",
                  }}>
                    {newToken}
                  </code>
                  <button className="btn-primary" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => setNewToken(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontSize: "0.8rem",
                    marginTop: "0.5rem",
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                    padding: 0,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="step-card active">
            <div className="step-card-body">
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="Token name (e.g. my-script)"
                  className="form-field"
                  style={{
                    flex: 1,
                    padding: "0.65rem 0.85rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.85rem",
                    background: "var(--color-bg)",
                  }}
                  disabled={creating}
                  autoFocus
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  className={`btn-primary ${creating || !name.trim() ? "disabled" : ""}`}
                >
                  {creating ? "Creating..." : "Create Token"}
                </button>
              </div>
              {error && (
                <p style={{ color: "var(--color-low)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</p>
              )}
            </div>
          </div>

          {/* Token list */}
          {loading ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", textAlign: "center" }}>Loading...</p>
          ) : tokens.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
              No tokens yet. Create one above to get started.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="step-card"
                  style={{ opacity: 1 }}
                >
                  <div className="step-card-body" style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{t.name}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                        {t.token_prefix}...
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {t.last_used_at ? `Used ${timeAgo(t.last_used_at)}` : "Never used"}
                        {" · "}Created {timeAgo(t.created_at)}
                      </span>
                      <button
                        onClick={() => handleRevoke(t.id)}
                        style={{
                          background: "none",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          color: "var(--color-low)",
                          fontSize: "0.8rem",
                          padding: "0.35rem 0.65rem",
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Usage hint */}
          {tokens.length > 0 && !newToken && (
            <div style={{
              color: "var(--color-text-muted)",
              fontSize: "0.8rem",
              textAlign: "center",
              padding: "0.5rem 0",
            }}>
              Use tokens with: <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                curl -H &quot;Authorization: Bearer fz_...&quot; /api/assemblies
              </code>
            </div>
          )}

          <div style={{ textAlign: "center" }}>
            <a
              href="/"
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.85rem",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
