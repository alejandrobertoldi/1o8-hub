/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */
"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { InventoryForecastTable } from "@/components/analytics/inventory-forecast-table";
import { InventorySentSnapshot } from "@/components/analytics/inventory-sent-snapshot";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";
import type { PortalSnapshotRow, SnapshotHeader } from "@/lib/inventory/snapshot";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function InventoryForClient({ clientIdCode }: { clientIdCode: string }) {
  const end = formatDate(new Date());
  const start = daysAgo(7);

  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ["portal-sales-summary-inv", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales-summary?period=7D&start=${start}&end=${end}&client=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) throw new Error("Failed to fetch client data");
      return res.json();
    },
  });

  const accountIds = clientData?.clients?.[0]?.accountIds;

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ["portal-inventory", clientIdCode, start, end, accountIds],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales-summary/inventory?start=${start}&end=${end}&accountIds=${accountIds}`
      );
      if (!res.ok) throw new Error("Failed to fetch inventory data");
      return res.json();
    },
    enabled: !!accountIds,
  });

  // Snapshots are read through /api/portal/* — the only prefix src/proxy.ts lets
  // client/prospect sessions reach. Any failure falls straight back to the
  // read-only table (no retries), but is logged rather than read as "never sent".
  const { data: snapList, isLoading: snapListLoading } = useQuery({
    queryKey: ["portal-inv-snapshots", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/portal/inventory-rec-snapshots?client=${encodeURIComponent(clientIdCode)}`);
      if (!res.ok) {
        console.error(`[portal inventory] snapshot list failed: ${res.status}`);
        return { snapshots: [] as SnapshotHeader[] };
      }
      return (await res.json()) as { snapshots: SnapshotHeader[] };
    },
    retry: false,
  });
  const latestId = snapList?.snapshots?.[0]?.id;
  const { data: latest, isLoading: latestLoading } = useQuery({
    queryKey: ["portal-inv-snapshot", latestId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/inventory-rec-snapshots/${latestId}`);
      if (!res.ok) throw new Error(`Failed to load snapshot: ${res.status}`);
      return (await res.json()) as { snapshot: SnapshotHeader; rows: PortalSnapshotRow[] };
    },
    enabled: !!latestId,
    retry: false,
  });

  if (clientLoading || inventoryLoading || snapListLoading || (!!latestId && latestLoading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (latest) return <InventorySentSnapshot header={latest.snapshot} rows={latest.rows} products={inventoryData?.products} />;

  return (
    <InventoryForecastTable
      products={inventoryData?.products ?? []}
      periodLabel="Last 7 Days"
      clientIdCode={clientIdCode}
      readOnly
    />
  );
}

// One inventory forecast per visible client, stacked in assignment order.
export default function PortalInventoryPage() {
  return (
    <div className="p-6 space-y-4">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/portal/sales"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="size-3" />
            Back to sales
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Inventory Forecast"
          >
            <span className="font-bold text-sidebar-foreground">Inventory</span>
            <span className="font-normal text-portal-accent">Forecast</span>
          </h1>
        </div>
      </PageMetaSlot>
      <PortalStackedClients
        empty={
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            No client assigned.
          </div>
        }
      >
        {(code) => <InventoryForClient clientIdCode={code} />}
      </PortalStackedClients>
    </div>
  );
}
