"use client";

import Link from "next/link";
import { marked } from "marked";
import { useAssembly } from "@/lib/assembly-context";

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
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
  const base = `/assembly/${topic.slug}`;
  const synth = topic.synthesis;

  if (!synth) return <p>No synthesis available.</p>;

  const emergentInsight = synth.emergentIdeas?.[0]?.replace(/^-\s*/, "") ?? null;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href={base}>{topic.title.length > 40 ? topic.title.slice(0, 40) + "\u2026" : topic.title}</Link>
        <span className="separator">/</span>
        <span className="current">Consensus</span>
      </div>

      <h1>{synth.title}</h1>
      <p className="page-subtitle">
        Where the assembly found common ground &mdash; and where they didn&apos;t
      </p>

      {emergentInsight && (
        <div className="emergent-insight">
          <span className="emergent-insight-label">Surprising Insight</span>
          <div
            className="emergent-insight-text"
            dangerouslySetInnerHTML={{ __html: md(emergentInsight) }}
          />
        </div>
      )}

      <div className="action-group">
        {topic.characters.length > 0 && (
          <Link href={`${base}/characters`} className="action-pill">
            <span className="pill-icon">&#9823;</span> {topic.characters.length} Characters
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
      </div>

      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: md(synth.raw) }}
      />
    </>
  );
}
