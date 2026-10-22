"use client";
import { accentFor } from "./primitives/chart-colors";
import type { GeographyView } from "@/lib/reports/geography-view";

const LABELS: Record<GeographyView, string> = { orders: "Orders", inventory: "Inventory", both: "Both" };

export function GeographyViewSwitch({ value, onChange }: { value: GeographyView; onChange: (v: GeographyView) => void }) {
  const accent = accentFor("hub");
  return (
    <div className="flex gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5">
      {(Object.keys(LABELS) as GeographyView[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2 py-0.5 text-xs font-bold transition-all ${
            value === v ? "text-white shadow-sm" : "text-foreground/70 hover:text-foreground"
          }`}
          style={value === v ? { background: accent } : undefined}
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}
