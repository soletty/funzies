"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Topic } from "@/lib/types";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function cleanTitle(title: string): string {
  return title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, "");
}

function formatStructure(structure: string): string {
  return structure
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AssemblyNav({ topic, slug }: { topic: Topic; slug: string }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const base = `/assembly/${slug}`;
  const shortTitle = truncate(cleanTitle(topic.title), 30);

  const isActive = useCallback(
    (path: string) => pathname === path,
    [pathname]
  );

  const closeNav = () => setNavOpen(false);

  return (
    <>
      <button
        className="nav-hamburger"
        aria-label="Open menu"
        onClick={() => setNavOpen(!navOpen)}
      >
        &#9776;
      </button>
      {navOpen && (
        <div className="nav-overlay" onClick={closeNav} style={{ display: "block", opacity: 1, pointerEvents: "auto" }} />
      )}
      <nav className={navOpen ? "nav-open-mobile" : ""}>
        <div className="nav-brand">
          <div className="nav-brand-icon">A</div>
          Assembly
        </div>

        <Link href="/" onClick={closeNav}>
          <span className="nav-icon">&#9776;</span> Home
        </Link>

        <div className="nav-divider" />
        <div className="nav-section">
          <Link href={base} className="nav-section-title" onClick={closeNav}>
            {shortTitle}
          </Link>

          <Link
            href={base}
            className={isActive(base) ? "active" : ""}
            onClick={closeNav}
          >
            <span className="nav-icon">&#9673;</span> Overview
          </Link>

          {topic.synthesis && (
            <Link
              href={`${base}/synthesis`}
              className={isActive(`${base}/synthesis`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#9733;</span> Consensus
            </Link>
          )}

          {topic.characters.length > 0 && (
            <Link
              href={`${base}/characters`}
              className={isActive(`${base}/characters`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#9823;</span> The Assembly
            </Link>
          )}

          {topic.iterations.map((iter) => (
            <Link
              key={iter.number}
              href={`${base}/iteration/${iter.number}`}
              className={
                isActive(`${base}/iteration/${iter.number}`) ? "active" : ""
              }
              onClick={closeNav}
            >
              <span className="nav-icon">&#9656;</span>{" "}
              {formatStructure(iter.structure)}
            </Link>
          ))}

          {topic.deliverables.length > 0 && (
            <Link
              href={`${base}/deliverables`}
              className={isActive(`${base}/deliverables`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#9998;</span> Deliverables
            </Link>
          )}

          {topic.verification.length > 0 && (
            <Link
              href={`${base}/verification`}
              className={isActive(`${base}/verification`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#10003;</span> Verification
            </Link>
          )}

          {topic.referenceLibrary && (
            <Link
              href={`${base}/references`}
              className={isActive(`${base}/references`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#9783;</span> Babylon&#39;s Library
            </Link>
          )}

          {topic.followUps.length > 0 && (
            <Link
              href={`${base}/trajectory`}
              className={isActive(`${base}/trajectory`) ? "active" : ""}
              onClick={closeNav}
            >
              <span className="nav-icon">&#8634;</span> Thinking Trail
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
