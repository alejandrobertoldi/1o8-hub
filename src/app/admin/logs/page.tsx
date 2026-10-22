"use client";

import { Suspense } from "react";
import { EventLogFeed } from "@/components/admin/event-log-feed";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function AdminLogsPage() {
  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Event Logs"
        >
          <span className="font-bold text-sidebar-foreground">Event</span>
          <span className="font-normal text-brand">Logs</span>
        </h1>
      </PageMetaSlot>
      <Suspense>
        <EventLogFeed />
      </Suspense>
    </div>
  );
}
