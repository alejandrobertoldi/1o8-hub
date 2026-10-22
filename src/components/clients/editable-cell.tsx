/* eslint-disable react-doctor/no-generic-handler-names */
/* eslint-disable react-doctor/no-mirror-prop-effect */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-derived-useState */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ExternalLink, Building2, Mail, Loader2, Check } from "lucide-react";

type SaveState = "idle" | "saving" | "saved";

/** Format a raw numeric string for display based on prefix/suffix unit */
function formatDisplay(raw: string, prefix?: string, suffix?: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return raw; // non-numeric → show as-is

  if (suffix === "%") {
    // Values stored as decimals (0.2 → 20%), or already whole (20 → 20%)
    const pct = num < 1 && num > 0 ? num * 100 : num;
    // Remove unnecessary trailing decimals (20.0 → 20)
    const formatted = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
    return `${formatted}%`;
  }

  if (prefix === "$") {
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `$${formatted}`;
  }

  return raw;
}

interface EditableCellProps {
  field: string;
  value: string;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
  type?: "text" | "url" | "email";
  className?: string;
  /** Prefix shown before value in read-only mode (e.g. "$") */
  prefix?: string;
  /** Suffix shown after value in read-only mode (e.g. "%") */
  suffix?: string;
  /** Text alignment for the input (default: "left") */
  align?: "left" | "right" | "center";
}

export function EditableCell({
  field,
  value,
  readOnly,
  onSave,
  type = "text",
  className = "",
  prefix,
  suffix,
  align = "left",
}: EditableCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (only when not actively editing)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const doSave = useCallback(
    async (v: string) => {
      if (v === value) return;
      setSaveState("saving");
      try {
        await onSave(field, v);
        setSaveState("saved");
        savedTimerRef.current = setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("idle");
      }
    },
    [field, value, onSave]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setLocalValue(value);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleBlur = () => {
    doSave(localValue);
  };

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Read-only rendering
  if (readOnly) {
    if (!value) return null;

    if (type === "url") {
      return (
        <div className={`flex items-center gap-1.5 ${className}`}>
          <span className="font-medium break-all">{value}</span>
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:text-brand-hover shrink-0"
            title="Open website"
          >
            <Building2 className="size-4" />
          </a>
        </div>
      );
    }

    if (type === "email") {
      return (
        <a
          href={`mailto:${value}`}
          className={`text-brand hover:underline flex items-center gap-1 ${className}`}
        >
          <Mail className="size-3" />
          {value}
        </a>
      );
    }

    const display = (prefix || suffix) ? formatDisplay(value, prefix, suffix) : value;
    const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
    return <span className={`font-medium block ${alignClass} ${className}`}>{display}</span>;
  }

  // Editable rendering
  return (
    <div className={`relative flex items-center gap-1 ${className}`}>
      {prefix && <span className="text-muted-foreground text-xs shrink-0">{prefix}</span>}
      <input
        type={type === "email" ? "email" : "text"}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent border-b border-border/50 focus:border-brand outline-none text-sm py-0.5 px-0 font-medium transition-colors ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
      />
      {suffix && <span className="text-muted-foreground text-xs shrink-0">{suffix}</span>}
      {type === "url" && localValue && (
        <a
          href={localValue.startsWith("http") ? localValue : `https://${localValue}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:text-brand-hover shrink-0"
          title="Open website"
          onClick={(e) => e.stopPropagation()}
        >
          <Building2 className="size-4" />
        </a>
      )}
      {saveState === "saving" && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
      {saveState === "saved" && (
        <Check className="size-3 shrink-0 text-emerald-500" />
      )}
    </div>
  );
}
