"use client";

import { useState, useEffect, useCallback } from "react";

interface Share {
  id: string;
  shared_with_email: string;
  role: string;
  accepted_at: string | null;
  invite_token: string | null;
  user_name: string | null;
  created_at: string;
}

interface SharePanelProps {
  assemblyId: string;
  onClose: () => void;
}

export default function SharePanel({ assemblyId, onClose }: SharePanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"read" | "write">("read");
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchShares = useCallback(async () => {
    const res = await fetch(`/api/assemblies/${assemblyId}/shares`);
    if (res.ok) {
      setShares(await res.json());
    }
  }, [assemblyId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    const res = await fetch(`/api/assemblies/${assemblyId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create invite");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setEmail("");
    setLoading(false);
    await fetchShares();

    await navigator.clipboard.writeText(data.inviteUrl);
    setCopiedId(data.id);
    setTimeout(() => setCopiedId(null), 3000);
  }

  async function handleRemove(shareId: string) {
    await fetch(`/api/assemblies/${assemblyId}/shares/${shareId}`, { method: "DELETE" });
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  }

  return (
    <div className="share-panel-overlay" onClick={onClose}>
      <div className="share-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-panel-header">
          <h2>Share Panel</h2>
          <button onClick={onClose} className="share-panel-close">&times;</button>
        </div>

        <form onSubmit={handleInvite} className="share-panel-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "read" | "write")}>
            <option value="read">Can view</option>
            <option value="write">Can edit</option>
          </select>
          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Invite"}
          </button>
        </form>

        {error && <p className="auth-error" style={{ margin: "0.5rem 0" }}>{error}</p>}
        {copiedId && <p style={{ color: "var(--color-accent)", fontSize: "0.85rem", margin: "0.5rem 0" }}>Invite link copied to clipboard</p>}

        {shares.length > 0 && (
          <div className="share-panel-list">
            {shares.map((share) => (
              <div key={share.id} className="share-panel-item">
                <div className="share-panel-item-info">
                  <span className="share-panel-item-email">
                    {share.user_name || share.shared_with_email}
                  </span>
                  <span className={`badge ${share.role === "write" ? "badge-medium-high" : "badge-medium"}`}>
                    {share.role}
                  </span>
                  {!share.accepted_at && (
                    <span className="badge badge-low">pending</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(share.id)}
                  className="share-panel-remove"
                  title="Remove access"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
