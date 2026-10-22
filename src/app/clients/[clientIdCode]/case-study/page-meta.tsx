"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function CaseStudyMeta() {
  return (
    <PageMetaSlot>
      <h1
        className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
        aria-label="Case Study"
      >
        <span className="font-bold text-sidebar-foreground">Case</span>
        <span className="font-normal text-brand">Study</span>
      </h1>
    </PageMetaSlot>
  );
}
