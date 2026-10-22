"use client";

import { useSession } from "next-auth/react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { HoursTracker } from "@/components/hours/hours-tracker";
import { isHubStaff } from "@/lib/roles";


export default function HoursPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === "loading") return null;
  if (!isHubStaff(role)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You don&apos;t have access to the hours tracker.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="User Hours"
        >
          <span className="font-bold text-sidebar-foreground">User</span>
          <span className="font-normal text-brand">Hours</span>
        </h1>
      </PageMetaSlot>
      <HoursTracker />
    </div>
  );
}
