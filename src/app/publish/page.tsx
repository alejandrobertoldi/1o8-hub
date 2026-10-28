"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { SyncDashboard } from "@/components/publish/sync-dashboard";
import { PublishHistory } from "@/components/publish/publish-history";
import { AacSyncAdmin } from "@/components/admin/aac-sync-admin";
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

/** BigQuery sync for everyone with access; the AAC sheet sync tab for admins. */
function SyncTabs() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const tab = isAdmin && params.get("tab") === "aac" ? "aac" : "bigquery";

  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(v === "aac" ? `${pathname}?tab=aac` : pathname, { scroll: false })}>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background space-y-3">
        {isAdmin && (
          <TabsList>
            <TabsTrigger value="bigquery">BigQuery</TabsTrigger>
            <TabsTrigger value="aac">AAC Sheet</TabsTrigger>
          </TabsList>
        )}
        <p className="text-sm text-muted-foreground">
          {tab === "aac"
            ? "Keep the hub's clients in step with the AAC Google Sheet."
            : "Monitor auto-sync to BigQuery, review pending changes, explore and export table data."}
        </p>
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
    </Tabs>
  );
}
