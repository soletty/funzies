"use client";

import Link from "next/link";
import { marked } from "marked";
import { useAssembly } from "@/lib/assembly-context";

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

export default function ReferencesPage() {
  const topic = useAssembly();
  const base = `/assembly/${topic.slug}`;

  if (!topic.referenceLibrary) {
    return <p>No reference library available.</p>;
  }

  const parsed = topic.parsedReferenceLibrary;

  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  });

  function findCharacterColor(name: string): string {
    if (colorMap[name]) return colorMap[name];
    const lower = name.toLowerCase();
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (firstName === lower || fullName.toLowerCase().includes(lower)) {
        return colorMap[fullName];
      }
    }
    return "var(--color-accent)";
  }

  const truncatedTitle =
    topic.title.length > 30
      ? topic.title.slice(0, 29) + "\u2026"
      : topic.title;

  if (!parsed) {
    return (
      <>
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="separator">/</span>
          <Link href={base}>{truncatedTitle}</Link>
          <span className="separator">/</span>
          <span className="current">Babylon&apos;s Library</span>
        </div>

        <h1>Babylon&apos;s Library</h1>
        <p className="page-subtitle">
          Intellectual traditions and empirical evidence grounding the assembly
          debate
        </p>
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: md(topic.referenceLibrary) }}
        />
      </>
    );
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href={base}>{truncatedTitle}</Link>
        <span className="separator">/</span>
        <span className="current">Babylon&apos;s Library</span>
      </div>

      <h1>Babylon&apos;s Library</h1>
      <p className="page-subtitle">
        Intellectual traditions and empirical evidence grounding the assembly
        debate
      </p>

      {parsed.sections.map((section, si) => (
        <div key={si} className="ref-section">
          <h2>{section.title}</h2>
          <div className="ref-grid">
            {section.subsections.map((sub, subi) => (
              <div key={subi} className="ref-card">
                <div className="ref-card-header">
                  {sub.character && (
                    <span
                      className="ref-char-badge"
                      style={{
                        background: findCharacterColor(sub.character),
                      }}
                    >
                      {initials(sub.character)}
                    </span>
                  )}
                  <div>
                    <div className="ref-card-title">{sub.title}</div>
                    {sub.character && (
                      <div className="ref-card-character">
                        {sub.character}
                        {sub.tag && (
                          <>
                            {" "}
                            <span className="badge badge-tag">{sub.tag}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {sub.entries.map((entry, ei) => {
                  const parts = [
                    entry.author
                      ? `<strong>${entry.author}</strong>`
                      : "",
                    entry.work ? `<em>${entry.work}</em>` : "",
                    entry.year ? `(${entry.year})` : "",
                  ]
                    .filter(Boolean)
                    .join(" &mdash; ");

                  return (
                    <div key={ei} className="ref-entry">
                      {parts && (
                        <div
                          className="ref-entry-title"
                          dangerouslySetInnerHTML={{ __html: parts }}
                        />
                      )}
                      {entry.description && (
                        <div className="ref-entry-desc">
                          {entry.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}

      {parsed.crossReadings.length > 0 && (
        <div className="ref-section">
          <h2>Cross-Reading Assignments</h2>
          <div className="cross-reading-list">
            {parsed.crossReadings.map((cr, i) => (
              <div key={i} className="cross-reading">
                <span
                  className="trajectory-avatar-sm"
                  style={{ background: findCharacterColor(cr.character) }}
                >
                  {initials(cr.character)}
                </span>
                <div>
                  <strong>{cr.character}</strong> must engage: {cr.assignment}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
