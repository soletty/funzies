"use client";

import Link from "next/link";
import { marked } from "marked";
import { useAssembly } from "@/lib/assembly-context";
import type { DivergencePoint } from "@/lib/types";

const AVATAR_COLORS = [
  "#0969da", "#8250df", "#bf3989", "#0e8a16", "#e16f24",
  "#cf222e", "#1a7f37", "#6639ba", "#953800", "#0550ae",
  "#7c3aed", "#d1242f",
];

function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Colonel|Col\.)?\s*/i, "").split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

interface CharacterStance {
  name: string;
  framework: string;
  position: string;
}

function extractStances(divergenceContent: string): CharacterStance[] {
  const stances: CharacterStance[] = [];
  const lines = divergenceContent.split("\n");
  const stanceRe = /^\s*-\s+\*{0,2}([^*(]+?)\*{0,2}\s*\(([^)]+)\):\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(stanceRe);
    if (match) {
      let position = match[3].trim();
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (
          /^\s*-\s+\S/.test(nextLine) ||
          nextLine.trim() === "" ||
          /^#{1,3}\s/.test(nextLine)
        )
          break;
        if (/^\s{4,}/.test(nextLine)) {
          position += " " + nextLine.trim();
        } else {
          break;
        }
      }
      stances.push({
        name: match[1].trim(),
        framework: match[2].trim(),
        position,
      });
    }
  }
  return stances;
}

export default function TrajectoryPage() {
  const topic = useAssembly();
  const base = `/assembly/${topic.slug}`;

  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  });

  function findCharColor(name: string): string {
    if (colorMap[name]) return colorMap[name];
    const lower = name.toLowerCase();
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (firstName === lower || fullName.toLowerCase().includes(lower))
        return colorMap[fullName];
    }
    return "var(--color-accent)";
  }

  function findCharInitials(name: string): string {
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (
        name.toLowerCase() === firstName ||
        fullName.toLowerCase().includes(name.toLowerCase())
      )
        return initials(fullName);
    }
    return name[0]?.toUpperCase() ?? "?";
  }

  // Collect all divergences
  const allDivergences: DivergencePoint[] = [];
  if (topic.synthesis) allDivergences.push(...topic.synthesis.divergence);
  for (const iter of topic.iterations) {
    if (iter.synthesis) allDivergences.push(...iter.synthesis.divergence);
  }

  const seenIssues = new Set<string>();
  const uniqueDivergences: DivergencePoint[] = [];
  for (const dp of allDivergences) {
    if (!seenIssues.has(dp.issue)) {
      seenIssues.add(dp.issue);
      uniqueDivergences.push(dp);
    }
  }

  // Recurring tensions
  const clashCounts = new Map<string, number>();
  for (const fu of topic.followUps) {
    if (fu.responses.length >= 2) {
      const speakers = fu.responses.map((r) => r.speaker).sort();
      for (let i = 0; i < speakers.length; i++) {
        for (let j = i + 1; j < speakers.length; j++) {
          const key = `${speakers[i]}|${speakers[j]}`;
          clashCounts.set(key, (clashCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const tensions = [...clashCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const truncatedTitle =
    topic.title.length > 30
      ? topic.title.slice(0, 29) + "\u2026"
      : topic.title;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href={base}>{truncatedTitle}</Link>
        <span className="separator">/</span>
        <span className="current">Thinking Trail</span>
      </div>

      <h1>Thinking Trail</h1>
      <p className="page-subtitle">
        How the assembly&apos;s positions have evolved &mdash;{" "}
        {uniqueDivergences.length} divergence
        {uniqueDivergences.length !== 1 ? "s" : ""},{" "}
        {topic.followUps.length} follow-up
        {topic.followUps.length !== 1 ? "s" : ""}
      </p>

      {uniqueDivergences.length > 0 && (
        <div className="trajectory-divergence-map">
          <h2 className="trajectory-section-heading">Divergence Map</h2>
          <p className="trajectory-section-subtitle">
            Key issues where the assembly remains divided
          </p>

          {uniqueDivergences.map((dp, di) => {
            const stances = extractStances(dp.content);

            if (stances.length === 0) {
              return (
                <div key={di} className="divergence-issue">
                  <h3 className="divergence-issue-title">{dp.issue}</h3>
                  <div
                    className="divergence-prose"
                    dangerouslySetInnerHTML={{ __html: md(dp.content) }}
                  />
                </div>
              );
            }

            return (
              <div key={di} className="divergence-issue">
                <h3 className="divergence-issue-title">{dp.issue}</h3>
                <div className="divergence-stances">
                  {stances.map((s, si) => (
                    <div key={si} className="divergence-stance">
                      <div className="divergence-stance-speaker">
                        <span
                          className="trajectory-avatar-sm"
                          style={{ background: findCharColor(s.name) }}
                        >
                          {findCharInitials(s.name)}
                        </span>
                        <span className="divergence-stance-name">
                          {s.name}
                        </span>
                        <span className="badge badge-tag">{s.framework}</span>
                      </div>
                      <div className="divergence-stance-position">
                        {s.position}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tensions.length > 0 && (
        <div className="trajectory-tensions">
          <h3>Recurring Tensions</h3>
          {tensions.map(([pair, count]) => {
            const [a, b] = pair.split("|");
            return (
              <div key={pair} className="tension-pair">
                <span
                  className="trajectory-avatar-sm"
                  style={{
                    background: colorMap[a] ?? "var(--color-accent)",
                  }}
                >
                  {initials(a)}
                </span>
                <span className="tension-vs">vs</span>
                <span
                  className="trajectory-avatar-sm"
                  style={{
                    background: colorMap[b] ?? "var(--color-accent)",
                  }}
                >
                  {initials(b)}
                </span>
                <span className="tension-names">
                  {a} &amp; {b}
                </span>
                <span className="badge badge-tag">{count} exchanges</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
