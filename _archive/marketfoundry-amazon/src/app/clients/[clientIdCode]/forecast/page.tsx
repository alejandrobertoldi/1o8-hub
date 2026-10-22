/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function ClientForecastPage({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const { clientIdCode } = React.use(params);

  const { data: forecastData, isLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${clientIdCode}`);
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Sales Forecast"
        >
          <span className="font-bold text-sidebar-foreground">Sales</span>
          <span className="font-normal text-brand">Forecast</span>
        </h1>
      </PageMetaSlot>
      {forecastData ? (
        <ForecastEditor data={forecastData} />
      ) : null}
    </div>
  );
}
