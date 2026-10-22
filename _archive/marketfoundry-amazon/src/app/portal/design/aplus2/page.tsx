"use client";
import { Suspense } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { Aplus2ClientSetsView } from "@/app/design/aplus2/[clientIdCode]/_components/aplus2-client-sets-view";

// One A+ sets view per visible client, stacked. A single client keeps the
// view's own heading (with the client name); with several clients the heading
// renders once here and each block carries the client header instead.
function PortalAplus2Content() {
  const { status } = useSession();
  const { codes, showHeaders, isAdminPreview } = usePortalStackedClients();
  const clientParam = isAdminPreview && codes[0] ? `?client=${encodeURIComponent(codes[0])}` : "";
  const backHref = `/portal/design${clientParam}`;
  const backLabel = "Back to Design Hub";

  if (status === "loading") {
    return (
      <div className="space-y-3 -mt-6 lg:-mt-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className={showHeaders ? "space-y-10 -mt-6 lg:-mt-8" : "space-y-10"}>
      {showHeaders && (
        <PageMetaSlot>
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <Link
              href={backHref}
              className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
              aria-label={backLabel}
              title={backLabel}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <h1
              className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
              aria-label="A+ Content"
            >
              <span className="font-bold text-sidebar-foreground">A+</span>
              <span className="font-normal text-portal-accent">Content</span>
            </h1>
          </div>
        </PageMetaSlot>
      )}
      <PortalStackedClients
        empty={
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <p className="text-sm text-muted-foreground">No client assigned to your account yet.</p>
          </div>
        }
      >
        {(code, { showHeader }) => (
          <Aplus2ClientSetsView
            clientIdCode={code}
            mode="portal"
            backHref={backHref}
            backLabel={backLabel}
            pageHeader={!showHeader}
          />
        )}
      </PortalStackedClients>
    </div>
  );
}

export default function PortalAplus2Page() {
  return (
    <Suspense>
      <PortalAplus2Content />
    </Suspense>
  );
}
