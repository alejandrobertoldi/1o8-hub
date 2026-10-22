"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function ImportPageMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Data Import"
      >
        <span className="font-bold text-sidebar-foreground">Data</span>
        <span className="font-normal text-brand">Import</span>
      </h1>
    </PageMetaSlot>
  );
}
