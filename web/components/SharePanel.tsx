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

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

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
          <div>
            <h2>Share this panel</h2>
            <p className="share-panel-subtitle">Invite others to view or collaborate</p>
          </div>
          <button onClick={onClose} className="share-panel-close">&times;</button>
        </div>

        <form onSubmit={handleInvite} className="share-panel-form">
          <div className="share-panel-input-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as "read" | "write")}>
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
            </select>
          </div>
          <button type="submit" className="share-panel-invite-btn" disabled={loading}>
            {loading ? "Sending..." : "Send invite"}
          </button>
        </form>

        {error && <p className="share-panel-error">{error}</p>}
        {copiedId && (
          <div className="share-panel-copied">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13.25 4.75L6 12 2.75 8.75" />
            </svg>
            Invite link copied to clipboard
          </div>
        )}

        {shares.length > 0 && (
          <div className="share-panel-list">
            <div className="share-panel-list-header">People with access</div>
            {shares.map((share) => (
              <div key={share.id} className="share-panel-item">
                <div className="share-panel-item-left">
                  <div className="share-panel-avatar">
                    {(share.user_name || share.shared_with_email)[0].toUpperCase()}
                  </div>
                  <div className="share-panel-item-details">
                    <span className="share-panel-item-name">
                      {share.user_name || share.shared_with_email}
                    </span>
                    {share.user_name && (
                      <span className="share-panel-item-email">{share.shared_with_email}</span>
                    )}
                  </div>
                </div>
                <div className="share-panel-item-right">
                  {!share.accepted_at && (
                    <span className="share-panel-badge-pending">Pending</span>
                  )}
                  <span className="share-panel-badge-role">{share.role === "write" ? "Editor" : "Viewer"}</span>
                  <button
                    onClick={() => handleRemove(share.id)}
                    className="share-panel-remove"
                    title="Remove access"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
