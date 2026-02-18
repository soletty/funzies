"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { marked } from "marked";

interface HighlightChatProps {
  assemblyId: string;
  currentPage: string;
  defaultCharacter?: string;
  defaultMode?: "ask-assembly" | "ask-character" | "ask-library" | "debate";
}

export default function HighlightChat({
  assemblyId,
  currentPage,
  defaultCharacter,
  defaultMode = "ask-assembly",
}: HighlightChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedText, setHighlightedText] = useState("");
  const [question, setQuestion] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseText, setResponseText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback((e: MouseEvent) => {
    if (panelRef.current?.contains(e.target as Node)) return;

    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 5) {
      const target = e.target as HTMLElement;
      if (target.closest?.(".markdown-content")) {
        setHighlightedText(sel);
        setIsOpen(true);
        setResponseText("");
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [handleSelection]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  async function handleSubmit() {
    if (!question.trim() || isStreaming) return;

    setIsStreaming(true);
    setResponseText("");

    const mode = defaultCharacter ? "ask-character" : defaultMode;

    const body = {
      question: question.trim(),
      mode,
      characters: defaultCharacter ? [defaultCharacter] : [],
      context: { page: currentPage },
      highlightedText: highlightedText || undefined,
    };

    const res = await fetch(`/api/assemblies/${assemblyId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      setResponseText("Error: Failed to get response");
      setIsStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") {
            accumulated += data.content;
            setResponseText(accumulated);
          }
          if (data.type === "done") {
            setIsStreaming(false);
          }
        } catch {
          // skip
        }
      }
    }

    setIsStreaming(false);
  }

  const responseHtml = responseText
    ? (marked.parse(responseText, { async: false }) as string)
    : "";

  return (
    <>
      <div
        ref={panelRef}
        className={`highlight-chat-panel ${isOpen ? "open" : ""}`}
        id="highlight-chat-panel"
      >
        <div className="panel-header">
          <h3>
            {defaultCharacter
              ? `Ask ${defaultCharacter}`
              : currentPage === "references"
                ? "Explore Babylon's Library"
                : "Ask the Assembly"}
          </h3>
          <button
            className="panel-collapse-btn"
            onClick={() => setIsOpen(false)}
            title="Collapse panel"
          >
            &#8250;
          </button>
        </div>

        {highlightedText && (
          <div className="panel-quote">{highlightedText}</div>
        )}

        <div style={{ padding: "0 0.75rem 0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <textarea
              className="follow-up-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                defaultCharacter
                  ? `Ask ${defaultCharacter} about this...`
                  : "Ask about this text..."
              }
              rows={2}
              disabled={isStreaming}
            />
            <button
              className="follow-up-button"
              onClick={handleSubmit}
              disabled={isStreaming || !question.trim()}
            >
              {isStreaming ? "..." : "Ask"}
            </button>
          </div>
        </div>

        {responseText && (
          <div
            className="panel-response-area markdown-content"
            dangerouslySetInnerHTML={{ __html: responseHtml }}
          />
        )}
      </div>

      <button
        className="panel-expand-tab"
        onClick={() => setIsOpen(true)}
        title="Expand chat panel"
        style={{ display: isOpen ? "none" : undefined }}
      >
        <span className="tab-icon">&#8249;</span> Ask
      </button>
    </>
  );
}
