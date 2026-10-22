"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function ClientOverviewMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Client Overview"
      >
        <span className="font-bold text-sidebar-foreground">Client</span>
        <span className="font-normal text-brand">Overview</span>
      </h1>
    </PageMetaSlot>
  );
}
