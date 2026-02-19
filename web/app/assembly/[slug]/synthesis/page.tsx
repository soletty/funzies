"use client";

import Link from "next/link";
import { marked } from "marked";
import { useAssembly, useAssemblyId } from "@/lib/assembly-context";
import FollowUpModal from "@/components/FollowUpModal";
import HighlightChat from "@/components/HighlightChat";
import PersistedFollowUps from "@/components/PersistedFollowUps";

function isSocrate(name: string): boolean {
  return name.toLowerCase().includes("socrate");
}

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function cleanTitle(title: string): string {
  return title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, "");
}

function confidenceBadgeClass(confidence: string): string {
  return `badge badge-${confidence}`;
}

function formatStructure(s: string): string {
  const names: Record<string, string> = {
    "grande-table": "Town Hall",
    "rapid-fire": "Crossfire",
    "deep-dive": "Deep Dive",
  };
  return (
    names[s] ??
    s
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export default function SynthesisPage() {
  const topic = useAssembly();
  const assemblyId = useAssemblyId();
  const base = `/assembly/${topic.slug}`;
  const synth = topic.synthesis;
  const title = cleanTitle(topic.title);
  const characters = topic.characters.filter((c) => !isSocrate(c.name));

  const meta = [
    characters.length > 0
      ? `${characters.length} characters`
      : null,
    topic.iterations.length > 0
      ? `${topic.iterations.length} debate iterations`
      : null,
    topic.deliverables.length > 0
      ? `${topic.deliverables.length} deliverable${topic.deliverables.length > 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  if (!synth) return <p>No synthesis available.</p>;

  const emergentInsight = synth.emergentIdeas?.[0]?.replace(/^-\s*/, "") ?? null;

  const topConvergence = [...synth.convergence]
    .sort((a, b) => {
      const order: Record<string, number> = {
        high: 0,
        "medium-high": 1,
        medium: 2,
        low: 3,
        unknown: 4,
      };
      return (order[a.confidence] ?? 5) - (order[b.confidence] ?? 5);
    })
    .slice(0, 4);

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="current">{truncate(title, 40)}</span>
        <a
          href={`/api/assemblies/${assemblyId}/export`}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.4rem 0.8rem",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text-secondary)",
            fontSize: "0.85rem",
            textDecoration: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Export HTML
        </a>
      </div>

      <h1>{synth.title}</h1>
      <p className="page-subtitle">{meta}</p>

      {emergentInsight && (
        <div className="emergent-insight">
          <span className="emergent-insight-label">Surprising Insight</span>
          <div
            className="emergent-insight-text"
            dangerouslySetInnerHTML={{ __html: md(emergentInsight) }}
          />
        </div>
      )}

      {topConvergence.length > 0 && (
        <div className="hero-card">
          <h3>Key Conclusions</h3>
          {topConvergence.map((p, i) => (
            <div key={i} className="point-card convergence">
              <div className="point-claim">
                {p.claim}{" "}
                <span className={confidenceBadgeClass(p.confidence)}>
                  {p.confidence}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="action-group">
        {characters.length > 0 && (
          <Link href={`${base}/characters`} className="action-pill">
            <span className="pill-icon">&#9823;</span> {characters.length}{" "}
            Characters
          </Link>
        )}
        {topic.iterations.map((iter) => (
          <Link
            key={iter.number}
            href={`${base}/iteration/${iter.number}`}
            className="action-pill"
          >
            <span className="pill-number">{iter.number}</span>{" "}
            {formatStructure(iter.structure)}
          </Link>
        ))}
        {topic.deliverables.length > 0 && (
          <Link href={`${base}/deliverables`} className="action-pill">
            <span className="pill-icon">&#9998;</span> Deliverables
          </Link>
        )}
        {topic.referenceLibrary && (
          <Link href={`${base}/references`} className="action-pill">
            <span className="pill-icon">&#9783;</span> Babylon&apos;s Library
          </Link>
        )}
        {topic.verification.length > 0 && (
          <Link href={`${base}/verification`} className="action-pill">
            <span className="pill-icon">&#10003;</span> Verification
          </Link>
        )}
        {topic.followUps.length > 0 && (
          <Link href={`${base}/trajectory`} className="action-pill">
            <span className="pill-icon">&#8634;</span> Thinking Trail
          </Link>
        )}
      </div>

      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: md(synth.raw) }}
      />

      <PersistedFollowUps followUps={topic.followUps} context="synthesis" characters={topic.characters} />

      <FollowUpModal
        assemblyId={assemblyId}
        characters={characters.map((c) => c.name)}
        currentPage="synthesis"
        pageType="synthesis"
      />
      <HighlightChat
        assemblyId={assemblyId}
        characters={characters.map((c) => c.name)}
        currentPage="synthesis"
        defaultMode="ask-assembly"
      />
    </>
  );
}
