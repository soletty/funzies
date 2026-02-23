"use client";

import { useState, useEffect, useCallback } from "react";

function copyToClipboard(text: string): boolean {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
}

interface ShareUser {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  role: string;
  joined_at: string;
}

interface ShareInfo {
  shareCode: string | null;
  shareRole: string | null;
  users: ShareUser[];
}

interface SharePanelProps {
  assemblyId: string;
  onClose: () => void;
}

export default function SharePanel({ assemblyId, onClose }: SharePanelProps) {
  const [shareInfo, setShareInfo] = useState<ShareInfo>({ shareCode: null, shareRole: null, users: [] });
  const [role, setRole] = useState<"read" | "write">("read");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const fetchShareInfo = useCallback(async () => {
    const res = await fetch(`/api/assemblies/${assemblyId}/shares`);
    if (res.ok) {
      const data = await res.json();
      setShareInfo(data);
      if (data.shareRole) {
        setRole(data.shareRole);
      }
    }
  }, [assemblyId]);

  useEffect(() => {
    fetchShareInfo();
  }, [fetchShareInfo]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const sharingEnabled = !!shareInfo.shareCode;

  async function handleEnableSharing() {
    setLoading(true);
    setError("");

    const res = await fetch(`/api/assemblies/${assemblyId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to enable sharing");
      setLoading(false);
      return;
    }

    await fetchShareInfo();
    setLoading(false);
  }

  async function handleDisableSharing() {
    setLoading(true);
    setError("");

    const res = await fetch(`/api/assemblies/${assemblyId}/shares/disable`, {
      method: "POST",
    });

    if (!res.ok) {
      setError("Failed to disable sharing");
      setLoading(false);
      return;
    }

    setShareInfo({ shareCode: null, shareRole: null, users: shareInfo.users });
    setLoading(false);
  }

  async function handleRoleChange(newRole: "read" | "write") {
    setRole(newRole);
    if (!sharingEnabled) return;

    const res = await fetch(`/api/assemblies/${assemblyId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (res.ok) {
      await fetchShareInfo();
    }
  }

  async function handleRemove(shareId: string) {
    await fetch(`/api/assemblies/${assemblyId}/shares/${shareId}`, { method: "DELETE" });
    setShareInfo((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== shareId),
    }));
  }

  function handleCopyLink() {
    if (!shareInfo.shareCode) return;
    const url = `${window.location.origin}/invite/${shareInfo.shareCode}`;
    if (copyToClipboard(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  return (
    <div className="share-panel-overlay" onClick={onClose}>
      <div className="share-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-panel-header">
          <div>
            <h2>Share this panel</h2>
            <p className="share-panel-subtitle">Anyone with the link can join</p>
          </div>
          <button onClick={onClose} className="share-panel-close">&times;</button>
        </div>

        <div className="share-panel-toggle-row">
          <div className="share-panel-toggle-label">
            <span className="share-panel-toggle-title">Share via link</span>
            <span className="share-panel-toggle-desc">
              {sharingEnabled ? "Anyone with the link can access this panel" : "Generate a link to share this panel"}
            </span>
          </div>
          <button
            className={`share-panel-toggle ${sharingEnabled ? "active" : ""}`}
            onClick={sharingEnabled ? handleDisableSharing : handleEnableSharing}
            disabled={loading}
          >
            <span className="share-panel-toggle-knob" />
          </button>
        </div>

        {sharingEnabled && (
          <>
            <div className="share-panel-link-section">
              <div className="share-panel-input-row">
                <select value={role} onChange={(e) => handleRoleChange(e.target.value as "read" | "write")}>
                  <option value="read">Can view</option>
                  <option value="write">Can edit</option>
                </select>
              </div>

              <div className="share-panel-url-box">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${shareInfo.shareCode}`}
                  onFocus={(e) => e.target.select()}
                  className="share-panel-url-input"
                />
                <button
                  type="button"
                  className="share-panel-url-copy"
                  onClick={handleCopyLink}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="share-panel-error">{error}</p>}

        {shareInfo.users.length > 0 && (
          <div className="share-panel-list">
            <div className="share-panel-list-header">People with access</div>
            {shareInfo.users.map((u) => (
              <div key={u.id} className="share-panel-item">
                <div className="share-panel-item-left">
                  <div className="share-panel-avatar">
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="share-panel-item-details">
                    <span className="share-panel-item-name">
                      {u.name || u.email}
                    </span>
                    {u.name && (
                      <span className="share-panel-item-email">{u.email}</span>
                    )}
                  </div>
                </div>
                <div className="share-panel-item-right">
                  <span className="share-panel-badge-role">{u.role === "write" ? "Editor" : "Viewer"}</span>
                  <button
                    onClick={() => handleRemove(u.id)}
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
