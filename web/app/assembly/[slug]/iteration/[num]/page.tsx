"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import { useAssembly } from "@/lib/assembly-context";
import type { DebateExchange } from "@/lib/types";

const STRUCTURE_DISPLAY_NAMES: Record<string, string> = {
  "grande-table": "Town Hall",
  "rapid-fire": "Crossfire",
  "deep-dive": "Deep Dive",
};

function formatStructure(s: string): string {
  return (
    STRUCTURE_DISPLAY_NAMES[s] ??
    s
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

function Exchange({
  ex,
  isSocrate,
  isReaction,
}: {
  ex: DebateExchange;
  isSocrate: boolean;
  isReaction: boolean;
}) {
  const cls = isSocrate
    ? "debate-exchange debate-socrate"
    : isReaction
      ? "debate-exchange debate-reaction"
      : "debate-exchange";

  const dotColor = isSocrate ? "var(--color-socrate)" : "var(--color-accent)";

  return (
    <div className={cls}>
      <div className="debate-speaker">
        <span
          className="debate-speaker-dot"
          style={{ background: dotColor }}
        />
        {ex.speaker}
      </div>
      <div
        className="debate-content"
        dangerouslySetInnerHTML={{ __html: md(ex.content) }}
      />
    </div>
  );
}

export default function IterationPage() {
  const topic = useAssembly();
  const params = useParams<{ slug: string; num: string }>();
  const num = Number(params.num);
  const base = `/assembly/${topic.slug}`;

  const iteration = topic.iterations.find((i) => i.number === num);
  if (!iteration) {
    return <p>Iteration not found.</p>;
  }

  const iterIndex = topic.iterations.findIndex((i) => i.number === num);
  const prev = topic.iterations[iterIndex - 1] ?? null;
  const next = topic.iterations[iterIndex + 1] ?? null;

  const showTranscript =
    iteration.rounds.length > 0 &&
    iteration.transcriptRaw !== iteration.synthesis?.raw;

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
        <span className="current">
          Iteration {iteration.number}: {formatStructure(iteration.structure)}
        </span>
      </div>

      <h1>{formatStructure(iteration.structure)}</h1>
      <p className="page-subtitle">Debate round {iteration.number}</p>

      {iteration.synthesis && (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: md(iteration.synthesis.raw) }}
        />
      )}

      {showTranscript && (
        <>
          <div className="section-header">
            <h2>Debate Transcript</h2>
            <span className="section-count">
              {iteration.rounds.length} rounds
            </span>
          </div>

          {iteration.rounds.map((round, ri) => (
            <details key={ri}>
              <summary>{round.title}</summary>
              <div className="details-content">
                {round.exchanges.map((ex, ei) => (
                  <Exchange
                    key={`ex-${ei}`}
                    ex={ex}
                    isSocrate={false}
                    isReaction={false}
                  />
                ))}
                {round.socrate.length > 0 && (
                  <>
                    <h3>Socrate Intervenes</h3>
                    {round.socrate.map((ex, si) => (
                      <Exchange
                        key={`soc-${si}`}
                        ex={ex}
                        isSocrate={true}
                        isReaction={false}
                      />
                    ))}
                  </>
                )}
                {round.assemblyReactions.length > 0 && (
                  <>
                    <h3>Assembly Reactions</h3>
                    {round.assemblyReactions.map((ex, ai) => (
                      <Exchange
                        key={`react-${ai}`}
                        ex={ex}
                        isSocrate={false}
                        isReaction={true}
                      />
                    ))}
                  </>
                )}
              </div>
            </details>
          ))}
        </>
      )}

      <hr />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.85rem",
        }}
      >
        {prev ? (
          <Link href={`${base}/iteration/${prev.number}`}>
            &larr; Iteration {prev.number}: {formatStructure(prev.structure)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`${base}/iteration/${next.number}`}>
            Iteration {next.number}: {formatStructure(next.structure)} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}
