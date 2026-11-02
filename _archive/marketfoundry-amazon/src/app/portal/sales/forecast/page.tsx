/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";

function ForecastForClient({ clientIdCode, readOnly }: { clientIdCode: string; readOnly: boolean }) {
  const { data: forecastData, isLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast-portal", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${encodeURIComponent(clientIdCode)}`);
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

  return forecastData ? <ForecastEditor data={forecastData} readOnly={readOnly} /> : null;
}

// One forecast per visible client, stacked in assignment order.
export default function PortalForecastPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const readOnly = role === "client" || role === "prospect";

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
            aria-label="Sales&PPC Forecast"
          >
            <span className="font-bold text-sidebar-foreground">Sales&PPC</span>
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
        {(code) => <ForecastForClient clientIdCode={code} readOnly={readOnly} />}
      </PortalStackedClients>
    </div>
  );
}
