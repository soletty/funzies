"use client";

import { marked } from "marked";
import type { ICDebateRound, CommitteeMember } from "@/lib/ic/types";

interface DebateViewerProps {
  rounds: ICDebateRound[];
  members: CommitteeMember[];
}

export default function DebateViewer({ rounds, members }: DebateViewerProps) {
  const avatarMap = new Map(members.map((m) => [m.name, m.avatarUrl]));

  if (!rounds?.length) {
    return <p style={{ color: "var(--color-text-muted)" }}>No debate recorded.</p>;
  }

  return (
    <div className="ic-debate">
      {rounds.map((round) => (
        <div key={round.round} className="ic-debate-round">
          <h3 className="ic-debate-round-title">Round {round.round}</h3>
          {round.exchanges.map((exchange, i) => {
            const avatar = avatarMap.get(exchange.speaker);
            return (
              <div key={i} className="ic-debate-exchange">
                <div className="ic-debate-speaker">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={exchange.speaker}
                      className="ic-debate-speaker-avatar"
                    />
                  ) : (
                    <span className="ic-debate-speaker-dot" />
                  )}
                  <strong>{exchange.speaker}</strong>
                </div>
                <div
                  className="markdown-content"
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(exchange.content, { async: false }) as string,
                  }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
