"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { portalClientQuery, usePortalClientParam } from "@/components/portal/portal-visible-clients";
import { hasPortalAudit } from "@/lib/portal-audits";

function AuditForClient({ clientIdCode }: { clientIdCode: string }) {
  if (!hasPortalAudit(clientIdCode)) {
    return (
      <p className="text-sm text-muted-foreground">No business model audit for this account.</p>
    );
  }
  return (
    <div className="h-[calc(100vh-10rem)] rounded-xl overflow-hidden border border-border/60 bg-white">
      <iframe
        src={`/api/portal/audit${portalClientQuery(clientIdCode)}`}
        className="w-full h-full border-0"
        title="Business Model Audit"
      />
    </div>
  );
}

// One audit per visible client that has one, stacked in assignment order.
function BusinessModelAuditContent() {
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Business Model Audit"
          >
            <span className="font-bold text-sidebar-foreground">BusinessModel</span>
            <span className="font-normal text-portal-accent">Audit</span>
          </h1>
        </div>
      </PageMetaSlot>

      <Link
        href={`/portal/reports${clientParam}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Reports
      </Link>

      <PortalStackedClients>{(code) => <AuditForClient clientIdCode={code} />}</PortalStackedClients>
    </div>
  );
}

export default function BusinessModelAuditPage() {
  return (
    <Suspense>
      <BusinessModelAuditContent />
    </Suspense>
  );
}
