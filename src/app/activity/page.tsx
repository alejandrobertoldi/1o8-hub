"use client";

import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function ActivityPage() {
  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Activity Log"
        >
          <span className="font-bold text-sidebar-foreground">Activity</span>
          <span className="font-normal text-brand">Log</span>
        </h1>
      </PageMetaSlot>
      <Suspense>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}
