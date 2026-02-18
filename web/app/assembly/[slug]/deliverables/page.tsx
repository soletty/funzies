"use client";

import Link from "next/link";
import { marked } from "marked";
import { useAssembly } from "@/lib/assembly-context";

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export default function DeliverablesPage() {
  const topic = useAssembly();
  const base = `/assembly/${topic.slug}`;

  if (topic.deliverables.length === 0) {
    return <p>No deliverables available.</p>;
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href={base}>
          {topic.title.length > 30
            ? topic.title.slice(0, 29) + "\u2026"
            : topic.title}
        </Link>
        <span className="separator">/</span>
        <span className="current">Deliverables</span>
      </div>

      <h1>Deliverables</h1>
      <p className="page-subtitle">
        {topic.deliverables.length} output document
        {topic.deliverables.length > 1 ? "s" : ""}
      </p>

      {topic.deliverables.map((d) => (
        <div key={d.slug} id={d.slug}>
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: md(d.content) }}
          />
          <hr />
        </div>
      ))}
    </>
  );
}
