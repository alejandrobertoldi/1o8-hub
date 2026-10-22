"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TimeInsightsView } from "@/components/time-logs/insights-view";

export default function HoursInsightsPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Hours Insights">
          <span className="font-bold text-sidebar-foreground">Hours</span>
          <span className="font-normal text-brand">Insights</span>
        </h1>
      </PageMetaSlot>
      <TimeInsightsView />
    </div>
  );
}
