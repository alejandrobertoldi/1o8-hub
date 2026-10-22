"use client";

import { useSession } from "next-auth/react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { HoursDashboard } from "@/components/admin/hours-dashboard";

export default function HoursAdminPage() {
  const { data: session, status } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;

  if (status === "loading") return null;
  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You don&apos;t have access to admin hours.
      </div>
    );
  }

  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Admin Hours"
        >
          <span className="font-bold text-sidebar-foreground">Admin</span>
          <span className="font-normal text-brand">Hours</span>
        </h1>
      </PageMetaSlot>
      <HoursDashboard />
    </div>
  );
}
