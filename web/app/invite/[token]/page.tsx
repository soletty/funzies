"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthForm from "@/components/AuthForm";

interface InviteInfo {
  role: string;
  topic: string;
  ownerName: string | null;
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
    if (status !== "authenticated" || !invite) return;

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
  }, [status, invite, token, router]);

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-split">
          <div className="invite-left">
            <div className="invite-brand">
              <div className="invite-brand-icon">M</div>
              <span>Million Minds</span>
            </div>
            <div className="invite-left-center">
              <div className="invite-error-icon">!</div>
              <p className="invite-error-text">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="invite-page">
        <div className="invite-split">
          <div className="invite-left">
            <div className="invite-brand">
              <div className="invite-brand-icon">M</div>
              <span>Million Minds</span>
            </div>
            <div className="invite-left-center">
              <p className="invite-loading">Loading invite...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="invite-page">
        <div className="invite-split">
          <div className="invite-left">
            <div className="invite-brand">
              <div className="invite-brand-icon">M</div>
              <span>Million Minds</span>
            </div>
            <div className="invite-left-center">
              <div className="invite-accepting-spinner" />
              <p className="invite-loading">Joining panel...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const roleName = invite.role === "write" ? "collaborate on" : "view";

  return (
    <div className="invite-page">
      <div className="invite-split">
        <div className="invite-left">
          <div className="invite-brand">
            <div className="invite-brand-icon">M</div>
            <span>Million Minds</span>
          </div>

          <div className="invite-left-content">
            <div className="invite-hero">
              <div className="invite-avatar">
                {(invite.ownerName || "?")[0].toUpperCase()}
              </div>
              <h1>
                <strong>{invite.ownerName || "Someone"}</strong> invited you to {roleName} a panel
              </h1>
            </div>

            <div className="invite-topic">
              <div className="invite-topic-label">Panel topic</div>
              <div className="invite-topic-text">{invite.topic}</div>
            </div>

            <div className="invite-role-pill">
              {invite.role === "write" ? "Editor access" : "View-only access"}
            </div>
          </div>
        </div>

        {status === "unauthenticated" && (
          <div className="invite-right">
            <div className="invite-right-inner">
              <h2 className="invite-right-heading">Sign in to accept</h2>
              <p className="invite-auth-hint">
                Sign in or create an account to continue
              </p>
              <AuthForm />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
