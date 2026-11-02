"use client";

import { fmtInt } from "@/lib/formatters";

interface Props {
  needsAction: number;
  unitsToSend: number;
  overstockSkus: number;
  overstockUnits: number;
  lastSent: string | null; // YYYY-MM-DD
}

const CARD = "rounded-[18px] border border-stone-200 bg-card px-4 py-3 dark:border-zinc-800";
const LABEL = "text-[10px] font-bold text-muted-foreground";

export function SummaryStrip({ needsAction, unitsToSend, overstockSkus, overstockUnits, lastSent }: Props) {
  const items: [string, string][] = [
    ["SKUs needing action", fmtInt(needsAction)],
    ["Units to send", fmtInt(unitsToSend)],
    ["Overstock", `${fmtInt(overstockSkus)} SKUs · ${fmtInt(overstockUnits)} units`],
    ["Last sent", lastSent ?? "Never"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className={CARD}>
          <div className={LABEL}>{label}</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}
