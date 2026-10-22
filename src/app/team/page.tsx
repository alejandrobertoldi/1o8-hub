"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Suspense } from "react";
import { TeamDirectory } from "@/components/team/team-directory";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Team Directory"
        >
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Directory</span>
        </h1>
      </PageMetaSlot>
      {/* TeamDirectory reads ?view= (useSearchParams), which needs a Suspense boundary. */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the team…</p>}>
        <TeamDirectory />
      </Suspense>
    </div>
  );
}
