import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser } from "@/lib/ic/access";
import Link from "next/link";

export default async function ICLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);

  return (
    <div className="ic-layout">
      <aside className="ic-sidebar">
        <div className="ic-sidebar-header">
          <Link href="/" className="ic-sidebar-logo">
            Million Minds
          </Link>
          <span className="ic-sidebar-badge">IC</span>
        </div>

        <nav className="ic-sidebar-nav">
          <Link href="/ic" className="ic-nav-link">
            <span className="ic-nav-icon">&#9670;</span>
            Dashboard
          </Link>
          {profile && (
            <>
              <Link href="/ic/committee" className="ic-nav-link">
                <span className="ic-nav-icon">&#9670;</span>
                Committee
              </Link>
              <Link href="/ic/evaluate/new" className="ic-nav-link">
                <span className="ic-nav-icon">&#9670;</span>
                New Evaluation
              </Link>
              <Link href="/ic/ideas" className="ic-nav-link">
                <span className="ic-nav-icon">&#9670;</span>
                Ideas
              </Link>
            </>
          )}
        </nav>

        <div className="ic-sidebar-footer">
          <Link href="/" className="ic-nav-link ic-nav-link-muted">
            &larr; Back to Panels
          </Link>
        </div>
      </aside>

      <main className="ic-main">{children}</main>
    </div>
  );
}
