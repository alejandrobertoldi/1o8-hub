import { US_STATE_PATHS } from "@/lib/us-map-paths";

/** `us-map-paths.ts` uses only absolute M/L/Z commands with one-decimal pairs. */
export function pathVertices(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

/** Rings split on M, for point-in-polygon. */
function rings(d: string): [number, number][][] {
  return d
    .split("M")
    .filter((s) => s.trim())
    .map((s) => pathVertices(s));
}

const key = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;

/** Vertices present in EVERY listed state's path (a tripoint / quadripoint). */
export function sharedVertices(codes: string[]): [number, number][] {
  const sets = codes.map((c) => new Set(pathVertices(US_STATE_PATHS[c] ?? "").map(key)));
  const [first, ...rest] = sets;
  if (!first) return [];
  return [...first]
    .filter((k) => rest.every((s) => s.has(k)))
    .map((k) => k.split(",").map(Number) as [number, number]);
}

/** Even-odd ray cast across all rings (islands and holes both handled). */
export function pointInPath(d: string, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings(d)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function distanceToPath(d: string, x: number, y: number): number {
  let best = Infinity;
  for (const [vx, vy] of pathVertices(d)) best = Math.min(best, Math.hypot(vx - x, vy - y));
  return best;
}
