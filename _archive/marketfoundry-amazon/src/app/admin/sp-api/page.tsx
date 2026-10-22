"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SPAPICredentials } from "@/components/admin/sp-api-credentials";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function SPAPICredentialsPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="SP API"
        >
          <span className="font-bold text-sidebar-foreground">SP</span>
          <span className="font-normal text-brand">API</span>
        </h1>
      </PageMetaSlot>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        }
      >
        <SPAPICredentials />
      </Suspense>
    </div>
  );
}
