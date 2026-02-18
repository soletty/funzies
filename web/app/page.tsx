import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";

interface AssemblyRow {
  id: string;
  slug: string;
  topic_input: string;
  status: string;
  current_phase: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "badge badge-medium" },
  running: { label: "Running", className: "badge badge-medium-high" },
  complete: { label: "Complete", className: "badge badge-high" },
  error: { label: "Error", className: "badge badge-low" },
  cancelled: { label: "Cancelled", className: "badge badge-low" },
};

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    return <LandingPage />;
  }

  const userId = session.user.id;

  const userRows = await query<{ api_key_valid: boolean | null; api_key_prefix: string | null }>(
    "SELECT api_key_valid, api_key_prefix FROM users WHERE id = $1",
    [userId]
  );

  if (!userRows[0]?.api_key_prefix) {
    redirect("/onboarding");
  }

  const assemblies = await query<AssemblyRow>(
    "SELECT id, slug, topic_input, status, current_phase, created_at, completed_at FROM assemblies WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  return (
    <div className="content-area" style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "3rem 2rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 600 }}>
            Your Assemblies
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
            Adversarial debates powered by the Intellectual Assembly
          </p>
        </div>
        <Link
          href="/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 1.2rem",
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "var(--radius)",
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: 500,
          }}
        >
          + New Assembly
        </Link>
      </header>

      {assemblies.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {assemblies.map((a) => (
            <AssemblyCard key={a.id} assembly={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "420px", width: "100%", padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Intellectual Assembly
          </h1>
          <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            Structured adversarial debates between AI characters.
            Deep analysis through the collision of incompatible frameworks.
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "4rem 2rem",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border-light)",
      }}
    >
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", marginBottom: "0.75rem" }}>
        Create your first assembly
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem", maxWidth: "400px", margin: "0 auto 1.5rem" }}>
        Enter a topic and watch 6 AI characters debate it from radically different perspectives.
      </p>
      <Link
        href="/new"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1.5rem",
          background: "var(--color-accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        + New Assembly
      </Link>
    </div>
  );
}

function AssemblyCard({ assembly }: { assembly: AssemblyRow }) {
  const status = STATUS_STYLES[assembly.status] ?? STATUS_STYLES.queued;
  const date = new Date(assembly.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const href =
    assembly.status === "running" || assembly.status === "queued"
      ? `/assembly/${assembly.slug}/generating`
      : `/assembly/${assembly.slug}`;

  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "1.25rem 1.5rem",
        background: "var(--color-surface)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--color-border-light)",
        textDecoration: "none",
        color: "inherit",
        transition: "var(--transition)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            {assembly.topic_input.length > 80
              ? assembly.topic_input.slice(0, 80) + "..."
              : assembly.topic_input}
          </h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {date}
            {assembly.current_phase && assembly.status === "running" && (
              <> &middot; {assembly.current_phase}</>
            )}
          </p>
        </div>
        <span className={status.className}>{status.label}</span>
      </div>
    </Link>
  );
}
