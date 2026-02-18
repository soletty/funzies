"use client";

import Link from "next/link";
import { useAssembly } from "@/lib/assembly-context";

function cleanTitle(title: string): string {
  return title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, "");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function confidenceBadgeClass(confidence: string): string {
  return `badge badge-${confidence}`;
}

export default function AssemblyOverview() {
  const topic = useAssembly();
  const base = `/assembly/${topic.slug}`;
  const title = cleanTitle(topic.title);

  const meta = [
    topic.characters.length > 0
      ? `${topic.characters.length} characters`
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

  const emergentInsight =
    topic.synthesis?.emergentIdeas?.[0]?.replace(/^-\s*/, "") ?? null;

  const topConvergence = topic.synthesis
    ? [...topic.synthesis.convergence]
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
        .slice(0, 4)
    : [];

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="current">{truncate(title, 40)}</span>
      </div>

      <h1>{title}</h1>
      <p className="page-subtitle">{meta}</p>

      {emergentInsight && (
        <div className="emergent-insight">
          <span className="emergent-insight-label">Surprising Insight</span>
          <div className="emergent-insight-text">{emergentInsight}</div>
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
          <div className="hero-link">
            <Link href={`${base}/synthesis`}>Read full synthesis &rarr;</Link>
          </div>
        </div>
      )}

      <div className="action-group">
        {topic.synthesis && (
          <Link href={`${base}/synthesis`} className="action-pill action-pill-primary">
            <span className="pill-icon">&#9733;</span> Full Synthesis
          </Link>
        )}
        {topic.characters.length > 0 && (
          <Link href={`${base}/characters`} className="action-pill">
            <span className="pill-icon">&#9823;</span> {topic.characters.length}{" "}
            Characters
          </Link>
        )}
      </div>

      {topic.iterations.length > 0 && (
        <>
          <div className="section-header">
            <h2>Debate Iterations</h2>
            <span className="section-count">{topic.iterations.length}</span>
          </div>
          <div className="action-group">
            {topic.iterations.map((iter) => (
              <Link
                key={iter.number}
                href={`${base}/iteration/${iter.number}`}
                className="action-pill"
              >
                <span className="pill-number">{iter.number}</span>{" "}
                {iter.structure
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </Link>
            ))}
          </div>
        </>
      )}

      {topic.deliverables.length > 0 && (
        <>
          <div className="section-header">
            <h2>Deliverables</h2>
            <span className="section-count">{topic.deliverables.length}</span>
          </div>
          <div className="action-group">
            {topic.deliverables.map((d) => (
              <Link
                key={d.slug}
                href={`${base}/deliverables#${d.slug}`}
                className="action-pill"
              >
                <span className="pill-icon">&#9998;</span>{" "}
                {truncate(d.title, 50)}
              </Link>
            ))}
          </div>
        </>
      )}

      {topic.verification.length > 0 && (
        <>
          <div className="section-header">
            <h2>Verification</h2>
            <span className="section-count">{topic.verification.length}</span>
          </div>
          <div className="action-group">
            {topic.verification.map((v) => (
              <Link
                key={v.type}
                href={`${base}/verification#${v.type}`}
                className="action-pill"
              >
                <span className="pill-icon">&#10003;</span>{" "}
                {truncate(v.title, 50)}
              </Link>
            ))}
          </div>
        </>
      )}

      {topic.referenceLibrary && (
        <>
          <div className="section-header">
            <h2>Babylon&#39;s Library</h2>
          </div>
          <div className="action-group">
            <Link href={`${base}/references`} className="action-pill">
              <span className="pill-icon">&#9783;</span> Intellectual Traditions
              &amp; Evidence
            </Link>
          </div>
        </>
      )}

      {topic.followUps.length > 0 && (
        <>
          <div className="section-header">
            <h2>Thinking Trail</h2>
            <span className="section-count">
              {topic.followUps.length} follow-ups
            </span>
          </div>
          <div className="action-group">
            <Link href={`${base}/trajectory`} className="action-pill">
              <span className="pill-icon">&#8634;</span> View Deliberation
              History
            </Link>
          </div>
        </>
      )}
    </>
  );
}
