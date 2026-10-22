/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import { CHART_THEME } from './chart-theme';

export function BarChart({
  data, width = 600, height = 180, accent = CHART_THEME.accent,
}: {
  data: { label: string; value: number; highlight?: boolean }[];
  width?: number; height?: number; accent?: string;
}) {
  const pad = { t: 16, r: 16, b: 28, l: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.value)) * 1.15;
  const bw = (w / data.length) * 0.6;
  const gap = (w / data.length) * 0.4;
  const yVals = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
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
      {data.map((d, i) => {
        const x = pad.l + (i * w) / data.length + gap / 2;
        const bh = (d.value / max) * h;
        const y = pad.t + h - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={d.highlight ? accent : CHART_THEME.ink} />
            <text x={x + bw / 2} y={height - 10} textAnchor="middle" fontSize="8.5" fill={CHART_THEME.muted} fontFamily={CHART_THEME.font}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
