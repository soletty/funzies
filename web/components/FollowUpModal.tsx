"use client";

import { useState, useRef, useCallback } from "react";
import { marked } from "marked";
import { parseFollowUpResponse, getLoadingMessage } from "@/lib/follow-up-rendering";
import AttachmentWidget, { type AttachedFile } from "@/components/AttachmentWidget";

type Mode = "ask-assembly" | "ask-character" | "ask-library" | "debate";
type PageType = "synthesis" | "character" | "iteration" | "references" | "deliverables" | "trajectory";

interface FollowUpModalProps {
  assemblyId: string;
  characters: string[];
  currentPage: string;
  defaultCharacter?: string;
  pageType?: PageType;
}

function getPageConfig(pageType: PageType | undefined, characterName?: string) {
  switch (pageType) {
    case "character":
      return {
        heading: `Ask ${characterName ?? "Character"}`,
        fixedMode: "ask-character" as Mode,
        showModeSelector: false,
        showChallenge: true,
        submitLabel: "Ask",
      };
    case "iteration":
      return {
        heading: "Debate",
        fixedMode: "debate" as Mode,
        showModeSelector: false,
        showChallenge: false,
        submitLabel: "Debate",
      };
    case "references":
      return {
        heading: "Explore Babylon\u2019s Library",
        fixedMode: "ask-library" as Mode,
        showModeSelector: false,
        showChallenge: false,
        submitLabel: "Ask",
      };
    default:
      return {
        heading: "Ask the Assembly",
        fixedMode: null,
        showModeSelector: true,
        showChallenge: false,
        submitLabel: "Ask",
      };
  }
}

export default function FollowUpModal({
  assemblyId,
  characters,
  currentPage,
  defaultCharacter,
  pageType,
}: FollowUpModalProps) {
  const config = getPageConfig(pageType, defaultCharacter);

  const [mode, setMode] = useState<Mode>(config.fixedMode ?? (defaultCharacter ? "ask-character" : "ask-assembly"));
  const [question, setQuestion] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(defaultCharacter || characters[0] || "");
  const [isChallenge, setIsChallenge] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const responseRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const activeMode = config.fixedMode ?? mode;

  async function handleSubmit() {
    if (!question.trim() || isStreaming) return;

    setIsStreaming(true);
    setResponseText("");

    let fileRefs: { name: string; type: string; content: string }[] = [];
    if (attachedFiles.length > 0) {
      fileRefs = await Promise.all(
        attachedFiles.map(async (af) => ({
          name: af.file.name,
          type: af.file.type || "text/plain",
          content: await af.file.text(),
        }))
      );
    }

    const body = {
      question: question.trim(),
      mode: activeMode,
      characters: activeMode === "ask-character" ? [selectedCharacter] : [],
      context: { page: currentPage },
      challenge: isChallenge,
      files: fileRefs.length > 0 ? fileRefs : undefined,
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

  const speakerBlocks = responseText
    ? parseFollowUpResponse(responseText, characters)
    : [];

  const loadingMsg = getLoadingMessage(activeMode, isChallenge);

  return (
    <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "1.5rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: "1rem" }}>
        {config.heading}
      </h2>

      {config.showModeSelector && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${mode === "ask-assembly" ? "var(--color-accent)" : "var(--color-border)"}`,
            background: mode === "ask-assembly" ? "var(--color-accent-subtle)" : "transparent",
            color: mode === "ask-assembly" ? "var(--color-accent)" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: mode === "ask-assembly" ? 600 : 400,
          }}>
            <input
              type="radio"
              name="follow-up-mode"
              checked={mode === "ask-assembly"}
              onChange={() => setMode("ask-assembly")}
              style={{ display: "none" }}
            />
            &#9752; Ask Assembly
          </label>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${mode === "ask-character" ? "var(--color-accent)" : "var(--color-border)"}`,
            background: mode === "ask-character" ? "var(--color-accent-subtle)" : "transparent",
            color: mode === "ask-character" ? "var(--color-accent)" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: mode === "ask-character" ? 600 : 400,
          }}>
            <input
              type="radio"
              name="follow-up-mode"
              checked={mode === "ask-character"}
              onChange={() => setMode("ask-character")}
              style={{ display: "none" }}
            />
            &#9823; Ask Character
          </label>
        </div>
      )}

      {activeMode === "ask-character" && characters.length > 0 && (
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

      <AttachmentWidget files={attachedFiles} onChange={setAttachedFiles} disabled={isStreaming} />

      <div style={{ marginBottom: "0.75rem" }}>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => { setQuestion(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={
            activeMode === "ask-character"
              ? `Ask ${selectedCharacter} a question...`
              : activeMode === "ask-library"
                ? "Ask about these sources..."
                : activeMode === "debate"
                  ? "What should the assembly debate?"
                  : "Ask the assembly a question..."
          }
          rows={2}
          style={{
            width: "100%",
            padding: "0.75rem",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-body)",
            fontSize: "0.9rem",
            resize: "none",
            overflow: "hidden",
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
          {isStreaming ? loadingMsg : config.submitLabel}
        </button>

        {config.showChallenge && (
          <button
            onClick={() => { setIsChallenge(true); handleSubmit(); }}
            disabled={isStreaming || !question.trim()}
            style={{
              padding: "0.5rem 1.2rem",
              background: isStreaming ? "var(--color-surface-alt)" : "var(--color-error, #cf222e)",
              color: isStreaming ? "var(--color-text-muted)" : "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: isStreaming ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.9rem",
            }}
          >
            Challenge
          </button>
        )}
      </div>

      {responseText && (
        <div
          ref={responseRef}
          className={`follow-up-response${isStreaming ? " follow-up-streaming" : ""}`}
          style={{
            padding: "1.25rem",
            background: "var(--color-surface)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          {speakerBlocks.length === 1 && !speakerBlocks[0].speaker ? (
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{
                __html: marked.parse(responseText, { async: false }) as string,
              }}
            />
          ) : (
            speakerBlocks.map((block, i) => (
              <div key={i} className="follow-up-exchange">
                <div className="debate-speaker">
                  <span className="debate-speaker-dot" style={{ background: block.color }} />
                  {block.speaker}
                </div>
                <div
                  className="debate-content"
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(block.content, { async: false }) as string,
                  }}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
