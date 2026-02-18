"use client";

import { useState, useRef } from "react";
import { marked } from "marked";

const MODES = [
  { id: "ask-assembly" as const, label: "Ask the Assembly", icon: "\u2638" },
  { id: "ask-character" as const, label: "Ask a Character", icon: "\u265F" },
  { id: "ask-library" as const, label: "Ask the Library", icon: "\u2637" },
  { id: "debate" as const, label: "Debate", icon: "\u2694" },
];

type Mode = "ask-assembly" | "ask-character" | "ask-library" | "debate";

interface FollowUpModalProps {
  assemblyId: string;
  characters: string[];
  currentPage: string;
  defaultCharacter?: string;
}

export default function FollowUpModal({
  assemblyId,
  characters,
  currentPage,
  defaultCharacter,
}: FollowUpModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(defaultCharacter ? "ask-character" : "ask-assembly");
  const [question, setQuestion] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(defaultCharacter || characters[0] || "");
  const [isChallenge, setIsChallenge] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseText, setResponseText] = useState("");
  const responseRef = useRef<HTMLDivElement>(null);

  async function handleSubmit() {
    if (!question.trim() || isStreaming) return;

    setIsStreaming(true);
    setResponseText("");

    const body = {
      question: question.trim(),
      mode,
      characters: mode === "ask-character" ? [selectedCharacter] : [],
      context: { page: currentPage },
      challenge: isChallenge,
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
          if (data.type === "error") {
            accumulated += `\n\nError: ${data.content}`;
            setResponseText(accumulated);
          }
          if (data.type === "done") {
            setIsStreaming(false);
          }
        } catch {
          // skip malformed events
        }
      }
    }

    setIsStreaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const responseHtml = responseText
    ? (marked.parse(responseText, { async: false }) as string)
    : "";

  if (!isOpen) {
    return (
      <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "1.5rem" }}>
        <button
          onClick={() => setIsOpen(true)}
          className="action-pill"
          style={{ cursor: "pointer" }}
        >
          <span className="pill-icon">{"\u2712"}</span> Ask a follow-up question
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "1.5rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: "1rem" }}>
        Follow-up Question
      </h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${mode === m.id ? "var(--color-accent)" : "var(--color-border)"}`,
              background: mode === m.id ? "var(--color-accent-subtle)" : "transparent",
              color: mode === m.id ? "var(--color-accent)" : "var(--color-text-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: mode === m.id ? 600 : 400,
            }}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {mode === "ask-character" && characters.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem", display: "block" }}>
            Character
          </label>
          <select
            value={selectedCharacter}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-bg)",
              fontSize: "0.9rem",
              width: "100%",
              maxWidth: "300px",
            }}
          >
            {characters.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: "0.75rem" }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "ask-character"
              ? `Ask ${selectedCharacter} a question...`
              : mode === "ask-library"
                ? "Ask about these sources..."
                : mode === "debate"
                  ? "What should the assembly debate?"
                  : "Ask the assembly a question..."
          }
          rows={3}
          style={{
            width: "100%",
            padding: "0.75rem",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-body)",
            fontSize: "0.9rem",
            resize: "vertical",
            background: "var(--color-bg)",
          }}
          disabled={isStreaming}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !question.trim()}
          style={{
            padding: "0.5rem 1.2rem",
            background: isStreaming ? "var(--color-surface-alt)" : "var(--color-accent)",
            color: isStreaming ? "var(--color-text-muted)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.9rem",
          }}
        >
          {isStreaming ? "Thinking..." : "Ask"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isChallenge}
            onChange={(e) => setIsChallenge(e.target.checked)}
            disabled={isStreaming}
          />
          Challenge mode
        </label>

        <button
          onClick={() => { setIsOpen(false); setResponseText(""); setQuestion(""); }}
          style={{
            marginLeft: "auto",
            padding: "0.4rem 0.8rem",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: "0.85rem",
            color: "var(--color-text-muted)",
          }}
        >
          Close
        </button>
      </div>

      {responseText && (
        <div
          ref={responseRef}
          className="markdown-content"
          style={{
            padding: "1.25rem",
            background: "var(--color-surface)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--color-border-light)",
          }}
          dangerouslySetInnerHTML={{ __html: responseHtml }}
        />
      )}
    </div>
  );
}
