"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function BrandVoiceMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Brand Voice"
      >
        <span className="font-bold text-sidebar-foreground">Brand</span>
        <span className="font-normal text-brand">Voice</span>
      </h1>
    </PageMetaSlot>
  );
}
