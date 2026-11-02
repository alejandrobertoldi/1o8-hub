/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientGantt } from "@/components/clients/client-gantt";
import { PageHeaderSlot } from "@/components/layout/page-header-slot";

export default function TimelinePage() {
  const { clientIdCode } = useParams<{ clientIdCode: string }>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeaderSlot>
        <Link
          href={`/clients/${clientIdCode}`}
          className="mr-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={`Back to ${clientIdCode}`}
        >
          <ArrowLeft className="size-3.5" />
        </Link>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Client Timeline"
        >
          <span className="font-bold text-sidebar-foreground">Client</span>
          <span className="font-normal text-brand">Timeline</span>
        </h1>
      </PageHeaderSlot>

      <div className="min-h-0 flex-1">
        <ClientGantt clientIdCode={clientIdCode} />
      </div>
    </div>
  );
}
