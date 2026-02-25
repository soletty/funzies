import { hasPulseAccess } from "@/lib/pulse/auth";
import Link from "next/link";
import { PulseAccessGate } from "./access-gate";

export default async function PulseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasAccess = await hasPulseAccess();

  if (!hasAccess) {
    return <PulseAccessGate />;
  }

  return (
    <div className="pulse-layout">
      <aside className="pulse-sidebar">
        <div className="pulse-sidebar-header">
          <Link href="/" className="pulse-sidebar-logo">
            Million Minds
          </Link>
          <span className="pulse-sidebar-badge">PULSE</span>
        </div>

        <nav className="pulse-sidebar-nav">
          <Link href="/pulse" className="pulse-nav-link">
            <span className="pulse-nav-icon">&#9670;</span>
            Dashboard
          </Link>
          <Link href="/pulse/scan" className="pulse-nav-link">
            <span className="pulse-nav-icon">&#9670;</span>
            Trigger Scan
          </Link>
        </nav>

        <div className="pulse-sidebar-footer">
          <Link href="/" className="pulse-nav-link pulse-nav-link-muted">
            &larr; Back to Panels
          </Link>
        </div>
      </aside>

      <main className="pulse-main">{children}</main>
    </div>
  );
}
