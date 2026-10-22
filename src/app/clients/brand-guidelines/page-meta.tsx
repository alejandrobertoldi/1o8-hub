"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function BrandGuidelinesIndexMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Brand Guidelines"
      >
        <span className="font-bold text-sidebar-foreground">Brand</span>
        <span className="font-normal text-brand">Guidelines</span>
      </h1>
    </PageMetaSlot>
  );
}
