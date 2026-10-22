"use client";
import type { StateFc } from "@/lib/fba-inventory-map/state-grouping";

const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300";
const COLS = "grid-cols-[60px_minmax(0,1fr)_52px_40px_44px]";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** FC rows for one state — shared by the FBA page's StatePanel and Order Geography's stock block. */
export function StateFcList({ fcs }: { fcs: StateFc[] }) {
  if (fcs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className={`grid ${COLS} gap-2 ${MICRO}`}>
        <span>FC</span><span>Place</span><span className="text-right">Units</span><span className="text-right">Share</span><span className="text-right">Fee</span>
      </div>
      {fcs.map((f) => (
        <div key={f.code} data-testid="state-fc-row" className={`grid ${COLS} items-center gap-2 border-t border-stone-100 pt-1.5 text-[13px]`}>
          <span className="font-medium">{f.code}</span>
          {/* Badge sits outside the truncating text so a narrow panel clips the name, never the flag. */}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate" title={f.place}>{f.place}</span>
            {f.approximate && <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${AMBER}`}>approx.</span>}
          </span>
          <span className="text-right tabular-nums">{nf.format(f.units)}</span>
          <span className="text-right tabular-nums">{pct(f.shareOfState)}</span>
          <span className="text-right tabular-nums">{usd.format(f.fee)}</span>
        </div>
      ))}
    </div>
  );
}
