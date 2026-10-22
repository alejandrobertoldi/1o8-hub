"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function ProductDetailMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Product Detail"
      >
        <span className="font-bold text-sidebar-foreground">Product</span>
        <span className="font-normal text-brand">Detail</span>
      </h1>
    </PageMetaSlot>
  );
}
