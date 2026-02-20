"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthForm from "@/components/AuthForm";

interface InviteInfo {
  email: string;
  role: string;
  topic: string;
  inviterName: string | null;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid invite");
        return res.json();
      })
      .then(setInvite)
      .catch(() => setError("This invite link is invalid or has expired."));
  }, [token]);

  useEffect(() => {
    if (status !== "authenticated" || !invite || !session?.user?.email) return;

    if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      setError(`This invite was sent to ${invite.email}. You are signed in as ${session.user.email}.`);
      return;
    }

    setAccepting(true);
    fetch(`/api/invites/${token}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to accept");
        return res.json();
      })
      .then((data) => {
        if (data.slug) {
          router.push(`/assembly/${data.slug}`);
        } else {
          router.push("/");
        }
      })
      .catch(() => {
        setError("Failed to accept invite.");
        setAccepting(false);
      });
  }, [status, invite, session, token, router]);

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">
            <div className="invite-brand-icon">M</div>
            <span>Million Minds</span>
          </div>
          <div className="invite-error-icon">!</div>
          <p className="invite-error-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">
            <div className="invite-brand-icon">M</div>
            <span>Million Minds</span>
          </div>
          <p className="invite-loading">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">
            <div className="invite-brand-icon">M</div>
            <span>Million Minds</span>
          </div>
          <p className="invite-loading">Joining panel...</p>
        </div>
      </div>
    );
  }

  const roleName = invite.role === "write" ? "collaborate on" : "view";

  return (
    <div className="invite-page">
      <div className="invite-card">
        <div className="invite-brand">
          <div className="invite-brand-icon">M</div>
          <span>Million Minds</span>
        </div>

        <div className="invite-hero">
          <div className="invite-avatar">
            {(invite.inviterName || "?")[0].toUpperCase()}
          </div>
          <h1>
            <strong>{invite.inviterName || "Someone"}</strong> invited you to {roleName} a panel
          </h1>
        </div>

        <div className="invite-topic">
          <div className="invite-topic-label">Panel topic</div>
          {invite.topic}
        </div>

        <div className="invite-role-pill">
          {invite.role === "write" ? "Editor access" : "View-only access"}
        </div>

        {status === "unauthenticated" && (
          <div className="invite-auth-section">
            <div className="invite-auth-divider">
              <span>Sign in to accept</span>
            </div>
            <p className="invite-auth-hint">
              Use <strong>{invite.email}</strong> to continue
            </p>
            <AuthForm />
          </div>
        )}
      </div>
    </div>
  );
}
