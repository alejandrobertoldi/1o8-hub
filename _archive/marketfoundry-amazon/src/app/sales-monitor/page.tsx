/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import SalesMonitor from "@/components/ppc/sales-monitor";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClientOption {
  clientIdCode: string;
  clientName: string;
}

export default function SalesMonitorPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const { data: clients, isLoading } = useQuery<ClientOption[]>({
    queryKey: ["ppc-overview"],
    queryFn: async () => {
      const res = await fetch("/api/ppc/overview");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.clients || []).map((c: ClientOption) => ({
        clientIdCode: c.clientIdCode,
        clientName: c.clientName,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeClient = selectedClient || clients?.[0]?.clientIdCode || "";

  return (
    <div className="p-6 space-y-4">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Sales Monitor"
        >
          <span className="font-bold text-sidebar-foreground">Sales</span>
          <span className="font-normal text-brand">Monitor</span>
        </h1>
      </PageMetaSlot>
      <div className="flex items-center gap-4">
        {isLoading ? (
          <LoadingPlaceholder className="h-9 w-48" />
        ) : clients && clients.length > 0 ? (
          <Select value={activeClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {activeClient ? (
        <SalesMonitor key={activeClient} clientIdCode={activeClient} />
      ) : (
        <p className="text-muted-foreground text-sm">No clients available.</p>
      )}
    </div>
  );
}
