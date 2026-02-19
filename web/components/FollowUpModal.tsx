"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { marked } from "marked";
import { parseFollowUpResponse, getLoadingMessage } from "@/lib/follow-up-rendering";
import { findAvatarUrl } from "@/lib/character-utils";
import AttachmentWidget, { type AttachedFile } from "@/components/AttachmentWidget";
import type { FollowUp } from "@/lib/types";

type Mode = "ask-assembly" | "ask-character" | "ask-library" | "debate";
type PageType = "synthesis" | "character" | "iteration" | "references" | "deliverables" | "trajectory";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FollowUpModalProps {
  assemblyId: string;
  characters: string[];
  avatarUrlMap?: Record<string, string>;
  currentPage: string;
  defaultCharacter?: string;
  pageType?: PageType;
  followUps?: FollowUp[];
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
  avatarUrlMap = {},
  currentPage,
  defaultCharacter,
  pageType,
  followUps = [],
}: FollowUpModalProps) {
  const config = getPageConfig(pageType, defaultCharacter);

  const [mode, setMode] = useState<Mode>(config.fixedMode ?? (defaultCharacter ? "ask-character" : "ask-assembly"));
  const [question, setQuestion] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(defaultCharacter || characters[0] || "");
  const [isChallenge, setIsChallenge] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial: ChatMessage[] = [];
    for (const fu of followUps) {
      const ctx = typeof fu.context === "object" && "page" in fu.context
        ? (fu.context as { page: string }).page
        : fu.context;
      if (ctx !== currentPage) continue;
      initial.push({ role: "user", content: fu.question });
      if (fu.raw) initial.push({ role: "assistant", content: fu.raw });
    }
    return initial;
  });
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const activeMode = config.fixedMode ?? mode;

  async function handleSubmit() {
    if (!question.trim() || isStreaming) return;

    const userMessage = question.trim();
    setQuestion("");
    setIsStreaming(true);
    setIsChallenge(false);

    const updatedMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);

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

    const history = updatedMessages.map((m) => ({ role: m.role, content: m.content }));

    const body = {
      question: userMessage,
      mode: activeMode,
      characters: activeMode === "ask-character" ? [selectedCharacter] : [],
      context: { page: currentPage },
      challenge: isChallenge,
      files: fileRefs.length > 0 ? fileRefs : undefined,
      history,
    };

    const res = await fetch(`/api/assemblies/${assemblyId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: Failed to get response" }]);
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
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length === updatedMessages.length + 1) {
                return [...prev.slice(0, -1), { role: "assistant", content: accumulated }];
              }
              return [...prev, { role: "assistant", content: accumulated }];
            });
          }
          if (data.type === "error") {
            accumulated += `\n\nError: ${data.content}`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { role: "assistant", content: accumulated }];
              }
              return [...prev, { role: "assistant", content: accumulated }];
            });
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
    setAttachedFiles([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const loadingMsg = getLoadingMessage(activeMode, isChallenge);

  function renderAssistantMessage(content: string) {
    const speakerBlocks = parseFollowUpResponse(content, characters);
    if (speakerBlocks.length === 1 && !speakerBlocks[0].speaker) {
      return (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{
            __html: marked.parse(content, { async: false }) as string,
          }}
        />
      );
    }
    return speakerBlocks.map((block, i) => {
      const url = findAvatarUrl(block.speaker, avatarUrlMap);
      return (
        <div key={i} className="follow-up-exchange">
          <div className="debate-speaker">
            {url ? (
              <img src={url} alt={block.speaker} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <span className="debate-speaker-dot" style={{ background: block.color }} />
            )}
            {block.speaker}
          </div>
          <div
            className="debate-content"
            dangerouslySetInnerHTML={{
              __html: marked.parse(block.content, { async: false }) as string,
            }}
          />
        </div>
      );
    });
  }

  return (
    <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "1.5rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: "1rem" }}>
        {config.heading}
      </h2>

      {messages.length > 0 && (
        <div ref={threadRef} className="chat-thread">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="chat-message-user">
                  {msg.content}
                </div>
              ) : (
                <div className="chat-message-assistant">
                  {renderAssistantMessage(msg.content)}
                </div>
              )}
              {msg.role === "assistant" && i < messages.length - 1 && (
                <div className="chat-thread-divider" />
              )}
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="chat-message-assistant">
              <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: "0.85rem" }}>
                {loadingMsg}
              </span>
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
