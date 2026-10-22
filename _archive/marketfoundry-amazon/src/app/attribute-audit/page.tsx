/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditDashboard } from "@/components/attributes/audit-dashboard";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function AttributeAuditPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Attribute Library"
          >
            <span className="font-bold text-sidebar-foreground">Attribute</span>
            <span className="font-normal text-brand">Library</span>
          </h1>
          <BetaPill />
        </div>
      </PageMetaSlot>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter mb-2">
          <span className="text-foreground font-bold">Attribute</span>
          <span className="text-brand font-medium">Audit</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Scan products against category definitions to find missing required,
          conditional, and key attributes.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        }
      >
        <AuditDashboard />
      </Suspense>
    </div>
  );
}
