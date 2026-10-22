"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { UserDetail } from "@/components/team/user-detail";

export default function TeamUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // Next 16 passes params as a Promise; `use` unwraps it in a client component.
  const { userId } = use(params);

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <div className="flex items-center gap-3">
          <Link
            href="/team"
            className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label="Back to team directory"
            title="Back to team directory"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Team Member"
          >
            <span className="font-bold text-sidebar-foreground">Team</span>
            <span className="font-normal text-brand">Member</span>
          </h1>
        </div>
      </PageMetaSlot>
      <UserDetail userId={userId} />
    </div>
  );
}
