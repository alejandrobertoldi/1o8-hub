"use client";
import type { SurfacePalette } from "./palette";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  palette,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  palette: SurfacePalette;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[10px] bg-mf-ghost p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              active ? "bg-white font-semibold shadow-[0_2px_8px_rgba(16,34,39,0.08)]" : "text-mf-muted hover:text-mf-ink"
            }`}
            style={active ? { color: palette.accent } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
