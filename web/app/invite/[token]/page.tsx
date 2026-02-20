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
          <p className="auth-error">{error}</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <p>Loading invite...</p>
        </div>
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <p>Accepting invite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <h1>You&#39;ve been invited</h1>
        <p>
          <strong>{invite.inviterName || "Someone"}</strong> invited you to{" "}
          {invite.role === "write" ? "collaborate on" : "view"} their panel:
        </p>
        <p className="invite-topic">{invite.topic}</p>

        {status === "unauthenticated" && (
          <>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              Sign in with <strong>{invite.email}</strong> to accept this invite.
            </p>
            <AuthForm />
          </>
        )}
      </div>
    </div>
  );
}
