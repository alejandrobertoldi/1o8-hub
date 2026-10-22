"use client";
import { useMemo, useState } from "react";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";

type Row = { code: string; metro: string; state: string; units: number; share: number; fee: number; tag: "approx." | "unplaced" | null };
type SortKey = "code" | "metro" | "state" | "units" | "share" | "fee";

const STONE = "bg-stone-200 text-stone-500 border-stone-300";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300";

function toRows(data: FbaMapResponse): Row[] {
  const total = data.totals.units;
  const share = (u: number) => (total > 0 ? u / total : 0);
  const rows: Row[] = [];
  for (const d of data.dots) {
    for (const f of d.fcs) {
      // The dot label is the server's placement (fulfillment_centers table, else prefix lookup).
      const metro = d.approximate ? "—" : d.label;
      rows.push({ code: f.code, metro, state: d.state, units: f.units, share: share(f.units), fee: f.fee, tag: d.approximate ? "approx." : null });
    }
  }
  for (const f of data.unplaced.fcs) rows.push({ code: f.code, metro: "—", state: "—", units: f.units, share: share(f.units), fee: f.fee, tag: "unplaced" });
  return rows;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function FcTable({ data }: { data: FbaMapResponse }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "units", dir: -1 });
  const rows = useMemo(() => {
    const r = toRows(data);
    return r.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      return (typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv))) * sort.dir;
    });
  }, [data, sort]);

  const head = (key: SortKey, label: string, right = false) => (
    <th className={`py-2 ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "units" || key === "share" || key === "fee" ? -1 : 1 }))}
        className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
      >
        {label}
      </button>
    </th>
  );

  return (
    <section className="rounded-[18px] border border-stone-200 bg-card p-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr>{head("code", "FC")}{head("metro", "Metro")}{head("state", "State")}{head("units", "Units", true)}{head("share", "Share", true)}{head("fee", "Est. storage fee", true)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-stone-100">
              <td className="py-1.5 font-medium">
                {r.code}
                {r.tag && (
                  <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${r.tag === "unplaced" ? STONE : AMBER}`}>{r.tag}</span>
                )}
              </td>
              <td>{r.metro}</td>
              <td>{r.state === "—" ? "—" : stateDisplayName(r.state)}</td>
              <td className="text-right tabular-nums">{nf.format(r.units)}</td>
              <td className="text-right tabular-nums">{(r.share * 100).toFixed(1)}%</td>
              <td className="text-right tabular-nums">{usd.format(r.fee)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
