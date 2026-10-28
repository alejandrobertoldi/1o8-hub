"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { SyncDashboard } from "@/components/publish/sync-dashboard";
import { PublishHistory } from "@/components/publish/publish-history";
import { AacSyncAdmin } from "@/components/admin/aac-sync-admin";
import { TimeOffSyncAdmin } from "@/components/admin/time-off-sync-admin";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasAdminPowers } from "@/lib/roles";

export default function SyncDashboardPage() {
  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Publish Center"
        >
          <span className="font-bold text-sidebar-foreground">Publish</span>
          <span className="font-normal text-brand">Center</span>
        </h1>
      </PageMetaSlot>
      <Suspense>
        <SyncTabs />
      </Suspense>
    </div>
  );
}

const ADMIN_TABS = ["aac", "time-off"] as const;
const TAB_COPY: Record<string, string> = {
  bigquery: "Monitor auto-sync to BigQuery, review pending changes, explore and export table data.",
  aac: "Keep the hub's clients in step with the AAC Google Sheet.",
  "time-off": "Time off from Gusto and the hub, mirrored to the shared time off calendar.",
};

/** BigQuery sync for everyone with access; the AAC sheet and time off tabs for admins. */
function SyncTabs() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const asked = params.get("tab") ?? "";
  const tab = isAdmin && (ADMIN_TABS as readonly string[]).includes(asked) ? asked : "bigquery";

  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(v === "bigquery" ? pathname : `${pathname}?tab=${v}`, { scroll: false })}>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background space-y-3">
        {isAdmin && (
          <TabsList>
            <TabsTrigger value="bigquery">BigQuery</TabsTrigger>
            <TabsTrigger value="aac">AAC Sheet</TabsTrigger>
            <TabsTrigger value="time-off">Time Off</TabsTrigger>
          </TabsList>
        )}
        <p className="text-sm text-muted-foreground">{TAB_COPY[tab]}</p>
      </div>
      <TabsContent value="bigquery" className="space-y-4">
        <SyncDashboard />
        <PublishHistory />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="aac">
          <AacSyncAdmin embedded />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="time-off">
          <TimeOffSyncAdmin />
        </TabsContent>
      )}
    </Tabs>
  );
}
