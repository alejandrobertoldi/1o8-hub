"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TaskDateCalendar } from "@/components/task-calendar/task-date-calendar";

export default function EmailSendDatesPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Email Send Dates">
          <span className="font-bold text-sidebar-foreground">Send</span>
          <span className="font-normal text-brand">Dates</span>
        </h1>
      </PageMetaSlot>
      <TaskDateCalendar
        tag="Email"
        copy={{
          countLabel: "Sends this month",
          completedToggle: "Show sent / completed",
          unscheduledTitle: "No send date yet",
          source:
            "Source: Asana tasks in the email team project, placed on their Go Live Date (the send date). Updated by the Asana sync (open tasks and tasks completed in the last 14 days).",
        }}
      />
    </div>
  );
}
