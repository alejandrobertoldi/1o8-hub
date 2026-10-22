"use client";

import { SyncDashboard } from "@/components/publish/sync-dashboard";
import { PublishHistory } from "@/components/publish/publish-history";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

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
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <p className="text-sm text-muted-foreground">
          Monitor auto-sync to BigQuery, review pending changes, explore and export table data.
        </p>
      </div>
      <SyncDashboard />
      <PublishHistory />
    </div>
  );
}
