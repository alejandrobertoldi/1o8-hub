"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Timesheet } from "@/components/time-logs/timesheet";

export default function HoursPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="My Timesheet">
          <span className="font-bold text-sidebar-foreground">My</span>
          <span className="font-normal text-brand">Timesheet</span>
        </h1>
      </PageMetaSlot>
      <Timesheet />
    </div>
  );
}
