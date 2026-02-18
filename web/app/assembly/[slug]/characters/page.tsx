"use client";

import Link from "next/link";
import { useAssembly } from "@/lib/assembly-context";

const AVATAR_COLORS = [
  "#0969da", "#8250df", "#bf3989", "#0e8a16", "#e16f24",
  "#cf222e", "#1a7f37", "#6639ba", "#953800", "#0550ae",
  "#7c3aed", "#d1242f",
];

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Colonel|Col\.)?\s*/i, "").split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CharactersPage() {
  const topic = useAssembly();
  const base = `/assembly/${topic.slug}`;

  if (topic.characters.length === 0) return <p>No characters available.</p>;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href={base}>
          {topic.title.length > 40 ? topic.title.slice(0, 40) + "\u2026" : topic.title}
        </Link>
        <span className="separator">/</span>
        <span className="current">The Assembly</span>
      </div>

      <h1>The Assembly</h1>
      <p className="page-subtitle">
        {topic.characters.length} participants in the assembly debate
      </p>

      <div className="card-grid">
        {topic.characters.map((char, i) => (
          <Link
            key={char.number}
            href={`${base}/characters/${char.number}`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="card-header">
              <div
                className="card-avatar"
                style={{ background: avatarColor(i) }}
              >
                {initials(char.name)}
              </div>
              <div>
                <div className="card-title">{char.name}</div>
                {char.tag && (
                  <span className="badge badge-tag">{char.tag}</span>
                )}
              </div>
            </div>
            {char.frameworkName && (
              <div className="card-body">{char.frameworkName}</div>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
