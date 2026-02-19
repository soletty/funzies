"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AttachmentWidget, { type AttachedFile } from "@/components/AttachmentWidget";

const TYPEWRITER_PROMPTS = [
  "Design a microservices architecture for a fintech platform...",
  "I had a fight with my best friend and I need perspective...",
  "Should I raise venture capital or bootstrap my startup?",
  "Help me create a 12-week marathon training program...",
  "What's the most effective way to learn Mandarin as an adult?",
  "Evaluate the pros and cons of remote vs hybrid work...",
  "I need to negotiate my salary — coach me through it...",
  "How should I restructure my team after a round of layoffs?",
  "Compare React, Vue, and Svelte for my next project...",
  "Help me plan a gap year that actually advances my career...",
];

function useTypewriter(prompts: string[], active: boolean) {
  const [display, setDisplay] = useState("");
  const indexRef = useRef(0);
  const charRef = useRef(0);
  const phaseRef = useRef<"typing" | "pausing" | "deleting">("typing");
  const frameRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const tick = useCallback(() => {
    const prompt = prompts[indexRef.current];
    const phase = phaseRef.current;

    if (phase === "typing") {
      charRef.current++;
      setDisplay(prompt.slice(0, charRef.current));
      if (charRef.current >= prompt.length) {
        phaseRef.current = "pausing";
        frameRef.current = setTimeout(tick, 2000);
      } else {
        frameRef.current = setTimeout(tick, 35 + Math.random() * 40);
      }
    } else if (phase === "pausing") {
      phaseRef.current = "deleting";
      frameRef.current = setTimeout(tick, 30);
    } else {
      charRef.current--;
      setDisplay(prompt.slice(0, charRef.current));
      if (charRef.current <= 0) {
        indexRef.current = (indexRef.current + 1) % prompts.length;
        phaseRef.current = "typing";
        frameRef.current = setTimeout(tick, 400);
      } else {
        frameRef.current = setTimeout(tick, 18);
      }
    }
  }, [prompts]);

  useEffect(() => {
    if (!active) return;
    frameRef.current = setTimeout(tick, 600);
    return () => { if (frameRef.current) clearTimeout(frameRef.current); };
  }, [active, tick]);

  return display;
}

export default function NewAssemblyPage() {
  const [topic, setTopic] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const typewriterText = useTypewriter(TYPEWRITER_PROMPTS, topic.length === 0 && !submitting);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || submitting) return;

    setError("");
    setSubmitting(true);

    const res = await fetch("/api/assemblies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicInput: topic.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create assembly.");
      setSubmitting(false);
      return;
    }

    const { id, slug } = await res.json();

    if (files.length > 0) {
      for (const f of files) {
        const form = new FormData();
        form.append("file", f.file);
        await fetch(`/api/assemblies/${id}/upload`, { method: "POST", body: form });
      }
    }

    router.push(`/assembly/${slug}/generating?id=${id}`);
  }

  return (
    <div className="standalone-page">
      <div className="standalone-page-inner" style={{ maxWidth: "640px" }}>
        <Link href="/" className="standalone-back">
          &larr; Back to dashboard
        </Link>

        <div className="standalone-header" style={{ textAlign: "left" }}>
          <h1>Launch New Assembly</h1>
          <p style={{ margin: 0 }}>
            Describe a topic or question. Six AI characters will debate it from radically
            different perspectives.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="topic-input-card">
            <div style={{ position: "relative" }}>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder=""
                rows={5}
                disabled={submitting}
              />
              {topic.length === 0 && !submitting && (
                <div className="typewriter-overlay" aria-hidden="true">
                  <span className="typewriter-text">{typewriterText}</span>
                  <span className="typewriter-cursor" />
                </div>
              )}
            </div>

            <AttachmentWidget files={files} onChange={setFiles} disabled={submitting} />

            {error && (
              <p style={{ color: "var(--color-low)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
                {error}
              </p>
            )}

            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={submitting || !topic.trim()}
                className={`btn-primary ${submitting || !topic.trim() ? "disabled" : ""}`}
              >
                {submitting ? "Launching..." : "Launch Assembly"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
