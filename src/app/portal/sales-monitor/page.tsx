"use client";
/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */

import { hasAdminPowers } from "@/lib/roles";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SalesMonitor from "@/components/ppc/sales-monitor";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";

// One Sales Monitor per visible client, stacked. The heading renders once here;
// each SalesMonitor keeps its own "Latest:" stamp next to its own data.
export default function PortalSalesMonitorPage() {
  const { data: session, status } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);

  if (status === "loading") return <LoadingPlaceholder className="h-96" />;

  return (
    <div className="p-6 space-y-4">
      <PageMetaSlot>
        <div className="flex items-center gap-3 w-full min-w-0">
          <Link
            href="/portal/sales"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="size-3" />
            Back to sales
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0"
            aria-label="Sales Monitor"
          >
            <span className="font-bold text-sidebar-foreground">Sales</span>
            <span className="font-normal text-portal-accent">Monitor</span>
            <span className="text-muted-foreground text-xl ml-1.5 font-normal">-30D</span>
          </h1>
        </div>
      </PageMetaSlot>
      <PortalStackedClients
        empty={
          <div className="p-6 text-center text-muted-foreground">
            {isAdmin
              ? "Select a client from the portal dashboard to view their Sales Monitor."
              : "No client assigned to your account."}
          </div>
        }
      >
        {(code) => <SalesMonitor clientIdCode={code} isPortal showPageHeader={false} />}
      </PortalStackedClients>
    </div>
  );
}
