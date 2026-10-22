"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { MAX_JOB_TITLES } from "@/lib/team/departments";

/**
 * Employment-card editor for one-or-more job titles.
 *
 * Closed state matches EditableField (label left, value right, pencil on
 * hover). Extra titles stack under the first without repeating the label.
 * Saving always sends the full list so the PATCH can keep job_title in sync.
 */
export function JobTitlesField({
  titles,
  canWrite,
  onSave,
}: {
  titles: string[];
  canWrite: boolean;
  onSave: (next: string[]) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const editing = adding || editingIndex !== null;

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (editingIndex === null) {
      setEditingIndex(null);
      return;
    }
    const current = titles[editingIndex] ?? "";
    if (!trimmed) {
      // Emptying a title removes it.
      if (titles.length > 1) onSave(titles.filter((_, i) => i !== editingIndex));
      else if (current) onSave([]);
    } else if (trimmed !== current) {
      const next = titles.slice();
      next[editingIndex] = trimmed;
      onSave(next);
    }
    setEditingIndex(null);
  }

  function commitAdd() {
    const trimmed = draft.trim();
    if (trimmed) onSave([...titles, trimmed]);
    setAdding(false);
    setDraft("");
  }

  function removeAt(index: number) {
    onSave(titles.filter((_, i) => i !== index));
  }

  const rows = titles.length > 0 ? titles : canWrite ? [] : ["—"];
  const canAdd = canWrite && !adding && titles.length < MAX_JOB_TITLES;

  return (
    <div className="py-1">
      {rows.length === 0 && !adding ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Job title
          </span>
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setAdding(true);
              }}
              aria-label="Add job title"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              —
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      ) : (
        rows.map((title, index) => (
          <div
            key={`${title}-${index}`}
            className="flex items-baseline justify-between gap-3 py-0.5"
          >
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              {index === 0 ? "Job title" : ""}
            </span>
            {editingIndex === index ? (
              <span className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") {
                      setEditingIndex(null);
                      setDraft("");
                    }
                  }}
                  className="rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={commitEdit}
                  aria-label="Save job title"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Check className="size-3.5" />
                </button>
              </span>
            ) : canWrite ? (
              <span className="group flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft(title);
                    setEditingIndex(index);
                  }}
                  aria-label={`Edit job title ${title}`}
                  className="flex items-center gap-1.5 text-sm text-left hover:text-foreground"
                >
                  <span className={title === "—" ? "text-muted-foreground" : ""}>
                    {title}
                  </span>
                  <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground" />
                </button>
                {titles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label={`Remove job title ${title}`}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            ) : (
              <span className="text-sm">{title}</span>
            )}
          </div>
        ))
      )}
      {adding && (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            {titles.length === 0 ? "Job title" : ""}
          </span>
          <span className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="New title"
              className="rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={commitAdd}
              aria-label="Save job title"
              className="text-muted-foreground hover:text-foreground"
            >
              <Check className="size-3.5" />
            </button>
          </span>
        </div>
      )}
      {canAdd && (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={() => {
              setEditingIndex(null);
              setDraft("");
              setAdding(true);
            }}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Add title
          </button>
        </div>
      )}
    </div>
  );
}
