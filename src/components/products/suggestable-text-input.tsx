"use client";

import { useMemo, useState } from "react";

const MAX_VISIBLE = 80;

type Props = {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onEscape?: () => void;
  onFocus?: () => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function SuggestableTextInput({
  id,
  value,
  options,
  onChange,
  onCommit,
  onEscape,
  onFocus,
  className,
  placeholder,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(!!autoFocus);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matched = q
      ? options.filter((opt) => opt.toLowerCase().includes(q))
      : options;
    return matched.slice(0, MAX_VISIBLE);
  }, [options, value]);

  const showList = open && options.length > 0 && filtered.length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          onCommit(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onCommit(value);
          }
          if (e.key === "Escape") {
            setOpen(false);
            onEscape?.();
          }
        }}
        className={className}
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-0.5 max-h-48 w-full overflow-auto rounded border border-border bg-card py-0.5 shadow-md"
        >
          {filtered.map((opt) => (
            <li key={opt} role="option" aria-selected={opt === value}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left text-xs text-foreground hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt);
                  setOpen(false);
                  onCommit(opt);
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
