/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { InventoryForecastTable } from "@/components/analytics/inventory-forecast-table";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { BetaPill } from "@/components/ui/beta-pill";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

interface ClientOption {
  clientIdCode: string;
  clientName: string;
  accountIds: string[];
}

export default function HubInventoryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>}>
      <HubInventoryContent />
    </Suspense>
  );
}

function HubInventoryContent() {
  // ?client=CODE preselects a client (old /clients/[code]/inventory links redirect here with it).
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedClient, setSelectedClientState] = useState<string>(searchParams.get("client") || "");

  const setSelectedClient = (code: string) => {
    setSelectedClientState(code);
    const params = new URLSearchParams(searchParams.toString());
    params.set("client", code);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const end = formatDate(new Date());
  const start = daysAgo(7);

  // Fetch all clients to build selector
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["sales-summary-clients", start, end],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales-summary?period=7D&start=${start}&end=${end}`
      );
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const clients: ClientOption[] =
    summaryData?.clients?.map((c: { clientIdCode: string; clientName: string; accountIds: string[] }) => ({
      clientIdCode: c.clientIdCode,
      clientName: c.clientName,
      accountIds: c.accountIds,
    })) ?? [];

  // An unknown ?client= code falls back to the first client rather than an empty page.
  const activeClient =
    (clients.some((c) => c.clientIdCode === selectedClient) ? selectedClient : "") ||
    clients[0]?.clientIdCode ||
    "";
  const accountIds = clients.find((c) => c.clientIdCode === activeClient)?.accountIds?.join(",");

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ["hub-inventory", activeClient, start, end, accountIds],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales-summary/inventory?start=${start}&end=${end}&accountIds=${accountIds}`
      );
      if (!res.ok) throw new Error("Failed to fetch inventory data");
      return res.json();
    },
    enabled: !!accountIds,
  });

  return (
    <div className="p-6 lg:p-10 space-y-6">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Inventory Forecast"
          >
            <span className="font-bold text-sidebar-foreground">Inventory</span>
            <span className="font-normal text-brand">Forecast</span>
          </h1>
          <BetaPill />

          {clients.length > 1 && (
            <select
              value={activeClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm ml-auto"
            >
              {clients.map((c) => (
                <option key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName}
                </option>
              ))}
            </select>
          )}
        </div>
      </PageMetaSlot>

      {summaryLoading || inventoryLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <InventoryForecastTable
          products={inventoryData?.products ?? []}
          periodLabel="Last 7 Days"
          clientIdCode={activeClient}
          accountIds={accountIds}
          clientName={clients.find((c) => c.clientIdCode === activeClient)?.clientName}
        />
      )}
    </div>
  );
}
