"use client";

import Image from "next/image";
import { Fragment, useMemo } from "react";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { Sku } from "@/components/sku";
import { SummarizedTitle } from "@/components/summarized-title";
import { RecBreakdown, StatusBadge, variationOf, withSize } from "./inventory-forecast-table";
import { FinalCell } from "./inventory-final/final-cell";
import { describeMethod } from "@/lib/inventory/rec-settings";
import type { PortalSnapshotRow, SnapshotHeader } from "@/lib/inventory/snapshot";

const TH = "px-3 py-2 text-right text-[10px] font-bold text-muted-foreground";

/** Live catalog fields for a sent row. The snapshot stores only ASIN/SKU/name/image,
 *  so variation, status and the summarized title come from today's inventory data. */
export interface SnapshotProductInfo {
  asin: string;
  sku: string;
  listing_status?: string;
  summarized_title?: string;
  size?: string;
  variation_name?: string;
  variation_id?: string;
}

const EMPTY: SnapshotProductInfo[] = [];

export function InventorySentSnapshot({
  header, rows, products = EMPTY,
}: { header: SnapshotHeader; rows: PortalSnapshotRow[]; products?: SnapshotProductInfo[] }) {
  // Same grouping as the hub table: each variation sits where its first row is.
  const view = useMemo(() => {
    const info = new Map(products.map((p) => [`${p.asin}|${p.sku}`, p]));
    const items = rows.map((r) => ({ r, info: info.get(`${r.asin}|${r.sku}`) }));
    const rank = new Map<string, number>();
    items.forEach((it, i) => { const g = variationOf(it.info ?? {}); if (!rank.has(g)) rank.set(g, i); });
    return items.toSorted((a, b) => rank.get(variationOf(a.info ?? {}))! - rank.get(variationOf(b.info ?? {}))!);
  }, [rows, products]);
  const grouped = view.some((v) => variationOf(v.info ?? {}));

  return (
    <div className="rounded-[18px] border border-stone-200 bg-card dark:border-zinc-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-portal-accent">Inventory recommendation</span>
        <span className="text-[10px] font-bold text-muted-foreground">Recommendation sent {header.sentAt.slice(0, 10)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className={`${TH} text-left`}>Product</th>
              <th className={`${TH} min-w-[150px]`}>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {view.map(({ r, info }, idx) => {
              const group = variationOf(info ?? {});
              const newGroup = grouped && (idx === 0 || variationOf(view[idx - 1].info ?? {}) !== group);
              const groupRows = newGroup ? view.filter((v) => variationOf(v.info ?? {}) === group) : [];
              const groupIds = [...new Set(groupRows.map((v) => (v.info?.variation_id ?? "").trim()).filter(Boolean))].join(", ");
              return (
              <Fragment key={`${r.asin}|${r.sku}`}>
              {newGroup && (
                <tr className="border-b border-border bg-muted/40">
                  <td colSpan={2} className="px-3 py-2">
                    <div className="text-sm font-bold text-foreground">
                      {group || "No variation"} <span className="text-[10px] font-medium text-muted-foreground">· {groupRows.length} SKU{groupRows.length === 1 ? "" : "s"}</span>
                    </div>
                    {groupIds && <div className="font-mono text-[10px] font-bold text-muted-foreground">{groupIds}</div>}
                  </td>
                </tr>
              )}
              <tr className="border-b border-border">
                <td className="px-3 py-2">
                  {/* DESIGN.md → Product Identity: thumbnail · ASIN (portal accent) + Amazon icon / sky SKU · title lines */}
                  <div className="flex items-start gap-2">
                    {r.mainImageUrl ? (
                      <Image src={r.mainImageUrl} alt={r.productName} width={28} height={28} className="rounded object-cover" unoptimized />
                    ) : (
                      <div className="size-7 rounded bg-muted" />
                    )}
                    <div className="shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-portal-accent">{r.asin}</span>
                        <AmazonPdpLink asin={r.asin} />
                      </div>
                      <Sku sku={r.sku} className="text-[10px]" />
                      {info?.listing_status && <div className="mt-1"><StatusBadge status={info.listing_status} /></div>}
                    </div>
                    <SummarizedTitle title={withSize(info?.summarized_title || r.productName, info?.size ?? "")} layout="lines" className="w-[180px] text-[11px] leading-tight" />
                  </div>
                </td>
                {/* Same cell as the hub, from the numbers stored when it was sent. No
                    override flag or reason: the client sees only what was sent. */}
                <td className="px-3 py-2 text-right align-top">
                  <RecBreakdown
                    basis={r.basisUnits}
                    basisName="Basis"
                    basisLabel={describeMethod(header, header.sentAt.slice(0, 10))}
                    stock={r.stockPosition}
                    accent="portal"
                    awdAvail={r.awdAvailable}
                    awdInbound={r.awdInbound}
                    fbaInbound={r.inbound}
                    fbaAvail={r.available}
                    reserved={r.reserved}
                    result={
                      <FinalCell
                        rec={{ basis: r.basisUnits, floorUnits: 0, liveCalc: r.final, final: r.final, overridden: false, isOverstock: r.final < 0, drifted: false }}
                        override={undefined}
                        editable={false}
                        onSave={async () => null}
                        onClear={async () => null}
                      />
                    }
                  />
                </td>
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
