import React from 'react';
import { CHART_THEME } from './chart-theme';

export function Spark({
  data, width = 80, height = 24, accent = CHART_THEME.accent,
}: { data: number[]; width?: number; height?: number; accent?: string }) {
  const filterId = React.useId();
  const max = Math.max(...data);
  const min = Math.min(...data);
  const xs = data.map((_, i) => (i * width) / (data.length - 1));
  const ys = data.map(v => height - ((v - min) / (max - min || 1)) * (height - 4) - 2);
  const pts = xs.map((x, i) => [x, ys[i]] as [number, number]);
  const path = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      <defs>
        <filter id={filterId} x="-5%" y="-15%" width="110%" height="130%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path d={path} fill="none" stroke={CHART_THEME.ink} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2" fill={accent} />
      </g>
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
