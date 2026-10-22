"use client";
import { monthLabel } from "@/lib/fba-inventory-map/month";

export function StockMonthSelect({ value, months, onChange }: { value: string; months: string[]; onChange: (m: string) => void }) {
  return (
    <select
      aria-label="Stock month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 rounded-md border border-border/40 bg-muted/30 px-2 text-xs font-bold"
    >
      {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  );
}
