"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "badge badge-medium" },
  running: { label: "Running", className: "badge badge-medium-high" },
  complete: { label: "Complete", className: "badge badge-high" },
  error: { label: "Error", className: "badge badge-low" },
  cancelled: { label: "Cancelled", className: "badge badge-low" },
};

interface Props {
  assembly: {
    id: string;
    slug: string;
    topic_input: string;
    status: string;
    current_phase: string | null;
    created_at: string;
  };
}

export function AssemblyCard({ assembly }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const status = STATUS_STYLES[assembly.status] ?? STATUS_STYLES.queued;
  const date = new Date(assembly.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const href =
    assembly.status === "running" || assembly.status === "queued"
      ? `/assembly/${assembly.slug}/generating?id=${assembly.id}`
      : `/assembly/${assembly.slug}`;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    await fetch(`/api/assemblies/${assembly.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Link href={href} className="assembly-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <h3>
            {assembly.topic_input.length > 80
              ? assembly.topic_input.slice(0, 80) + "..."
              : assembly.topic_input}
          </h3>
          <p className="assembly-card-meta">
            {date}
            {assembly.current_phase && assembly.status === "running" && (
              <> &middot; {assembly.current_phase}</>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className={status.className}>{status.label}</span>
          <button
            onClick={handleDelete}
            className="assembly-delete-btn"
            title="Remove assembly"
            disabled={deleting}
          >
            &times;
          </button>
        </div>
      </div>
    </Link>
  );
}
