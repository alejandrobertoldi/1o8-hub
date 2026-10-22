"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";

export type EditableOption =
  | string
  | {
      value: string;
      label: string;
    };

function optionValue(o: EditableOption): string {
  return typeof o === "string" ? o : o.value;
}

function optionLabel(o: EditableOption): string {
  return typeof o === "string" ? o : o.label;
}

function displayForValue(
  value: string | null,
  options: readonly EditableOption[] | undefined,
  placeholder: string
): string {
  if (value == null || value === "") return placeholder;
  if (!options) return value;
  const match = options.find((o) => optionValue(o) === value);
  return match ? optionLabel(match) : value;
}

/**
 * Inline edit-in-place, matching the EditableName / EditableAsanaEmail pattern
 * already in src/app/admin/users/page.tsx:139-248 rather than introducing a
 * second editing idiom.
 *
 * A field the viewer may not write renders as plain read-only text with no
 * pencil — never as a disabled input, which advertises that there is something
 * they cannot have.
 */
export function EditableField({
  label,
  value,
  canWrite,
  onSave,
  placeholder = "—",
  type = "text",
  options,
  allowClear = false,
  renderDisplay,
  accentLabel = false,
}: {
  label: string;
  value: string | null;
  canWrite: boolean;
  onSave: (next: string | null) => void;
  placeholder?: string;
  type?: "text" | "date" | "email";
  /**
   * When supplied the field edits through a <select> constrained to exactly
   * these values. By default it is NON-CLEARABLE (for enums like
   * employmentStatus). Pass `allowClear` for nullable constrained fields
   * (e.g. addressCountry).
   */
  options?: readonly EditableOption[];
  /** When true with `options`, offer an empty "—" choice that saves null. */
  allowClear?: boolean;
  /** Optional custom closed-state renderer (e.g. flag + country name). */
  renderDisplay?: (value: string | null, labelText: string) => ReactNode;
  /** Bold brand-orange label (micro-label / section eyebrow style). */
  accentLabel?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) return;
    if (selectRef.current) {
      selectRef.current.focus();
      return;
    }
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (options) {
      if (allowClear) {
        const next = trimmed || null;
        if (next !== (value ?? null)) onSave(next);
        setEditing(false);
        return;
      }
      // A constrained non-clearable field is NOT nullable — a <select>
      // offers no empty choice, so the emptiness test only guards a stray
      // value; it never sends null.
      if (trimmed && trimmed !== value) onSave(trimmed);
      setEditing(false);
      return;
    }
    const next = trimmed || null;
    if (next !== (value ?? null)) onSave(next);
    setEditing(false);
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={
          accentLabel
            ? "text-xs font-bold uppercase tracking-wider text-brand"
            : "text-[10px] font-bold uppercase text-muted-foreground"
        }
      >
        {label}
      </span>
      {editing ? (
        <span className="flex items-center gap-1">
          {options ? (
            <select
              ref={selectRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className="max-w-[min(100%,20rem)] rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            >
              {allowClear ? (
                <option value="">—</option>
              ) : null}
              {options.map((o) => {
                const v = optionValue(o);
                return (
                  <option key={v} value={v}>
                    {optionLabel(o)}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className="rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            />
          )}
          <button
            type="button"
            onClick={commit}
            aria-label={`Save ${label}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Check className="size-3.5" />
          </button>
        </span>
      ) : canWrite ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
          className="group flex items-center gap-1.5 text-sm text-left hover:text-foreground"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {renderDisplay
              ? renderDisplay(value, displayForValue(value, options, placeholder))
              : displayForValue(value, options, placeholder)}
          </span>
          {options ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
          ) : (
            <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground" />
          )}
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-sm">
          {renderDisplay
            ? renderDisplay(value, displayForValue(value, options, placeholder))
            : displayForValue(value, options, placeholder)}
        </span>
      )}
    </div>
  );
}
