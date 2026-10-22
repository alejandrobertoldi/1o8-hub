"use client";
import { BARS, CUMULATIVE, SPEND_SALES, niceAxisMax, axisTicks, barRects, linePoints, pathD, areaD, peakIndex, labelIndexes } from "@/lib/case-study/kit/chart-geometry";
import type { Series, ChannelBlock } from "@/lib/case-study/kit/metrics";
import { usd, monthLetter, monthShort } from "@/lib/case-study/kit/display";

const GRID = "#4A4646", AXIS = "#9FB3B6", TICK = "#CBD6D8", ORANGE = "#F7BF1D", TEAL = "#5FA6B5", INK = "#2C2B35";
const tickLabel = (v: number) => (v === 0 ? "0" : usd(v, "detailed"));

export function SalesBars({ series }: { series: Series }) {
  const vals = series.map((s) => s.value);
  const max = niceAxisMax(Math.max(0, ...vals));
  const ticks = axisTicks(max);
  const rects = barRects(vals, max);
  const gridY = [40, 120, 200, 280];
  return (
    <svg viewBox={`0 0 ${BARS.viewW} ${BARS.viewH}`} style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <g stroke={GRID} strokeWidth="1">{gridY.map((y) => <line key={y} x1={BARS.gridX1} y1={y} x2={BARS.gridX2} y2={y} />)}</g>
      <g fill={AXIS} fontFamily="Outfit" fontSize="20" textAnchor="end">
        {ticks.map((t, i) => <text key={i} x={BARS.labelX} y={gridY[i] + 6}>{tickLabel(t)}</text>)}
      </g>
      <g>{rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={ORANGE} rx="2" />)}</g>
      <g fill={TICK} fontFamily="Outfit" fontSize="19" textAnchor="middle">
        {series.map((s, i) => <text key={s.month} x={Math.round((rects[i].x + BARS.width / 2) * 10) / 10} y={BARS.monthY}>{monthLetter(s.month)}</text>)}
      </g>
    </svg>
  );
}

export function CumulativeCurve({ series }: { series: Series }) {
  const vals = series.map((s) => s.value);
  const max = niceAxisMax(Math.max(0, ...vals));
  const ticks = axisTicks(max);
  const pts = linePoints(vals, max, CUMULATIVE);
  const gridY = [40, 110, 180, 250];
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${CUMULATIVE.viewW} ${CUMULATIVE.viewH}`} style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <defs><linearGradient id="snsFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity=".30" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
      <g stroke={GRID} strokeWidth="1">{gridY.map((y) => <line key={y} x1={CUMULATIVE.x0} y1={y} x2={CUMULATIVE.x1} y2={y} />)}</g>
      <g fill={AXIS} fontFamily="Outfit" fontSize="20" textAnchor="end">
        {ticks.map((t, i) => <text key={i} x={CUMULATIVE.labelX} y={gridY[i] + 6}>{tickLabel(t)}</text>)}
      </g>
      {pts.length > 0 && <>
        <path d={areaD(pts, CUMULATIVE.yBottom)} fill="url(#snsFill)" />
        <path d={pathD(pts)} fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={end.x} cy={end.y} r="9" fill={ORANGE} /><circle cx={end.x} cy={end.y} r="4.5" fill={INK} />
      </>}
      <g fill={AXIS} fontFamily="Outfit" fontSize="19" textAnchor="middle">
        {labelIndexes(series.length, 5).map((i) => <text key={i} x={Math.round(pts[i].x)} y={CUMULATIVE.monthY}>{monthShort(series[i].month)}</text>)}
      </g>
    </svg>
  );
}

export function SpendSalesLines({ block, gradientId }: { block: ChannelBlock; gradientId: string }) {
  const sales = block.monthly.map((m) => m.sales), spend = block.monthly.map((m) => m.spend);
  const max = Math.max(1, ...sales, ...spend) * 1.05;
  const sp = linePoints(sales, max, SPEND_SALES), pp = linePoints(spend, max, SPEND_SALES);
  const peak = peakIndex(sales);
  return (
    <svg viewBox={`0 0 ${SPEND_SALES.viewW} ${SPEND_SALES.viewH}`} preserveAspectRatio="none" style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity=".30" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
      <g stroke={GRID} strokeWidth="1">{[40, 110, 180, 240].map((y) => <line key={y} x1={SPEND_SALES.x0} y1={y} x2={SPEND_SALES.x1} y2={y} />)}</g>
      {sp.length > 0 && <>
        <path d={areaD(sp, SPEND_SALES.yBottom)} fill={`url(#${gradientId})`} />
        <path d={pathD(pp)} fill="none" stroke={TEAL} strokeWidth="3" />
        <path d={pathD(sp)} fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={sp[peak].x} cy={sp[peak].y} r="8" fill={ORANGE} /><circle cx={sp[peak].x} cy={sp[peak].y} r="4" fill={INK} />
      </>}
    </svg>
  );
}

export function MonthTicks({ months, want }: { months: string[]; want: number }) {
  return <>{labelIndexes(months.length, want).map((i) => <span key={i}>{monthShort(months[i])}</span>)}</>;
}
