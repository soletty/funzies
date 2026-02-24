"use client";

import { marked } from "marked";
import type { InvestmentMemo } from "@/lib/ic/types";

interface MemoViewerProps {
  memo: InvestmentMemo;
}

export default function MemoViewer({ memo }: MemoViewerProps) {
  if (memo.sections?.length > 0) {
    return (
      <div className="ic-memo">
        <h1 className="ic-memo-title">{memo.title}</h1>
        {memo.sections.map((section, i) => (
          <div key={i} className="ic-memo-section">
            <h2>{section.heading}</h2>
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{
                __html: marked.parse(section.content, { async: false }) as string,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (memo.raw) {
    return (
      <div className="ic-memo">
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{
            __html: marked.parse(memo.raw, { async: false }) as string,
          }}
        />
      </div>
    );
  }

  return <p style={{ color: "var(--color-text-muted)" }}>No memo available.</p>;
}
