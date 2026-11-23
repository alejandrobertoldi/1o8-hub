import type { ChartSeries, DailyPoint, MonthPoint } from "@/lib/client-report/types";
import { periodShortLabel } from "@/lib/client-report/period";
import { fmtShort } from "./format";

/**
 * Plain SVG charts for the report: they render the same on screen and in the
 * PDF (no measuring, no animation). Colors are fixed, not theme tokens.
 */

const INK = "#2C2B35";
const YELLOW = "#F7BF1D";
const BAR = "#D8D7DC";
const SLATE = "#6E6C77";

const W = 640;

function scale(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(0, ...nums);
  const min = Math.min(0, ...nums);
  return { max, min, span: max - min || 1 };
}

/** Bars per month; the report month (last bar) in yellow with its value. */
export function MonthBars({ series, height = 190 }: { series: ChartSeries<MonthPoint>; height?: number }) {
  const pts = series.points;
  const top = 22;
  const bottom = 22;
  const plot = height - top - bottom;
  const { min, span } = scale(pts.map((p) => p.value));
  const slot = W / pts.length;
  const bw = Math.min(34, slot * 0.62);
  const y = (v: number) => top + plot - ((v - min) / span) * plot;
  const zero = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`${series.label} by month`}>
      <line x1={0} x2={W} y1={zero} y2={zero} stroke={BAR} strokeWidth={1} />
      {pts.map((p, i) => {
        const x = i * slot + (slot - bw) / 2;
        const last = i === pts.length - 1;
        if (p.value === null) return null;
        const yy = y(p.value);
        return (
          <g key={p.period}>
            <rect x={x} y={Math.min(yy, zero)} width={bw} height={Math.max(1, Math.abs(zero - yy))} rx={3} fill={last ? YELLOW : BAR} />
            {(last || pts.length <= 6) && (
              <text x={x + bw / 2} y={Math.min(yy, zero) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>
                {fmtShort(p.value, series.unit)}
              </text>
            )}
          </g>
        );
      })}
      {pts.map((p, i) => (
        <text key={p.period} x={i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={SLATE} fontWeight={i === pts.length - 1 ? 700 : 400}>
          {periodShortLabel(p.period)}
        </text>
      ))}
    </svg>
  );
}

/** Thin bars per day of the month, with the best day labelled. */
export function DailyBars({ series, height = 150 }: { series: ChartSeries<DailyPoint>; height?: number }) {
  const pts = series.points;
  const top = 20;
  const bottom = 20;
  const plot = height - top - bottom;
  const { min, span } = scale(pts.map((p) => p.value));
  const slot = W / pts.length;
  const bw = Math.max(2, slot * 0.66);
  const y = (v: number) => top + plot - ((v - min) / span) * plot;
  const zero = y(0);
  let best = -1;
  pts.forEach((p, i) => {
    if (p.value !== null && (best === -1 || p.value > (pts[best].value ?? -Infinity))) best = i;
  });
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`${series.label} by day`}>
      <line x1={0} x2={W} y1={zero} y2={zero} stroke={BAR} strokeWidth={1} />
      {pts.map((p, i) => {
        if (p.value === null) return null;
        const yy = y(p.value);
        const x = i * slot + (slot - bw) / 2;
        return (
          <g key={p.day}>
            <rect x={x} y={Math.min(yy, zero)} width={bw} height={Math.max(1, Math.abs(zero - yy))} rx={1.5} fill={i === best ? YELLOW : INK} opacity={i === best ? 1 : 0.85} />
            {i === best && (
              <text x={Math.min(Math.max(x + bw / 2, 24), W - 24)} y={Math.min(yy, zero) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>
                {fmtShort(p.value, series.unit)}
              </text>
            )}
          </g>
        );
      })}
      {pts.map((p, i) =>
        i === 0 || (i + 1) % 5 === 0 ? (
          <text key={p.day} x={i * slot + slot / 2} y={height - 5} textAnchor="middle" fontSize={10} fill={SLATE}>
            {Number(p.day.slice(8))}
          </text>
        ) : null,
      )}
    </svg>
  );
}
