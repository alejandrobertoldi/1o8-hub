"use client";

import { useSession } from "next-auth/react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { HoursDashboard } from "@/components/admin/hours-dashboard";
import { hasAdminPowers } from "@/lib/roles";

/** Team-wide time analytics with export (from MarketFoundry's Admin Hours). Admin and up. */
export default function HoursAnalyticsPage() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;
  if (!hasAdminPowers(session?.user?.role)) {
    return <div className="p-8 text-sm text-muted-foreground">You don&apos;t have access to hours analytics.</div>;
  }

  return (
    <div>
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Hours Analytics">
          <span className="font-bold text-sidebar-foreground">Hours</span>
          <span className="font-normal text-brand">Analytics</span>
        </h1>
      </PageMetaSlot>
      <HoursDashboard />
    </div>
  );
}
