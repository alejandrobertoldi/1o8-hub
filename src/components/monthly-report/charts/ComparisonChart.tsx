/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import { CHART_THEME } from './chart-theme';

type Series = { name: string; data: { label: string; value: number }[] };

export function ComparisonChart({
  series, width = 600, height = 200, accent = CHART_THEME.accent,
}: { series: Series[]; width?: number; height?: number; accent?: string }) {
  const pad = { t: 16, r: 16, b: 28, l: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const filterId = React.useId();
  if (series.length === 0 || series[0].data.length < 2) return null;
  const all = series.flatMap(s => s.data.map(d => d.value)).filter(Number.isFinite);
  const max = Math.max(1, Math.max(...all) * 1.1);
  const len = series[0].data.length;
  const xs = Array.from({ length: len }, (_, i) => pad.l + (i * w) / (len - 1));
  const colors = [accent, CHART_THEME.muted];
  const dashes = ['none', '3,3'];
  const yVals = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <filter id={filterId} x="-2%" y="-10%" width="104%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.18" />
        </filter>
      </defs>
      {yVals.map((v, i) => {
        const y = pad.t + h - (v / max) * h;
        return (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + w} y1={y} y2={y} stroke={CHART_THEME.grid} strokeWidth="0.5" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="8" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
              {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {series.map((s, si) => {
        const ys = s.data.map(d => pad.t + h - (d.value / max) * h);
        const pts = xs.map((x, i) => [x, ys[i]] as [number, number]);
        const path = smoothPath(pts);
        return (
          <g key={si} filter={`url(#${filterId})`}>
            <path d={path} fill="none" stroke={colors[si]} strokeWidth="1.6" strokeDasharray={dashes[si]} strokeLinejoin="round" strokeLinecap="round" />
            {s.data.map((_, i) => (
              <circle key={i} cx={xs[i]} cy={ys[i]} r="2" fill={CHART_THEME.paper} stroke={colors[si]} strokeWidth="1" />
            ))}
          </g>
        );
      })}
      {series[0].data.map((d, i) => (
        <text key={i} x={xs[i]} y={height - 10} textAnchor="middle" fontSize="8.5" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
          {d.label}
        </text>
      ))}
    </svg>
  );
}

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
