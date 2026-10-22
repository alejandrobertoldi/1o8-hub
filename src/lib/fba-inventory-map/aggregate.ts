import { projectAlbers } from "@/lib/albers";
import { FC_METROS, metroPoint, normalizeFcCode, resolveFc, statePoint } from "@/lib/fc-locations";
import { stateDisplayName } from "@/lib/reports/order-geography";
import { DIVISIONS, STATE_TO_DIVISION } from "./divisions";
import type { Demand, DemandInput, DivisionRow, Dot, FbaMapBody, FcDirectory, FcPlace, FcRow, StockRow } from "./types";

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function mergeCodes(stock: StockRow[]): FcRow[] {
  const byCode = new Map<string, FcRow>();
  for (const r of stock) {
    const code = normalizeFcCode(r.fc);
    if (!code) continue;
    const cur = byCode.get(code) ?? { code, units: 0, fee: 0 };
    cur.units += Number(r.units) || 0;
    cur.fee += Number(r.fee) || 0;
    byCode.set(code, cur);
  }
  return [...byCode.values()].sort((a, b) => b.units - a.units);
}

function toDemand(input: DemandInput): Demand {
  return input.status === "ok" ? { ...input, note: "includes_fbm" } : input;
}

type Placement = { key: string; label: string; state: string; x: number; y: number; approximate: boolean };

/** Geocoded table row → dot at its city. AK/HI/PR sit in insets, so they use the state label point. */
function fromDirectory(code: string, p: FcPlace): Placement {
  const [x, y] = ["AK", "HI", "PR"].includes(p.state) ? statePoint(p.state) : projectAlbers(p.lat, p.lon);
  const city = p.city ?? code;
  return { key: `city:${p.state}:${city}`, label: `${city}, ${p.state}`, state: p.state, x, y, approximate: false };
}

/** Prefix lookup — only for codes the fulfillment_centers table doesn't have. */
function fromLookup(code: string): Placement | null {
  const r = resolveFc(code);
  if (r.kind === "unplaced") return null;
  if (r.kind === "metro") {
    const [x, y] = metroPoint(r.metro);
    return { key: r.metro, label: FC_METROS[r.metro].name, state: FC_METROS[r.metro].state, x, y, approximate: false };
  }
  const [x, y] = statePoint(r.state);
  return { key: `state:${r.state}`, label: `${stateDisplayName(r.state)} (approx.)`, state: r.state, x, y, approximate: true };
}

/**
 * `directory` is the fulfillment_centers table (US, geocoded). It wins over the prefix
 * lookup: the prefix put 23 of 287 codes in the wrong state (e.g. ABE7 is CA, not PA).
 */
export function aggregate(stock: StockRow[], demandInput: DemandInput, directory: FcDirectory = new Map()): FbaMapBody {
  const fcs = mergeCodes(stock);
  const totalUnits = fcs.reduce((s, f) => s + f.units, 0);
  const totalFee = fcs.reduce((s, f) => s + f.fee, 0);

  const groups = new Map<string, Omit<Dot, "share">>();
  const unplaced: FcRow[] = [];
  for (const fc of fcs) {
    const place = directory.get(fc.code);
    const p = place ? fromDirectory(fc.code, place) : fromLookup(fc.code);
    if (!p) {
      unplaced.push(fc);
      continue;
    }
    let g = groups.get(p.key);
    if (!g) {
      g = { ...p, units: 0, fcs: [] };
      groups.set(p.key, g);
    }
    g.units += fc.units;
    g.fcs.push(fc);
  }

  const dots: Dot[] = [...groups.values()]
    .map((g) => ({ ...g, share: ratio(g.units, totalUnits) }))
    .sort((a, b) => b.units - a.units);
  const placedUnits = dots.reduce((s, d) => s + d.units, 0);
  const unplacedUnits = totalUnits - placedUnits;
  const demand = toDemand(demandInput);

  let divisions: DivisionRow[] | null = null;
  if (demand.status === "ok") {
    const stockBy = new Map<string, number>();
    for (const d of dots) {
      const div = STATE_TO_DIVISION[d.state];
      if (div) stockBy.set(div, (stockBy.get(div) ?? 0) + d.units);
    }
    const demandBy = new Map<string, number>();
    for (const [st, u] of Object.entries(demand.byState)) {
      const div = STATE_TO_DIVISION[st];
      if (div) demandBy.set(div, (demandBy.get(div) ?? 0) + u);
    }
    const mappedDemand = [...demandBy.values()].reduce((a, b) => a + b, 0);
    divisions = DIVISIONS.map((division) => {
      const demandShare = round4(ratio(demandBy.get(division) ?? 0, mappedDemand));
      const stockShare = round4(ratio(stockBy.get(division) ?? 0, placedUnits));
      return { division, demandShare, stockShare, gapPts: Math.round((stockShare - demandShare) * 1000) / 10 };
    }).sort((a, b) => b.demandShare - a.demandShare);
  }

  return {
    dots,
    unplaced: { units: unplacedUnits, share: ratio(unplacedUnits, totalUnits), fcs: unplaced },
    totals: { units: totalUnits, placedUnits, fee: totalFee },
    demand,
    divisions,
  };
}
