"use client";
import { useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { accentFor } from "./primitives/chart-colors";
import type { Surface as SurfaceKind } from "./primitives/palette";
import {
  DEFAULT_TRAILING_PRESET,
  TRAILING_PRESETS,
  trailingRange,
  type TrailingPresetId,
} from "@/lib/reports/trailing-range";

export interface TrailingRange {
  preset: TrailingPresetId;
  setPreset: (p: TrailingPresetId) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
}

/** Page-local lookback state, defaulting to the trailing 365 days unless an initial range is given. */
export function useTrailingRange(initial?: { start: string; end: string }): TrailingRange {
  const [preset, setPresetRaw] = useState<TrailingPresetId>(initial ? "custom" : DEFAULT_TRAILING_PRESET);
  const [start, setStart] = useState(() => initial?.start ?? trailingRange(365).start);
  const [end, setEnd] = useState(() => initial?.end ?? trailingRange(365).end);

  function setPreset(next: TrailingPresetId) {
    setPresetRaw(next);
    const match = TRAILING_PRESETS.find((p) => p.id === next);
    if (match) {
      const r = trailingRange(match.days);
      setStart(r.start);
      setEnd(r.end);
    }
  }

  return { preset, setPreset, start, setStart, end, setEnd };
}

export function TrailingRangePicker({
  surface,
  range,
}: {
  surface: SurfaceKind;
  range: TrailingRange;
}) {
  const accent = accentFor(surface);
  const toggle = "px-2 py-0.5 rounded-md text-xs font-bold transition-all";

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5">
        {[...TRAILING_PRESETS, { id: "custom" as const, label: "Custom" }].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => range.setPreset(p.id)}
            className={`${toggle} ${
              range.preset === p.id ? "text-white shadow-sm" : "text-foreground/70 hover:text-foreground"
            }`}
            style={range.preset === p.id ? { background: accent } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>
      {range.preset === "custom" ? (
        <div className="flex items-center gap-2">
          <DatePicker value={range.start} onChange={range.setStart} className="h-6 text-xs font-bold" />
          <span className="text-foreground/40">–</span>
          <DatePicker value={range.end} onChange={range.setEnd} className="h-6 text-xs font-bold" />
        </div>
      ) : (
        <span className="text-xs tabular-nums text-foreground/70">
          {range.start} – {range.end}
        </span>
      )}
    </div>
  );
}
