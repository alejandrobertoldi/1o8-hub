"use client";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { StockLayerState } from "./use-stock-layer";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Status line above the map. `ordersLabel` (Both mode) makes the caption name both periods. */
export function StockLayerStatus({ layer, ordersLabel }: { layer: StockLayerState; ordersLabel?: string }) {
  if (layer.status === "off") return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[12px]">
      {layer.status === "loading" && <span className="text-muted-foreground">Loading stock…</span>}
      {layer.status === "error" && <span className="text-red-600">{layer.message}</span>}
      {layer.status === "no-reports" && <span className="text-muted-foreground">No FBA storage-fee reports for this account</span>}
      {layer.status === "ok" && (
        <>
          {/* one text node, so the caption is findable as a single string */}
          <span className="font-bold">{`${ordersLabel ? `Orders: ${ordersLabel} · ` : ""}Stock: ${monthLabel(layer.month)} snapshot`}</span>
          {layer.data.unplaced.units > 0 && (
            <span className="text-muted-foreground">
              {`${nf.format(layer.data.unplaced.units)} units (${pct(layer.data.unplaced.share)}) couldn't be placed on the map`}
            </span>
          )}
        </>
      )}
    </div>
  );
}
