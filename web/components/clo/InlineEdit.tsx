"use client";

import { useState, useRef, useEffect } from "react";

const editHighlight = "rgba(234, 179, 8, 0.1)";
const editBorder = "1px solid rgba(234, 179, 8, 0.3)";

interface InlineTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  dirty?: boolean;
}

export function InlineText({ value, onChange, placeholder, multiline, dirty }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{
          cursor: "pointer",
          padding: "0.1rem 0.3rem",
          borderRadius: "var(--radius-sm)",
          background: dirty ? editHighlight : "transparent",
          border: dirty ? editBorder : "1px solid transparent",
          minWidth: "2rem",
          display: "inline-block",
        }}
        title="Click to edit"
      >
        {value || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>{placeholder || "—"}</span>}
      </span>
    );
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className="ic-textarea"
        rows={4}
        style={{ fontSize: "inherit", width: "100%" }}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      style={{
        fontSize: "inherit",
        padding: "0.1rem 0.3rem",
        border: "1px solid var(--color-accent)",
        borderRadius: "var(--radius-sm)",
        outline: "none",
        width: "100%",
      }}
    />
  );
}

interface InlineNumberProps {
  value: number | null;
  onChange: (value: number | null) => void;
  dirty?: boolean;
}

export function InlineNumber({ value, onChange, dirty }: InlineNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value != null ? String(value) : ""); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{
          cursor: "pointer",
          padding: "0.1rem 0.3rem",
          borderRadius: "var(--radius-sm)",
          background: dirty ? editHighlight : "transparent",
          border: dirty ? editBorder : "1px solid transparent",
          minWidth: "2rem",
          display: "inline-block",
        }}
        title="Click to edit"
      >
        {value != null ? String(value) : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
      </span>
    );
  }

  function commit() {
    setEditing(false);
    const num = draft.trim() === "" ? null : Number(draft);
    if (num !== value && (num === null || !isNaN(num))) onChange(num);
  }

  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value != null ? String(value) : ""); setEditing(false); }
      }}
      style={{
        fontSize: "inherit",
        padding: "0.1rem 0.3rem",
        border: "1px solid var(--color-accent)",
        borderRadius: "var(--radius-sm)",
        outline: "none",
        width: "5rem",
        textAlign: "right",
      }}
    />
  );
}

interface InlineSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  dirty?: boolean;
}

export function InlineSelect({ value, options, onChange, dirty }: InlineSelectProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    const label = options.find((o) => o.value === value)?.label || value;
    return (
      <span
        onClick={() => setEditing(true)}
        style={{
          cursor: "pointer",
          padding: "0.1rem 0.3rem",
          borderRadius: "var(--radius-sm)",
          background: dirty ? editHighlight : "transparent",
          border: dirty ? editBorder : "1px solid transparent",
        }}
        title="Click to edit"
      >
        {label || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => { onChange(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      autoFocus
      style={{ fontSize: "inherit", padding: "0.1rem 0.3rem" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface InlineStringListProps {
  items: string[];
  onChange: (items: string[]) => void;
  dirty?: boolean;
}

export function InlineStringList({ items, onChange, dirty }: InlineStringListProps) {
  function updateItem(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: "0.3rem", alignItems: "center", marginBottom: "0.3rem" }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", minWidth: "1.5rem" }}>{i + 1}.</span>
          <InlineText value={item} onChange={(v) => updateItem(i, v)} dirty={dirty} />
          <button
            type="button"
            onClick={() => removeItem(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.8rem", padding: "0 0.2rem" }}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", fontSize: "0.8rem", padding: "0.2rem 0" }}
      >
        + Add item
      </button>
    </div>
  );
}

interface InlineKeyValueProps {
  data: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
  dirty?: boolean;
}

export function InlineKeyValue({ data, onChange, dirty }: InlineKeyValueProps) {
  const entries = Object.entries(data);

  function updateKey(oldKey: string, newKey: string) {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  }

  function updateValue(key: string, value: string) {
    onChange({ ...data, [key]: value });
  }

  function removeEntry(key: string) {
    const next = { ...data };
    delete next[key];
    onChange(next);
  }

  function addEntry() {
    onChange({ ...data, "": "" });
  }

  return (
    <div>
      {entries.map(([key, value], i) => (
        <div key={i} style={{ display: "flex", gap: "0.3rem", alignItems: "center", marginBottom: "0.3rem" }}>
          <InlineText value={key} onChange={(v) => updateKey(key, v)} dirty={dirty} placeholder="key" />
          <span style={{ color: "var(--color-text-muted)" }}>:</span>
          <InlineText value={value} onChange={(v) => updateValue(key, v)} dirty={dirty} placeholder="value" />
          <button
            type="button"
            onClick={() => removeEntry(key)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.8rem", padding: "0 0.2rem" }}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", fontSize: "0.8rem", padding: "0.2rem 0" }}
      >
        + Add entry
      </button>
    </div>
  );
}
