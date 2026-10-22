export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
/** Round max up so it splits into 3 clean ticks (template shows max, ⅔, ⅓, 0). */
export function niceAxisMax(max: number): number {
  if (max <= 3) return 3;
  const third = max / 3;
  const mag = 10 ** Math.floor(Math.log10(third));
  const step = STEPS.find((s) => s * mag >= third - 1e-9)! * mag;
  return Math.round(step * 3 * 1e6) / 1e6;
}
export function axisTicks(axisMax: number): number[] {
  return [axisMax, (axisMax * 2) / 3, axisMax / 3, 0];
}

export const BARS = {
  viewW: 880,
  viewH: 380,
  baseline: 280,
  top: 40,
  plotH: 240,
  firstX: 74,
  pitch: 65.85,
  width: 44,
  gridX1: 70,
  gridX2: 860,
  labelX: 60,
  monthY: 306,
} as const;
export function barRects(values: number[], axisMax: number): Rect[] {
  return values.map((v, i) => {
    const height = axisMax > 0 ? (Math.max(v, 0) / axisMax) * BARS.plotH : 0;
    return {
      x: Math.round((BARS.firstX + i * BARS.pitch) * 100) / 100,
      y: BARS.baseline - height,
      width: BARS.width,
      height,
    };
  });
}

export const CUMULATIVE = {
  viewW: 880,
  viewH: 340,
  yTop: 40,
  yBottom: 250,
  x0: 60,
  x1: 860,
  labelX: 52,
  monthY: 284,
} as const;
export const SPEND_SALES = {
  viewW: 880,
  viewH: 250,
  yTop: 40,
  yBottom: 240,
  x0: 50,
  x1: 860,
} as const;

export function linePoints(
  values: number[],
  axisMax: number,
  box: { x0: number; x1: number; yTop: number; yBottom: number }
): Pt[] {
  const n = values.length;
  const h = box.yBottom - box.yTop;
  return values.map((v, i) => ({
    x: n > 1 ? box.x0 + ((box.x1 - box.x0) * i) / (n - 1) : box.x0,
    y: axisMax > 0 ? box.yBottom - (Math.max(v, 0) / axisMax) * h : box.yBottom,
  }));
}
const f = (n: number) => String(Math.round(n * 10) / 10);
export function pathD(points: Pt[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ");
}
export function areaD(points: Pt[], yBottom: number): string {
  if (!points.length) return "";
  const last = points[points.length - 1];
  return `${pathD(points)} L${f(last.x)} ${f(yBottom)} L${f(points[0].x)} ${f(yBottom)} Z`;
}
export function peakIndex(values: number[]): number {
  let idx = -1;
  values.forEach((v, i) => {
    if (idx < 0 || v > values[idx]) idx = i;
  });
  return idx;
}
export function labelIndexes(n: number, want: number): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: want }, (_, i) => Math.round((i * (n - 1)) / (want - 1)));
}
