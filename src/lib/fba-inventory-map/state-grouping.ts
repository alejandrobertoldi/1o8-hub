import { statePoint } from "@/lib/fc-locations";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { Dot, FcRow } from "./types";

export type StateFc = FcRow & { place: string; approximate: boolean; shareOfState: number };
export type StateBubble = {
  state: string;
  name: string;
  x: number;
  y: number;
  units: number;
  fee: number;
  /** Of all stock (same denominator as the stat row and Dot.share). */
  share: number;
  /** Units desc, then code asc. */
  fcs: StateFc[];
  /** Source metro-group dots of this state, units desc then key asc. */
  metros: Dot[];
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** One bubble per state that has at least one FC row; units desc, then state code asc. */
export function groupByState(dots: Dot[], totalUnits: number): StateBubble[] {
  const groups = new Map<string, { units: number; fee: number; rows: Omit<StateFc, "shareOfState">[]; dots: Dot[] }>();
  for (const d of dots) {
    let g = groups.get(d.state);
    if (!g) {
      g = { units: 0, fee: 0, rows: [], dots: [] };
      groups.set(d.state, g);
    }
    g.dots.push(d);
    for (const fc of d.fcs) {
      g.units += fc.units;
      g.fee += fc.fee;
      g.rows.push({ ...fc, place: d.approximate ? "Location approximate" : d.label, approximate: d.approximate });
    }
  }
  return [...groups.entries()]
    .map(([state, g]) => {
      const [x, y] = statePoint(state);
      return {
        state,
        name: stateDisplayName(state),
        x,
        y,
        units: g.units,
        fee: g.fee,
        share: ratio(g.units, totalUnits),
        fcs: g.rows
          .map((r) => ({ ...r, shareOfState: ratio(r.units, g.units) }))
          .sort((a, b) => b.units - a.units || a.code.localeCompare(b.code)),
        metros: [...g.dots].sort((a, b) => b.units - a.units || a.key.localeCompare(b.key)),
      };
    })
    .sort((a, b) => b.units - a.units || a.state.localeCompare(b.state));
}
