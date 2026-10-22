/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import { CHART_THEME } from './chart-theme';

type Axis = 'left' | 'right';

export interface MultiLineSeries {
  name: string;
  color: string;
  /** Which y-axis this series scales against. Default 'left'. */
  axis?: Axis;
  /** Optional dash pattern for stroke-dasharray. */
  dash?: string;
  data: { label: string; value: number }[];
}

/**
 * Multi-series line chart with optional dual y-axes.
 *
 * Used by the Campaign Manager section to plot impressions (left axis, large
 * counts) against ad spend / ad revenue (right axis, dollars) on a single chart
 * — same shape as Amazon Seller Central's Campaign Manager performance graph.
 *
 * Each series picks its own axis via `axis: 'left' | 'right'`. The two scales
 * are independent so different magnitudes share one chart cleanly.
 */
export function MultiLineChart({
  series,
  width = 600,
  height = 220,
  leftLabel,
  rightLabel,
  formatLeft,
  formatRight,
}: {
  series: MultiLineSeries[];
  width?: number;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
  formatLeft?: (v: number) => string;
  formatRight?: (v: number) => string;
}) {
  const pad = { t: 16, r: 56, b: 28, l: 56 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const filterId = React.useId();

  const validSeries = series.filter(s => Array.isArray(s.data) && s.data.length >= 2);
  if (validSeries.length === 0) return null;
  series = validSeries;

  const len = series[0].data.length;
  const xs = Array.from({ length: len }, (_, i) => pad.l + (i * w) / (len - 1));

  const leftSeries  = series.filter(s => (s.axis ?? 'left') === 'left');
  const rightSeries = series.filter(s => s.axis === 'right');

  const maxOf = (ss: MultiLineSeries[]): number => {
    const all = ss.flatMap(s => s.data.map(d => d.value)).filter(Number.isFinite);
    if (all.length === 0) return 1;
    return Math.max(1, Math.max(...all) * 1.1);
  };
  const leftMax = maxOf(leftSeries);
  const rightMax = maxOf(rightSeries);

  const fmtL = formatLeft ?? defaultFormat;
  const fmtR = formatRight ?? defaultFormat;

  const ticks = Array.from({ length: 5 }, (_, i) => i / 4);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <filter id={filterId} x="-2%" y="-10%" width="104%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.18" />
        </filter>
      </defs>
      {ticks.map((t, i) => {
        const y = pad.t + h - t * h;
        const lv = leftMax * t;
        const rv = rightMax * t;
        return (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + w} y1={y} y2={y} stroke={CHART_THEME.grid} strokeWidth="0.5" />
            {leftSeries.length > 0 && (
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="8" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
                {fmtL(lv)}
              </text>
            )}
            {rightSeries.length > 0 && (
              <text x={pad.l + w + 6} y={y + 3} textAnchor="start" fontSize="8" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
                {fmtR(rv)}
              </text>
            )}
          </g>
        );
      })}
      {series.map((s, si) => {
        const max = (s.axis === 'right' ? rightMax : leftMax);
        const ys = s.data.map(d => pad.t + h - (d.value / max) * h);
        const points = xs.map((x, i) => [x, ys[i]] as [number, number]);
        const path = smoothPath(points);
        return (
          <g key={si} filter={`url(#${filterId})`}>
            <path
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth="1.6"
              strokeDasharray={s.dash ?? 'none'}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.data.map((_, i) => (
              <circle key={i} cx={xs[i]} cy={ys[i]} r="2" fill={CHART_THEME.paper} stroke={s.color} strokeWidth="1" />
            ))}
          </g>
        );
      })}
      {series[0].data.map((d, i) => (
        <text key={i} x={xs[i]} y={height - 10} textAnchor="middle" fontSize="8.5" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
          {d.label}
        </text>
      ))}
      {leftLabel && leftSeries.length > 0 && (
        <text x={pad.l} y={pad.t - 6} textAnchor="start" fontSize="8.5" fontWeight="600" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
          {leftLabel}
        </text>
      )}
      {rightLabel && rightSeries.length > 0 && (
        <text x={pad.l + w} y={pad.t - 6} textAnchor="end" fontSize="8.5" fontWeight="600" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
          {rightLabel}
        </text>
      )}
    </svg>
  );
}

function defaultFormat(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return v.toFixed(0);
}

/**
 * Catmull-Rom → cubic Bezier smoothing with tension=0.5 (centripetal-ish).
 * Produces an SVG path string that hits every input point with smooth curves
 * between them. Falls back to a straight line for ≤2 points.
 */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  const t = 0.18;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}
