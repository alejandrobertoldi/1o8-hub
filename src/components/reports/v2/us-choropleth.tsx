"use client";
import { useId, useState, type ReactNode } from "react";
import {
  US_MAP_CODES,
  US_MAP_VIEW_BOX,
  US_STATE_LABEL_POINTS,
  US_STATE_PATHS,
} from "@/lib/us-map-paths";
import { accentFor } from "./primitives/chart-colors";
import type { Surface } from "./primitives/palette";

/** Fill for a region the account has never shipped to. */
const NO_DATA_FILL = "#E9E7F0";
/** Fill for a region with orders but zero value under the active filter. */
const ZERO_FILL = "#F4F3F8";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mix(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * t)) as [number, number, number];
}

function rgbCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r},${g},${b})`;
}

/** Brand White and Off Black (DESIGN.md), as literals so contrast is computable. */
const ON_DARK = "#FEFEFE";
const ON_LIGHT = "#2C2B35";

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function heatRgb(value: number, max: number, accent: string): [number, number, number] {
  if (value <= 0 || max <= 0) return hexToRgb(ZERO_FILL);
  // Gamma < 1 lifts the long tail out of the background; a linear ramp leaves
  // everything but the top few indistinguishable.
  return mix(hexToRgb(ZERO_FILL), hexToRgb(accent), Math.pow(value / max, 0.72));
}

/**
 * The map's intensity ramp, exported so tables that sit beside the map shade
 * on the identical scale instead of inventing a second one.
 */
export function heatFill(value: number, max: number, accent: string): string {
  return rgbCss(heatRgb(value, max, accent));
}

/**
 * The ramp fill plus whichever of Brand White / Off Black is legible on it.
 *
 * Needed because the two surfaces darken in opposite directions: the portal's
 * charcoal `#2C2B35` reaches only 1.8:1 against Off Black at full intensity,
 * so dark text on a dark cell was unreadable, while the hub accent is the
 * reverse — it fails against white (2.7:1, per DESIGN.md) and must keep dark
 * text. Choosing by measured contrast gets both right without branching on
 * surface.
 *
 * NB: this comment says "hub accent" rather than spelling that hex, because
 * no-hub-orange.test.ts scans this file's source for the literal.
 */
export function heatCellStyle(
  value: number,
  max: number,
  accent: string,
): { background: string; color: string } {
  const rgb = heatRgb(value, max, accent);
  const lum = relativeLuminance(rgb);
  const onDark = contrastRatio(lum, relativeLuminance(hexToRgb(ON_DARK)));
  const onLight = contrastRatio(lum, relativeLuminance(hexToRgb(ON_LIGHT)));
  return { background: rgbCss(rgb), color: onDark > onLight ? ON_DARK : ON_LIGHT };
}

export type ChoroplethDatum = { value: number; label: string };

export function UsChoropleth({
  surface,
  data,
  selected,
  onSelect,
  formatLegend,
  overlay,
}: {
  surface: Surface;
  /** USPS code -> value driving the ramp, plus the tooltip line for it. Codes
      absent from this map are drawn as "never shipped to". */
  data: Record<string, ChoroplethDatum>;
  selected: string | null;
  onSelect: (code: string | null) => void;
  formatLegend: (value: number) => string;
  /** Rendered last inside the `<svg>`, after the state labels — e.g. an FC dot layer. */
  overlay?: ReactNode;
}) {
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const titleId = useId();

  const accent = accentFor(surface);
  const max = Math.max(0, ...Object.values(data).map((d) => d.value));

  function fillFor(code: string): string {
    const datum = data[code];
    if (!datum) return NO_DATA_FILL;
    return heatFill(datum.value, max, accent);
  }

  const hovered = hover ? data[hover.code] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${US_MAP_VIEW_BOX.width} ${US_MAP_VIEW_BOX.height}`}
        className="block w-full"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>Orders by US ship-to state</title>
        {US_MAP_CODES.map((code) => {
          const datum = data[code];
          const isSelected = selected === code;
          return (
            <path
              key={code}
              d={US_STATE_PATHS[code]}
              fill={fillFor(code)}
              stroke={isSelected ? accent : "#FEFEFE"}
              strokeWidth={isSelected ? 2 : 0.8}
              className={datum ? "cursor-pointer transition-colors" : "transition-colors"}
              onMouseMove={
                datum
                  ? (e) => setHover({ code, x: e.clientX, y: e.clientY })
                  : undefined
              }
              onMouseLeave={datum ? () => setHover(null) : undefined}
              onClick={
                datum
                  ? () => {
                      setHover(null);
                      onSelect(selected === code ? null : code);
                    }
                  : undefined
              }
            />
          );
        })}
        {US_MAP_CODES.filter((code) => data[code]).map((code) => {
          const [x, y] = US_STATE_LABEL_POINTS[code];
          return (
            <text
              key={`label-${code}`}
              x={x}
              y={y + 3}
              textAnchor="middle"
              /* Same contrast problem as the table cells: a dark portal fill
                 swallowed a dark label. */
              fill={heatCellStyle(data[code].value, max, accent).color}
              opacity={0.75}
              className="pointer-events-none text-[9px] font-bold"
            >
              {code}
            </text>
          );
        })}
        {overlay}
      </svg>

      {hover && hovered && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
          style={{ left: hover.x, top: hover.y }}
        >
          {hovered.label}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-mf-muted">
        <span>{formatLegend(0)}</span>
        <div
          className="h-2 w-28 rounded-full"
          style={{ background: `linear-gradient(90deg, ${ZERO_FILL}, ${accent})` }}
        />
        <span className="tabular-nums">{formatLegend(max)}</span>
      </div>
    </div>
  );
}
