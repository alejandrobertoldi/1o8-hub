"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AttributeForm } from "@/components/portal/attribute-form";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function PortalAttributesPage() {
  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Attribute Form"
          >
            <span className="font-bold text-sidebar-foreground">Attribute</span>
            <span className="font-normal text-portal-accent">Form</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fill in missing product attributes for your catalog.
          </p>
        </div>
      </PageMetaSlot>
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <AttributeForm />
      </Suspense>
    </div>
  );
}
