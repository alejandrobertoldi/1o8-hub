"use client";

import { useSession } from "next-auth/react";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { HolidayDealsBoard } from "@/components/holiday-deals/holiday-deals-board";
import { isHubStaff } from "@/lib/roles";

export default function HolidayDealsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === "loading") return null;
  if (!isHubStaff(role)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You don&apos;t have access to holiday deal planning.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Holiday Deals"
          >
            <span className="font-bold text-sidebar-foreground">Holiday</span>
            <span className="font-normal text-brand">Deals</span>
          </h1>
          <BetaPill />
        </div>
      </PageMetaSlot>
      <HolidayDealsBoard />
    </div>
  );
}
