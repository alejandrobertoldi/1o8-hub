import Link from "next/link";
import { Construction } from "lucide-react";

/**
 * The client portal isn't built for 1o8 yet (2026-11-03): every /portal page
 * shows this instead. Turn it off with PORTAL_ENABLED in src/app/portal/layout.tsx.
 */
export function PortalUnderConstruction({ staff }: { staff: boolean }) {
  return (
    <div className="mf-no-print mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
        <Construction className="size-7" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Under construction</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">The 1o8 client portal is on its way</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {staff
          ? "Clients will see their reports, dashboards and approvals here. It opens once the client dashboard is ready."
          : "Your reports, dashboards and approvals will live here soon. Your 1o8 team will let you know when it's ready."}
      </p>
      {staff && (
        <Link href="/" className="mt-6 text-sm font-semibold text-brand hover:underline">
          Back to the Hub
        </Link>
      )}
    </div>
  );
}
