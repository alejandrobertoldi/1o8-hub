/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

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
}

export default function HubForecastPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const end = formatDate(new Date());
  const start = daysAgo(7);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["sales-summary-clients-fc", start, end],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary?period=7D&start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const clients: ClientOption[] =
    summaryData?.clients?.map((c: { clientIdCode: string; clientName: string }) => ({
      clientIdCode: c.clientIdCode,
      clientName: c.clientName,
    })) ?? [];

  const activeClient = selectedClient || clients[0]?.clientIdCode || "";

  const { data: forecastData, isLoading: forecastLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast", activeClient],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${activeClient}`);
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      return res.json();
    },
    enabled: !!activeClient,
  });

  const isLoading = summaryLoading || forecastLoading;

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Sales Forecast"
          >
            <span className="font-bold text-sidebar-foreground">Sales</span>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : forecastData ? (
        <ForecastEditor data={forecastData} />
      ) : null}
    </div>
  );
}
