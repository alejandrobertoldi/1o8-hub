/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState } from "react";

interface SalesPoint {
  date: string;
  sales: number;
}

interface SalesSparklineProps {
  points: SalesPoint[];
  width?: number;
  height?: number;
  detailed?: boolean;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function formatDay(iso: string): string {
  const [, , d] = iso.split("-");
  return String(parseInt(d, 10));
}

function formatTooltipDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function formatCurrencyCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatCurrencyExact(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTick(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return Math.round(n).toString();
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * base;
}

export function SalesSparkline({
  points,
  width,
  height,
  detailed = false,
}: SalesSparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = width ?? (detailed ? 280 : 120);
  const H = height ?? (detailed ? 110 : 100);

  if (!points || points.length < 2) {
    return (
      <div
        className="relative shrink-0 rounded-md bg-[#F4F4F2] p-2 border border-stone-200 shadow-sm"
        style={{ width: W + 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1 px-0.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400">
            Sales 7d
          </span>
          <span className="text-[11px] font-bold tabular-nums text-neutral-400">
            —
          </span>
        </div>
        <div
          className="flex items-center justify-center text-[9px] text-neutral-400"
          style={{ width: W, height: H }}
        >
          No data
        </div>
      </div>
    );
  }

  const rawMax = Math.max(...points.map((p) => p.sales));
  const max = niceMax(rawMax);

  const padTop = detailed ? 16 : 4;
  const padBottom = detailed ? 16 : 14;
  const padLeft = detailed ? 22 : 26;
  const padRight = detailed ? 22 : 6;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const yFromValue = (v: number) =>
    padTop + ((max - v) / (max || 1)) * innerH;
  const xFromIdx = (i: number) =>
    padLeft + (i / (points.length - 1)) * innerW;

  const xy = points.map((p, i) => ({
    x: xFromIdx(i),
    y: yFromValue(p.sales),
    ...p,
  }));

  const linePoints = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const total = points.reduce((s, p) => s + p.sales, 0);

  const ticks = [0, max / 2, max];

  // X labels: first (with month), middle (day only), last (day only)
  const midIdx = Math.floor((points.length - 1) / 2);
  const xLabels = [
    { idx: 0, text: formatMonthDay(points[0].date), anchor: "start" as const },
    { idx: midIdx, text: formatDay(points[midIdx].date), anchor: "middle" as const },
    { idx: points.length - 1, text: formatDay(points[points.length - 1].date), anchor: "end" as const },
  ];

  const colW = innerW / (points.length - 1);
  const hovered = hoverIdx != null ? xy[hoverIdx] : null;

  return (
    <div
      className="relative shrink-0 rounded-md bg-[#F4F4F2] p-2 border border-stone-200 shadow-sm"
      style={{ width: W + 16 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between mb-1 px-0.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-500">
          Sales 7d
        </span>
        <span className="text-[11px] font-bold tabular-nums text-neutral-900">
          {formatCurrencyCompact(total)}
        </span>
      </div>

      <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label={`7-day sales: ${formatCurrencyCompact(total)} total`}
        >
          {/* Gradient + area fill (detailed mode) */}
          {detailed && (
            <>
              <defs>
                <linearGradient id="salesSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <polygon
                points={`${linePoints} ${xy[xy.length - 1].x},${padTop + innerH} ${xy[0].x},${padTop + innerH}`}
                fill="url(#salesSparkGrad)"
              />
            </>
          )}

          {/* Gridlines + Y axis labels (compact mode only) */}
          {!detailed && ticks.map((tick, i) => {
            const y = yFromValue(tick);
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={padLeft}
                  x2={W - padRight}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
                <text
                  x={padLeft - 4}
                  y={y + 3}
                  fontSize={8}
                  fill="#737373"
                  textAnchor="end"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={detailed ? 2 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {xy.map((p, i) => {
            const isLast = i === xy.length - 1;
            const isHovered = i === hoverIdx;
            const r = detailed ? (isHovered ? 3.5 : 3) : (isHovered ? 3 : isLast ? 2.5 : 2);
            return (
              <circle
                key={p.date}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={detailed || isLast || isHovered ? "var(--brand)" : "#ffffff"}
                stroke="var(--brand)"
                strokeWidth={1}
              />
            );
          })}

          {/* Per-point value + date labels (detailed mode) */}
          {detailed && xy.map((p, i) => (
            <g key={`label-${p.date}`}>
              <text
                x={p.x}
                y={Math.max(p.y - 6, 9)}
                fontSize={8}
                fill="#171717"
                textAnchor="middle"
                className="font-bold tabular-nums"
              >
                {formatCurrencyCompact(p.sales)}
              </text>
              <text
                x={p.x}
                y={H - 4}
                fontSize={7}
                fill="#737373"
                textAnchor="middle"
                className="tabular-nums"
              >
                {i === 0 ? formatMonthDay(p.date) : formatDay(p.date)}
              </text>
            </g>
          ))}

          {/* Hover capture columns */}
          {xy.map((p, i) => (
            <rect
              key={`hover-${p.date}`}
              x={p.x - colW / 2}
              y={padTop}
              width={colW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              style={{ cursor: "default" }}
            />
          ))}

          {/* X axis labels (compact mode only) */}
          {!detailed && xLabels.map((label, i) => (
            <text
              key={`xlabel-${i}`}
              x={xFromIdx(label.idx)}
              y={H - 2}
              fontSize={8}
              fill="#737373"
              textAnchor={label.anchor}
            >
              {label.text}
            </text>
          ))}
        </svg>

        {hovered && (
          <div
            className="absolute pointer-events-none z-20 bg-neutral-900 text-white rounded px-2 py-1 shadow-lg whitespace-nowrap"
            style={{
              left: hovered.x,
              top: Math.max(hovered.y - 6, 4),
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="text-[9px] text-neutral-300 leading-tight">
              {formatTooltipDate(hovered.date)}
            </div>
            <div className="text-[11px] font-bold tabular-nums leading-tight">
              {formatCurrencyExact(hovered.sales)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
