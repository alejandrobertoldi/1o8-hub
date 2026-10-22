"use client";
import { useEffect, useState } from "react";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import { groupByState, type StateBubble } from "@/lib/fba-inventory-map/state-grouping";

export type StockLayerState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-reports" }
  | { status: "ok"; month: string; months: string[]; data: FbaMapResponse; bubbles: StateBubble[] };

/** What a section reports up to the page so the header can render the stock-month picker. */
export type StockMonths = { months: string[]; month: string | null };

type Got = { ok: true; data: FbaMapResponse } | { ok: false; message: string };

async function getStock(url: string): Promise<Got> {
  const res = await fetch(url);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: `HTTP ${res.status}` };
  }
  if (!res.ok) return { ok: false, message: (json as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
  return { ok: true, data: json as FbaMapResponse };
}

/** Stock for `month` (newest when null). Months are independent of the orders range. No fetch while disabled. */
export function useStockLayer({
  enabled, accountId, asin, month,
}: { enabled: boolean; accountId: string; asin: string | null; month: string | null }): StockLayerState {
  const key = enabled && accountId ? `${accountId}:${asin ?? ""}:${month ?? ""}` : "";
  const [settled, setSettled] = useState<{ key: string; state: StockLayerState } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const qs = new URLSearchParams({ accountId });
    if (month) qs.set("month", month);
    if (asin) qs.set("asin", asin);
    const settle = (state: StockLayerState) => live && setSettled({ key, state });
    getStock(`/api/reports/fba-inventory-map?${qs.toString()}`)
      .then((got) => {
        if (!got.ok) return settle({ status: "error", message: got.message });
        const months = [...got.data.availableMonths].sort().reverse();
        if (months.length === 0) return settle({ status: "no-reports" });
        const data = got.data;
        settle({ status: "ok", month: data.month ?? months[0], months, data, bubbles: groupByState(data.dots, data.totals.units) });
      })
      .catch((e) => settle({ status: "error", message: String(e) }));
    return () => {
      live = false;
    };
  }, [key, accountId, asin, month]);

  if (!key) return { status: "off" };
  if (!settled || settled.key !== key) return { status: "loading" };
  return settled.state;
}
