"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TeamAssignments } from "@/components/team/team-assignments";

export default function TeamAssignmentsPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Team Assignments">
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Assignments</span>
        </h1>
      </PageMetaSlot>
      <TeamAssignments />
    </div>
  );
}
