"use client";

import { useSession } from "next-auth/react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TeamReadiness } from "@/components/team/team-readiness";
import { hasAdminPowers } from "@/lib/roles";

export default function TeamReadinessPage() {
  const { data: session } = useSession();
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Team Readiness">
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Readiness</span>
        </h1>
      </PageMetaSlot>
      <TeamReadiness isAdmin={hasAdminPowers(session?.user?.role)} />
    </div>
  );
}
