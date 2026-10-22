"use client";
import type { DivisionRow } from "@/lib/fba-inventory-map/types";

/** ±5 points is a starting guess (spec §5); one constant to tune. */
export const GAP_THRESHOLD_PTS = 5;

export function gapTone(gapPts: number): "red" | "amber" | "green" {
  if (gapPts < -GAP_THRESHOLD_PTS) return "red";
  if (gapPts > GAP_THRESHOLD_PTS) return "green";
  return "amber";
}

export const GAP_TONE_CLASS: Record<ReturnType<typeof gapTone>, string> = {
  red: "bg-red-50 text-red-600 border-red-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  green: "bg-emerald-50 text-emerald-700 border-emerald-300",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function DivisionCallout({ rows }: { rows: DivisionRow[] }) {
  return (
    <section data-testid="division-callout" className="rounded-[18px] border border-stone-200 bg-card p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Placement vs demand</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">By US Census division. Stock share is of placed units only.</p>
      <div className="mt-3 space-y-1.5">
        <div className="grid grid-cols-[1fr_80px_80px_90px] text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <span>Division</span><span className="text-right">Demand</span><span className="text-right">Stock</span><span className="text-right">Gap</span>
        </div>
        {rows.map((r) => (
          <div key={r.division} className="grid grid-cols-[1fr_80px_80px_90px] items-center text-[13px]">
            <span>{r.division}</span>
            <span className="text-right tabular-nums">{pct(r.demandShare)}</span>
            <span className="text-right tabular-nums">{pct(r.stockShare)}</span>
            <span className="text-right">
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${GAP_TONE_CLASS[gapTone(r.gapPts)]}`}>
                {r.gapPts > 0 ? "+" : ""}{r.gapPts.toFixed(1)} pts
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
