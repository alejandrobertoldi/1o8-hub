import { Suspense, type ReactNode } from "react";
import { PortalReportControlsProvider } from "@/components/reports/v2/use-portal-report-controls";

// Holds the resolved client + date range above the page segment so the client's
// date selection persists when switching between report pages, matching hub
// behavior (src/app/reports/layout.tsx).
//
// The Suspense boundary is required: the provider calls useSearchParams(), which
// Next.js will not allow without one. Hoisting it here is what lets the six
// section pages drop their own <Suspense> wrappers.
export default function PortalReportsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <PortalReportControlsProvider>{children}</PortalReportControlsProvider>
    </Suspense>
  );
}
