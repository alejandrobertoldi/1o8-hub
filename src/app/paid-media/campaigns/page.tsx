"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TaskDateCalendar } from "@/components/task-calendar/task-date-calendar";

export default function PaidMediaCampaignsPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Paid Media Campaign Calendar">
          <span className="font-bold text-sidebar-foreground">Campaign</span>
          <span className="font-normal text-brand">Calendar</span>
        </h1>
      </PageMetaSlot>
      <TaskDateCalendar
        tag="Paid Media"
        copy={{
          countLabel: "Campaigns this month",
          completedToggle: "Show launched / completed",
          unscheduledTitle: "No launch date yet",
          source:
            "Source: Asana tasks in the paid media team project, placed on their Go Live Date (the launch date). Updated by the Asana sync (open tasks and tasks completed in the last 14 days).",
        }}
      />
    </div>
  );
}
