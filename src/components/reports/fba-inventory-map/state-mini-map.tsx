"use client";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import { pathVertices } from "@/lib/us-map-geometry";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { Dot } from "@/lib/fba-inventory-map/types";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const LABELS = 6;

/** Bounding box of the state's outline (national map coordinates), padded by 8% of its larger side. */
export function miniMapBox(stateCode: string): { x: number; y: number; w: number; h: number } | null {
  const d = US_STATE_PATHS[stateCode];
  if (!d) return null;
  const v = pathVertices(d);
  const xs = v.map((p) => p[0]);
  const ys = v.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

/** The selected state alone, with each FC metro at its real projected position (same space as the national map). */
export function StateMiniMap({ stateCode, metros }: { stateCode: string; metros: Dot[] }) {
  const box = miniMapBox(stateCode);
  if (!box) return null;
  const side = Math.max(box.w, box.h);
  // AK/HI insets, PR, or a coastal metro clipped by the simplified outline can fall outside: skip, the list still has them.
  const inside = metros
    .filter((m) => m.x >= box.x && m.x <= box.x + box.w && m.y >= box.y && m.y <= box.y + box.h)
    .sort((a, b) => b.units - a.units || a.key.localeCompare(b.key));
  const max = Math.max(0, ...inside.map((m) => m.units));
  // Sized as a fraction of the frame, so dots read the same on CA and RI.
  const r = (u: number) => side * (0.018 + 0.052 * (max > 0 ? Math.sqrt(Math.max(0, u) / max) : 0));
  const labelled = inside.filter((m) => !m.approximate).slice(0, LABELS);
  return (
    <svg
      data-testid="state-mini-map"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className="mt-2 block max-h-[380px] w-full"
      role="img"
      aria-label={`FBA stock locations in ${stateDisplayName(stateCode)}`}
    >
      <path d={US_STATE_PATHS[stateCode]} fill="var(--muted)" stroke="var(--border)" vectorEffect="non-scaling-stroke" />
      {inside.map((m) => (
        <circle
          key={m.key}
          data-metro={m.key}
          cx={m.x}
          cy={m.y}
          r={r(m.units)}
          fill={m.approximate ? "none" : "var(--foreground)"}
          fillOpacity={m.approximate ? undefined : 0.85}
          stroke={m.approximate ? "var(--foreground)" : "var(--card)"}
          strokeWidth={1.5}
          strokeDasharray={m.approximate ? "3 2" : undefined}
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${m.approximate ? "Location approximate (state only)" : m.label} · ${nf.format(m.units)} units · ${m.fcs.map((f) => f.code).join(", ")}`}</title>
        </circle>
      ))}
      {labelled.map((m) => (
        <text
          key={`label-${m.key}`}
          data-metro-label={m.key}
          x={m.x + r(m.units) + side * 0.01}
          y={m.y + side * 0.012}
          fontSize={side * 0.035}
          fill="var(--foreground)"
          stroke="var(--card)"
          strokeWidth={side * 0.008}
          paintOrder="stroke"
          className="pointer-events-none font-bold"
        >
          {m.label.split(",")[0]}
        </text>
      ))}
    </svg>
  );
}
