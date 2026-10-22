"use client";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const MIN_R = 3;
const MAX_R = 22;

/** √-scaled so area tracks units; scaled to the account's largest state. */
export function dotRadius(units: number, max: number): number {
  if (max <= 0) return 0;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(Math.max(0, units) / max);
}

export type BubbleHover = { bubble: StateBubble; x: number; y: number };

export function StateBubbleOverlay({
  bubbles,
  selected,
  onSelect,
  onHover,
}: {
  bubbles: StateBubble[];
  selected: string | null;
  onSelect: (state: string) => void;
  onHover: (h: BubbleHover | null) => void;
}) {
  const max = Math.max(0, ...bubbles.map((b) => b.units));
  // Largest first so small states (NJ, DE, MD, CT, RI) paint on top and stay clickable.
  const ordered = [...bubbles].sort((a, b) => b.units - a.units || a.state.localeCompare(b.state));
  return (
    <g>
      {ordered.map((b) => {
        const isSelected = b.state === selected;
        return (
          <circle
            key={b.state}
            data-bubble={b.state}
            cx={b.x}
            cy={b.y}
            r={dotRadius(b.units, max)}
            fill="var(--foreground)"
            fillOpacity={0.85}
            stroke={isSelected ? "var(--brand)" : "var(--card)"}
            strokeWidth={isSelected ? 2 : 1.5}
            className="cursor-pointer"
            // The circle sits over the state path, so it forwards the click itself.
            onClick={() => {
              onHover(null);
              onSelect(b.state);
            }}
            onMouseMove={(e) => onHover({ bubble: b, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
      {/* Circles sit on the choropleth's label points and hide its labels, so each state's
          code is re-printed on top — after ALL circles, so a neighbour's circle never covers
          it. Card-coloured text with a foreground halo reads on the circle and, where a small
          circle is narrower than the text, on the state fill too. Clicks pass through. */}
      {ordered.map((b) => (
        <text
          key={`label-${b.state}`}
          data-bubble-label={b.state}
          x={b.x}
          y={b.y + 3}
          textAnchor="middle"
          fill="var(--card)"
          stroke="var(--foreground)"
          strokeWidth={2.5}
          paintOrder="stroke"
          className="pointer-events-none text-[9px] font-bold"
        >
          {b.state}
        </text>
      ))}
    </g>
  );
}
